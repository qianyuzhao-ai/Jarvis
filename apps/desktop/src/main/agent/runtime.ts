import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { RelayConfig } from '../../shared/agent';

export async function openAgent(
  root: string,
  id: string,
  config: RelayConfig,
  key: string,
  transient = false,
) {
  const sdk = await import('@earendil-works/pi-coding-agent');
  const { InMemoryCredentialStore, createAssistantMessageEventStream } = await import(
    '@earendil-works/pi-ai'
  );
  const cwd = join(root, 'workspace');
  const dir = join(root, 'sessions');
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const models = await sdk.ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  models.registerProvider('jarvis-relay', {
    name: config.name,
    baseUrl: config.baseUrl,
    api: config.api,
    models: [
      {
        id: config.model,
        name: config.model,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: config.contextWindow ?? 32768,
        maxTokens: config.maxTokens,
      },
    ],
  });
  await models.setRuntimeApiKey('jarvis-relay', key || 'jarvis-no-auth');
  const model = models.getModel('jarvis-relay', config.model);
  if (!model) throw new Error('无法初始化中转站模型');
  const settings = sdk.SettingsManager.inMemory({
    retry: { enabled: false },
    compaction: { enabled: false },
  });
  const loader = new sdk.DefaultResourceLoader({
    cwd,
    agentDir: root,
    settingsManager: settings,
    noExtensions: true,
    disabledBuiltinExtensions: ['mcp', 'codemode'],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt:
      '你是 Jarvis，使用中文与用户交流。本轮只提供文字对话，没有文件、Shell、网络浏览、画布操作或生成工具。不要声称执行了没有工具回执的操作。',
  });
  await loader.reload();
  const manager = transient
    ? sdk.SessionManager.inMemory(cwd)
    : sdk.SessionManager.open(join(dir, `${id}.jsonl`), dir, cwd);
  const { session } = await sdk.createAgentSession({
    cwd,
    agentDir: root,
    modelRuntime: models,
    model,
    thinkingLevel: 'off',
    tools: [],
    noTools: 'all',
    customTools: [],
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
  });
  if (session.getActiveToolNames().length) {
    session.dispose();
    throw new Error('对话工具边界校验失败');
  }
  let httpStatus = 0;
  const stream = session.agent.streamFunction;
  session.agent.finishTurn = async () => ({ action: 'end' });
  session.agent.streamFunction = (m, context, options) => {
    const source = stream(m, context, {
      ...options,
      maxTokens: config.maxTokens,
      maxRetries: 0,
      transport: 'sse',
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        if (!key) headers.delete('authorization');
        return fetch(url, { ...init, headers, redirect: 'error' });
      },
      onResponse: (response) => {
        httpStatus = response.status;
      },
    });
    const result = createAssistantMessageEventStream();
    void (async () => {
      try {
        for await (const event of await source) {
          if (event.type === 'error')
            event.error.errorMessage =
              event.reason === 'aborted' ? '请求已停止' : replyFailure(httpStatus);
          result.push(event);
        }
      } catch {
        result.push({
          type: 'error',
          reason: 'error',
          error: {
            role: 'assistant',
            content: [],
            api: m.api,
            provider: m.provider,
            model: m.id,
            timestamp: Date.now(),
            stopReason: 'error',
            errorMessage: replyFailure(httpStatus),
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
        result.end();
      }
    })();
    return result;
  };
  return { session, httpStatus: () => httpStatus };
}
export function replyFailure(status: number) {
  return status >= 400
    ? `中转站请求失败（${status}），请检查 Key、协议和模型`
    : '模型回复失败或连接中断，请检查中转站后重新发送';
}
