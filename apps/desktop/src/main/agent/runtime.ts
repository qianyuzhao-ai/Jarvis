import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Usage } from '@earendil-works/pi-ai';
import type { ThinkingLevel } from '../../shared/models';
import type { CapabilityPack } from './kernel/capability';
import { createPolicy, type PolicyOptions } from './kernel/policy';
import type { ResolvedModel } from './model-store';
import { chatPack } from './packs/chat';

/** Local protection when a custom model's context window is unknown; no usage percentage is shown for it. */
export const UNKNOWN_CONTEXT_WINDOW = 128_000;
/** Internal ceiling used for thinking budgets when the output limit is automatic. */
const AUTO_MAX_TOKENS = 32_768;
/** Anthropic Messages requires max_tokens, so "automatic" falls back to this value there. */
const ANTHROPIC_AUTO_MAX_TOKENS = 8192;

export interface AgentOptions {
  /** Keeps the history in memory only (Coordinator rounds, connection tests and probes). */
  transient?: boolean;
  /** Where a persistent session keeps its model context, `<dir>/<id>.jsonl`. */
  sessionDir?: string;
  packs?: CapabilityPack[];
  /** Extra system prompt text after the packs' prompts (project instructions, memory index). */
  context?: string;
  thinkingLevel?: ThinkingLevel;
  /** How tool calls are decided; without `confirm`, irreversible tools are blocked. */
  policy?: Omit<PolicyOptions, 'maxCalls'>;
  /** Waits for a concurrency slot before each model request; the returned function frees it. */
  slot?: (signal?: AbortSignal) => Promise<() => void>;
  /** Model requests allowed in one round with tools; a round without tools makes one. */
  maxRequests?: number;
  /** Tool calls allowed in one round, across all packs. */
  maxToolCalls?: number;
  /**
   * Called once per model request that reported tokens, compaction summaries included. `priced`
   * is false when the model has no price (custom relays), so its cost is unknown rather than 0.
   */
  onUsage?: (usage: Usage, priced: boolean) => void;
}

/**
 * Opens a Pi session whose system prompt and tools come only from `packs`; built-in tools,
 * external extensions, skills discovery and context files stay off. Every tool call passes the
 * policy first, which asks `approve` about `confirm` tools. Context compaction is on; its summary
 * request does not count toward `maxRequests`.
 */
