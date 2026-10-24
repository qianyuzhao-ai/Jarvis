import { sameWritingScope, type WritingScope } from '../../shared/writing-agent';
import { WritingBroker } from './writing-broker';
import { writingTools } from './writing-tools';
import { createHash, randomUUID } from 'node:crypto';
import { rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { AgentEvent, ChatMessage } from '../../shared/agent';
import {
  nearestThinkingLevel,
  type ProbeResult,
  type ProviderInput,
  type ThinkingLevel,
  type UpdateModelInput,
} from '../../shared/models';
import { listRemoteModels, type ModelStore, type ResolvedModel } from './model-store';
import { openAgent, replyFailure } from './runtime';
import { digitsPng, probeCode } from './probe-image';
import { AgentStore } from './store';
import { CanvasBroker } from './canvas-broker';
import { canvasTools } from './canvas-tools';
import { validateVisionInput } from './vision-input';
import type { VisionAsset } from '../../shared/canvas-vision';
import type { CanvasSnapshot } from '../../shared/canvas-agent';
import { SkillStore } from './skill-store';
import { JsonFile } from './json-file';
import { skillRuntime } from './skill-runtime';
import { skillCommand } from '../../shared/agent-skills';
import type { StoredSkill } from './skill-store';

export class AgentService {
  readonly skills: SkillStore;
  readonly canvas = new CanvasBroker();
  readonly writing = new WritingBroker();
  private seq = 0;
  private active: {
    id: string;
    sessionId: string;
    owner: number;
    cancelled: boolean;
    sdk?: AgentSession;
  } | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private operations = Promise.resolve();
  private testing = false;
  private testRun: { owner: number; cancelled: boolean; sdk?: AgentSession } | null = null;
  private completion: Promise<void> | null = null;
  private persistenceError = '';
  onChange: (event: AgentEvent) => void = () => {};
  constructor(
    readonly config: ModelStore,
    readonly store: AgentStore,
    private root: string,
  ) {
    this.skills = new SkillStore(new JsonFile(join(root, 'skills.json')));
  }
  snapshot(): AgentEvent {
    return {
      seq: this.seq,
      snapshot: {
        skills: this.skills.list(),
        models: this.config.view(),
        sessions: structuredClone(this.store.records.map((r) => r.view)),
        busySessionId: this.active?.sessionId ?? null,
      },
    };
  }
  private emit() {
    this.seq++;
    this.onChange(this.snapshot());
  }
  importSkill(directory: string) {
    return this.exclusive(async () => {
      this.idle();
      const result = await this.skills.importDirectory(directory);
      this.emit();
      return result;
    });
  }
  setSkillEnabled(id: string, enabled: boolean) {
    return this.exclusive(async () => {
      this.idle();
      const result = await this.skills.setEnabled(id, enabled);
      this.emit();
      return result;
    });
  }
  private changed() {
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.emit();
      }, 40);
  }
  private idle() {
    if (this.persistenceError) throw new Error(this.persistenceError);
    if (this.active || this.testing) throw new Error('请先停止或等待当前请求完成');
  }
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.operations.then(action);
    this.operations = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  create(projectId?: string, writingScope?: WritingScope) {
    if (projectId && writingScope) throw new Error('会话不能同时属于画布与文档');
    return this.exclusive(async () => {
      this.idle();
      const selected = this.config.resolve();
      const remembered = this.config.view().models.find((m) => m.id === selected.id);
      const level = nearestThinkingLevel(
        selected.thinkingLevels,
        remembered?.lastThinkingLevel ?? 'off',
      );
      const id = await this.store.create(selected, projectId, level, writingScope);
      this.emit();
      return id;
    });
  }
  /** Runs a model-settings change while no request is in flight and returns the new settings. */
  private configure(action: () => Promise<unknown>) {
    return this.exclusive(async () => {
      this.idle();
      await action();
      this.emit();
      return this.config.view();
    });
  }
  removeModel(id: string) {
    return this.configure(() => this.config.removeModel(id));
  }
  setDefaultModel(id: string) {
    return this.configure(() => this.config.setDefault(id));
  }
  saveProvider(input: ProviderInput) {
    return this.exclusive(async () => {
      this.idle();
      const id = await this.config.saveProvider(input);
      this.emit();
      return { id, settings: this.config.view() };
    });
  }
  setProviderModels(providerId: string, models: Parameters<ModelStore['setProviderModels']>[1]) {
    return this.configure(() => this.config.setProviderModels(providerId, models));
  }
  updateModel(input: UpdateModelInput) {
    return this.configure(() => this.config.updateModel(input));
  }
  removeProvider(id: string) {
    return this.configure(() => this.config.removeProvider(id));
  }
  /** Refuses image conversations on models that are not known to read images. */
  private assertVision(model: ResolvedModel, hasImages: boolean) {
    if (!hasImages || model.vision === 'supported') return;
    throw new Error(
      model.vision === 'unknown'
        ? `${model.name} 的图片能力未确认，请先检测或切换支持图片的模型`
        : `${model.name} 不支持图片，请切换支持图片的模型或新建文字对话`,
    );
  }
  rename(id: string, title: string) {
    return this.exclusive(async () => {
      const record = this.store.record(id);
      const before = record.view.title;
      record.view.title = title;
      try {
        await this.store.save();
      } catch (error) {
        record.view.title = before;
        throw error;
      }
      this.emit();
    });
  }
  deleteSession(id: string) {
    return this.exclusive(async () => {
      this.idle();
      this.store.record(id);
      const path = join(this.root, 'sessions', `${id}.jsonl`);
      const pending = join(this.root, 'sessions', `${id}.${randomUUID()}.deleted`);
      let moved = false;
      try {
        await rename(path, pending);
        moved = true;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      try {
        await this.store.remove(id);
      } catch (error) {
        if (moved) await rename(pending, path);
        throw error;
      }
      this.emit();
      if (moved) await unlink(pending);
    });
  }
  setModel(id: string, model: string) {
    return this.exclusive(async () => {
      this.idle();
      const r = this.store.record(id);
      const before = structuredClone(r);
      const selected = this.config.resolve(model);
      this.assertVision(
        selected,
        r.view.messages.some((message) => message.visionAssets?.length),
      );
      delete r.config;
      r.view.model = selected.modelId;
      r.view.modelId = model;
      r.view.contextWindow = selected.contextWindow;
      r.view.contextTokens = null;
      r.view.thinkingLevel = nearestThinkingLevel(
        selected.thinkingLevels,
        r.view.thinkingLevel ?? 'off',
      );
      try {
        await this.store.save();
      } catch (error) {
        Object.assign(r, before);
        throw error;
      }
      this.emit();
    });
  }
  setThinkingLevel(id: string, level: ThinkingLevel) {
    return this.exclusive(async () => {
      this.idle();
      const r = this.store.record(id);
      if (!r.view.modelId) throw new Error('请先为此对话选择一个已保存的模型');
      const selected = this.config.resolve(r.view.modelId);
      if (level !== 'off' && !selected.thinkingLevels.includes(level))
        throw new Error(`${selected.name} 不支持这个思考档位`);
      const before = r.view.thinkingLevel;
      r.view.thinkingLevel = level;
      try {
        await this.store.save();
      } catch (error) {
        r.view.thinkingLevel = before;
        throw error;
      }
      await this.config.rememberThinking(selected.id, level);
      this.emit();
    });
  }
  send(
    id: string,
    requestId: string,
    text: string,
    owner: number,
    canvas?: CanvasSnapshot,
    images: VisionAsset[] = [],
    writing?: WritingScope,
  ) {
    return this.exclusive(async () => {
      const skills = this.skills.snapshot();
      const command = skillCommand(text);
      if (text.startsWith('/') && (!command || !skills.some((s) => s.name === command.name)))
        throw new Error('未知或已停用的技能，请使用 / 重新选择');
      const view = this.store.record(id).view;
      if ((canvas && writing) || !sameWritingScope(view.writingScope, writing))
        throw new Error('写作会话与当前文档不匹配');
      const scope = view.projectId;
      if (scope !== canvas?.projectId) throw new Error('画布会话与项目不匹配');
      validateVisionInput(images, canvas, this.store.record(id).view);
      if (canvas && JSON.stringify(canvas).length > 250000) throw new Error('画布上下文过大');
      const prior = this.store.requests.find((r) => r.id === requestId);
      const inputHash = createHash('sha256')
        .update(JSON.stringify({ canvas, images, writing }))
        .digest('hex');
      if (prior) {
        if (
          prior.sessionId !== id ||
          prior.text !== text ||
          (prior.inputHash
            ? prior.inputHash !== inputHash
            : !!canvas || !!writing || images.length > 0)
        )
          throw new Error('同一请求标识不能用于不同消息');
        return prior.runId;
      }
      this.idle();
      const record = this.store.record(id);
      if (!record.view.modelId) throw new Error('此对话使用旧配置，请重新选择一个已保存的模型');
      const current = this.config.resolve(record.view.modelId);
      delete record.config;
      record.view.model = current.modelId;
      record.view.contextWindow = current.contextWindow;
      this.assertVision(
        current,
        images.length > 0 || record.view.messages.some((message) => message.visionAssets?.length),
      );
      const thinking = nearestThinkingLevel(
        current.thinkingLevels,
        record.view.thinkingLevel ?? 'off',
      );
      if (record.view.messages.reduce((sum, m) => sum + m.text.length, 0) + text.length > 60000)
        throw new Error('这段对话较长，请新建对话后继续，历史不会删除');
      const run = { id: randomUUID(), sessionId: id, owner, cancelled: false };
      const before = structuredClone(record.view);
      const user: ChatMessage = { id: randomUUID(), role: 'user', text, status: 'succeeded' };
      const assistant: ChatMessage = {
        id: randomUUID(),
        role: 'assistant',
        text: '',
        status: 'running',
      };
      if (canvas)
        user.canvasReferences = canvas.nodes
          .filter((n) => canvas.selectedIds.includes(n.id))
          .map(({ id, name }) => ({ id, name }));
      if (images.length)
        user.visionAssets = images.map(({ nodeId, name, kind, time, preview }) => ({
          nodeId,
          name,
          kind,
          time,
          preview,
        }));
      record.view.messages.push(user, assistant);
      record.view.runId = run.id;
      record.view.updatedAt = Date.now();
      if (record.view.messages.length === 2) record.view.title = text.slice(0, 36);
      this.store.requests.push({ id: requestId, runId: run.id, sessionId: id, text, inputHash });
      this.active = run;
      try {
        await this.store.save();
      } catch (error) {
        record.view = before;
        this.store.requests.pop();
        this.active = null;
        throw error;
      }
      this.emit();
      this.completion = this.perform(
        run,
        current,
        thinking,
        assistant,
        text,
        canvas,
        images,
        skills,
        writing,
      );
      return run.id;
    });
  }
  private async perform(
    run: NonNullable<AgentService['active']>,
    model: ResolvedModel,
    thinking: ThinkingLevel,
    output: ChatMessage,
    text: string,
    canvas?: CanvasSnapshot,
    images: VisionAsset[] = [],
    skills: StoredSkill[] = [],
    writing?: WritingScope,
  ) {
    let stop: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let checkpoint: ReturnType<typeof setInterval> | undefined;
    try {
      const skill = skillRuntime(skills, text, output, () => this.changed());
      const tools = canvas
        ? canvasTools(canvas, this.canvas, run.owner, run.id, output, () => this.changed())
        : writing
          ? writingTools(writing, this.writing, run.owner, run.id, output, () => this.changed())
          : [];
      const runtime = await openAgent(
        this.root,
        run.sessionId,
        model,
        false,
        canvas
          ? {
              tools,
              context: `当前项目 ${canvas.projectId}，本次引用节点 ${canvas.selectedIds.join(', ') || '未选择'}。`,
            }
          : writing
            ? {
                tools,
                kind: 'writing',
                context: `当前文档：${writing.path}。只能读写这一个文档的编辑器缓冲区，不能保存磁盘。`,
              }
            : undefined,
        skill,
        thinking,
      );
      run.sdk = runtime.session;
      if (run.cancelled) {
        output.status = 'cancelled';
        return;
      }
      timeout = setTimeout(() => {
        output.error = '请求超时，已保留部分回复';
        run.cancelled = true;
        void runtime.session.abort();
      }, 120000);
      checkpoint = setInterval(() => {
        void this.store.save().catch(() => {
          this.persistenceError = '会话保存失败，请重启应用后检查本地存储';
          output.error = this.persistenceError;
          run.cancelled = true;
          void runtime.session.abort();
          this.changed();
        });
      }, 1000);
      stop = runtime.session.subscribe((event) => {
        if (run.cancelled) return;
        if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
          output.text += event.assistantMessageEvent.delta;
          if (output.text.length > 200000) {
            output.error = '回复超过长度上限，已停止';
            run.cancelled = true;
            void runtime.session.abort();
          }
          this.changed();
        }
      });
      const roster = images.map(({ nodeId, name, kind, time }, index) => ({
        image: index + 1,
        nodeId,
        name,
        kind,
        time,
      }));
      await runtime.session.prompt(
        images.length
          ? skill.prompt + '\n\n附图来源清单（数据）：' + JSON.stringify(roster)
          : skill.prompt,
        {
          expandPromptTemplates: false,
          images: images.map(({ data, mimeType }) => ({ type: 'image' as const, data, mimeType })),
        },
      );
      const last = runtime.session.messages.filter((m) => m.role === 'assistant').at(-1);
      if (run.cancelled) output.status = 'cancelled';
      else if (!last || !['stop', 'length'].includes(last.stopReason) || !output.text.trim()) {
        output.status = 'failed';
        output.error = replyFailure(runtime.httpStatus());
      } else if (last.stopReason === 'length') {
        output.status = 'interrupted';
        output.error = '达到输出上限，已保留部分回复';
      } else output.status = 'succeeded';
      const usage = last?.usage;
      const tokens = usage
        ? usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite
        : 0;
      this.store.record(run.sessionId).view.contextTokens =
        last && ['stop', 'length'].includes(last.stopReason) && tokens > 0 ? tokens : null;
    } catch {
      output.status = run.cancelled ? 'cancelled' : 'failed';
      output.error ??= '模型连接失败或回复中断，请检查模型服务后重新发送';
    } finally {
      output.completedAt = Date.now();
      clearTimeout(timeout);
      clearInterval(checkpoint);
      stop?.();
      run.sdk?.dispose();
      this.store.record(run.sessionId).view.runId = null;
      try {
        await this.store.save();
      } catch {
        this.persistenceError = '会话保存失败，请重启应用后检查本地存储';
        output.error = this.persistenceError;
        output.status = 'failed';
      }
      if (this.active === run) this.active = null;
      this.emit();
    }
  }
  async cancel(id: string, owner?: number) {
    const run = this.active;
    if (!run || run.id !== id) return;
    if (owner !== undefined && run.owner !== owner) throw new Error('不能停止其他窗口的请求');
    run.cancelled = true;
    await run.sdk?.abort();
    await this.completion;
  }
  async cancelOwner(owner: number) {
    if (this.active?.owner === owner) await this.cancel(this.active.id, owner);
    if (this.testRun?.owner === owner) {
      this.testRun.cancelled = true;
      await this.testRun.sdk?.abort();
    }
  }
  get isBusy() {
    return !!this.active || this.testing;
  }
  async shutdown() {
    if (this.active) await this.cancel(this.active.id);
    if (this.testRun) {
      this.testRun.cancelled = true;
      await this.testRun.sdk?.abort();
    }
    await this.operations;
    clearTimeout(this.timer);
  }
  /** Built-in providers answer a short prompt; custom ones list models unless a model ID is given. */
  testProvider(input: ProviderInput, owner: number, modelId?: string) {
    return this.exclusive(async () => {
      this.idle();
      if (input.kind === 'custom' && !modelId) {
        const { apiKey } = this.config.connection(input);
        const listed = await listRemoteModels(input.baseUrl, apiKey);
        return `连接成功 · 获取到 ${listed.length} 个模型`;
      }
      const model = this.config.transient(input, modelId);
      await this.ask(model, owner, '仅回复 OK');
      return `连接成功 · ${model.name} 已回复`;
    });
  }
  fetchProviderModels(input: ProviderInput) {
    return this.exclusive(async () => this.config.candidates(input));
  }
  /**
   * Sends a small image with four random digits and asks for them back. A correct answer means
   * the model reads images; a wrong answer or an explicit rejection means it does not; network
   * failures leave the capability unconfirmed.
   */
  probeVision(id: string, owner: number) {
    return this.exclusive(async (): Promise<ProbeResult> => {
      this.idle();
      const model = this.config.resolve(id);
      if (model.kind === 'builtin') throw new Error('内置服务商的模型能力来自模型目录，无需检测');
      const code = probeCode();
      const image = {
        type: 'image' as const,
        data: digitsPng(code).toString('base64'),
        mimeType: 'image/png',
      };
      let reply: string;
      try {
        reply = await this.ask(
          { ...model, vision: 'supported', thinkingLevels: [] },
          owner,
          '图片中是一个 4 位数字。只回复这 4 位数字，不要回复其他内容。',
          [image],
        );
      } catch (error) {
        const status = error instanceof ProbeError ? error.status : 0;
        if ([400, 415, 422].includes(status)) {
          await this.config.recordProbe(id, 'unsupported');
          this.emit();
          return {
            vision: 'unsupported',
            message: `服务拒绝了图片输入（${status}），已标为不支持图片`,
          };
        }
        return { vision: 'unknown', message: '检测请求失败或超时，图片能力仍未确认，可稍后重试' };
      }
      const supported = reply.replace(/\s/g, '').includes(code);
      await this.config.recordProbe(id, supported ? 'supported' : 'unsupported');
      this.emit();
      return supported
        ? { vision: 'supported', message: `检测通过：模型正确读出了测试图片中的数字 ${code}` }
        : {
            vision: 'unsupported',
            message: `模型没有读出测试图片中的数字 ${code}，已标为不支持图片`,
          };
    });
  }
  /** Runs one transient prompt for tests and probes, returning the reply text. */
  private async ask(
    model: ResolvedModel,
    owner: number,
    prompt: string,
    images: { type: 'image'; data: string; mimeType: string }[] = [],
  ) {
    this.testing = true;
    const run = { owner, cancelled: false, sdk: undefined as AgentSession | undefined };
    this.testRun = run;
    let sdk: AgentSession | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const runtime = await openAgent(this.root, randomUUID(), model, true);
      sdk = runtime.session;
      run.sdk = sdk;
      if (run.cancelled) throw new Error('连接测试已取消');
      timeout = setTimeout(() => {
        void sdk?.abort();
      }, 20000);
      try {
        await sdk.prompt(prompt, { expandPromptTemplates: false, images });
      } catch {
        throw new ProbeError(replyFailure(runtime.httpStatus()), runtime.httpStatus());
      }
      const last = sdk.messages.filter((m) => m.role === 'assistant').at(-1);
      const text =
        last?.content
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('')
          .trim() ?? '';
      if (!last || last.stopReason !== 'stop' || !text)
        throw new ProbeError(replyFailure(runtime.httpStatus()), runtime.httpStatus());
      return text;
    } finally {
      clearTimeout(timeout);
      sdk?.dispose();
      this.testing = false;
      this.testRun = null;
    }
  }
}

class ProbeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