export async function openAgent(
  root: string,
  id: string,
  model: ResolvedModel,
  {
    transient = false,
    sessionDir,
    packs = [chatPack()],
    context = '',
    thinkingLevel = 'off',
    policy,
    slot,
    maxRequests = 8,
    maxToolCalls,
    onUsage,
  }: AgentOptions = {},
) {
  const tools = packs.flatMap((pack) => pack.tools);
  const sdk = await import('@earendil-works/pi-coding-agent');
  const { InMemoryCredentialStore, createAssistantMessageEventStream } = await import(
    '@earendil-works/pi-ai'
  );
  const cwd = join(root, 'workspace');
  const dir = sessionDir ?? join(root, 'sessions');
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const models = await sdk.ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const key = model.apiKey;
  const autoLimit = model.kind === 'custom' && !model.maxTokens;
  let provider: string;
  if (model.kind === 'custom') {
    if (!model.baseUrl || !model.api) throw new Error('自定义接口缺少地址或协议');
    provider = 'jarvis-custom';
    models.registerProvider(provider, {
      name: model.providerName,
      baseUrl: model.baseUrl,
      api: model.api,
      models: [
        {
          id: model.modelId,
          name: model.name,
          reasoning: model.thinkingLevels.length > 0,
          ...(model.thinkingLevelMap ? { thinkingLevelMap: model.thinkingLevelMap } : {}),
          // Text-only packs (writing) never send images; elsewhere only vision-capable models accept them.
          input:
            model.vision === 'supported' && !packs.some((pack) => pack.textOnly)
              ? ['text', 'image']
              : ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: model.contextWindow ?? UNKNOWN_CONTEXT_WINDOW,
          maxTokens:
            model.maxTokens ??
            (model.api === 'anthropic-messages' ? ANTHROPIC_AUTO_MAX_TOKENS : AUTO_MAX_TOKENS),
        },
      ],
    });
  } else {
    if (!model.sdkProvider) throw new Error('服务商不存在');
    provider = model.sdkProvider;
    if (!key) throw new Error(`请填写 ${model.providerName} API Key`);
  }
  // A runtime Key always wins over environment variables such as DEEPSEEK_API_KEY.
  await models.setRuntimeApiKey(provider, key || 'jarvis-no-auth');
  const selectedModel = models.getModel(provider, model.modelId);
  if (!selectedModel) throw new Error('当前 SDK 不支持此模型，请选择可用模型');
  const { input, output, cacheRead, cacheWrite } = selectedModel.cost;
  const priced = model.kind !== 'custom' && input + output + cacheRead + cacheWrite > 0;
  const settings = sdk.SettingsManager.inMemory({
    retry: { enabled: false },
    compaction: { enabled: true },
  });
  const loader = new sdk.DefaultResourceLoader({
    cwd,
    agentDir: root,
    settingsManager: settings,
    noExtensions: true,
    extensionFactories: [
      {
        name: 'jarvis-policy',
        factory: createPolicy(packs, { ...policy, maxCalls: maxToolCalls }).factory,
        hidden: true,
      },
    ],
    disabledBuiltinExtensions: ['mcp', 'codemode'],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: packs.map((pack) => pack.prompt).join('') + context,
  });
  await loader.reload();
  const manager = transient
    ? sdk.SessionManager.inMemory(cwd)
    : sdk.SessionManager.open(join(dir, `${id}.jsonl`), dir, cwd);
  const { session } = await sdk.createAgentSession({
    cwd,
    agentDir: root,
    modelRuntime: models,
    model: selectedModel,
    thinkingLevel: thinkingLevel as never,
    tools: tools.map((t) => t.name),
    noTools: tools.length ? 'builtin' : 'all',
    customTools: tools,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
  });
  const expected = tools.map((t) => t.name);
  if (
    session.getActiveToolNames().some((name) => !expected.includes(name)) ||
    expected.some((name) => !session.getActiveToolNames().includes(name))
  ) {
    session.dispose();
    throw new Error('对话工具边界校验失败');
  }
  let httpStatus = 0;
  const stream = session.agent.streamFunction;
  if (!tools.length) session.agent.finishTurn = async () => ({ action: 'end' });
  let requests = 0;
  let compacting = false;
  session.subscribe((event) => {
    if (event.type === 'compaction_start') compacting = true;
    if (event.type === 'compaction_end') compacting = false;
  });
  session.agent.streamFunction = (m, context, options) => {
    if (
      !m.input.includes('image') &&
      context.messages.some(
        (message) =>
          Array.isArray(message.content) && message.content.some((part) => part.type === 'image'),
      )
    )
      throw new Error('所选模型不支持图片输入，请切换支持图片的模型或新建文字对话');
    if (!compacting && ++requests > (tools.length ? maxRequests : 1))
      throw new Error('本轮请求次数已达上限');
    const request = () =>
      stream(m, context, {
        ...options,
        maxRetries: 0,
        ...(autoLimit && m.api !== 'anthropic-messages'
          ? {
              onPayload: (payload: unknown) => withoutOutputLimit(payload),
            }
          : {}),
        transport: 'sse',
        fetch: async (url, init) => {
          const request = new Request(url, init);
          if (!key)
            for (const header of ['authorization', 'x-api-key', 'x-goog-api-key'])
              request.headers.delete(header);
          const response = await fetch(request, { redirect: 'error' });
          httpStatus = response.status;
          return response;
        },
        onResponse: (response) => {
          httpStatus = response.status;
        },
      });
    const result = createAssistantMessageEventStream();
    void (async () => {
      let release: (() => void) | undefined;
      try {
        release = await slot?.(options?.signal);
        for await (const event of await request()) {
          if (event.type === 'error')
            event.error.errorMessage =
              event.reason === 'aborted' ? '请求已停止' : replyFailure(httpStatus);
          if (event.type === 'done' || event.type === 'error') {
            const { usage } = event.type === 'done' ? event.message : event.error;
            if (usage.totalTokens || usage.input + usage.output) onUsage?.(usage, priced);
          }
          result.push(event);
        }
      } catch {
        const aborted = !!options?.signal?.aborted;
        result.push({
          type: 'error',
          reason: aborted ? 'aborted' : 'error',
          error: {
            role: 'assistant',
            content: [],
            api: m.api,
            provider: m.provider,
            model: m.id,
            timestamp: Date.now(),
            stopReason: 'error',
            errorMessage: aborted ? '请求已停止' : replyFailure(httpStatus),
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          },
        });
      } finally {
        release?.();
        result.end();
      }
    })();
    return result;
  };
  return { session, httpStatus: () => httpStatus };
}
/** Removes the output limit so the relay applies its own default ("automatic"). */
export function withoutOutputLimit(payload: unknown) {
  if (!payload || typeof payload !== 'object') return payload;
  const next: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  delete next.max_tokens;
  delete next.max_completion_tokens;
  delete next.max_output_tokens;
  const config = next.generationConfig;
  if (config && typeof config === 'object') {
    const { maxOutputTokens: _drop, ...rest } = config as Record<string, unknown>;
    next.generationConfig = rest;
  }
  return next;
}
export function replyFailure(status: number) {
  return status >= 400
    ? `模型服务请求失败（${status}），请检查 Key、协议和模型`
    : '模型回复失败或连接中断，请检查模型服务后重新发送';
}
