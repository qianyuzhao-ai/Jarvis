import { sameWritingScope, type WritingScope } from '../../shared/writing-agent';
import { WritingBroker } from './writing-broker';
import { writingTools } from './writing-tools';
import { createHash, randomUUID } from 'node:crypto';
import { rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { AgentEvent, ChatMessage, RelayInput } from '../../shared/agent';
import { RelayConfiguration } from './configuration';
import { openAgent, replyFailure } from './runtime';
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
    readonly config: RelayConfiguration,
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
      const id = await this.store.create(
        selected.config,
        projectId,
        selected.modelId,
        writingScope,
      );
      this.emit();
      return id;
    });
  }
  saveConfiguration(input: RelayInput) {
    return this.exclusive(async () => {
      this.idle();
      return this.config.save(input);
    });
  }
  removeModel(id: string) {
    return this.exclusive(async () => {
      this.idle();
      return this.config.remove(id);
    });
  }
  setDefaultModel(id: string) {
    return this.exclusive(async () => {
      this.idle();
      return this.config.setDefault(id);
    });
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
      const selected = this.config.resolveModel(model);
      if (
        selected.config.provider === 'deepseek' &&
        selected.config.model === 'deepseek-v4-pro' &&
        r.view.messages.some((message) => message.visionAssets?.length)
      )
        throw new Error('DeepSeek Pro 不支持当前对话中的图片，请使用 Flash 或新建文字对话');
      r.config = selected.config;
      r.view.model = selected.config.model;
      r.view.modelId = model;
      r.view.contextWindow = selected.config.contextWindow;
      r.view.contextTokens = null;
      try {
        await this.store.save();
      } catch (error) {
        Object.assign(r, before);
        throw error;
      }
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
      const record = this.store.record(id),
        current = record.view.modelId
          ? this.config.resolveModel(record.view.modelId)
          : this.config.resolve();
      if (
        !record.view.modelId &&
        (record.config.baseUrl !== current.config.baseUrl ||
          record.config.api !== current.config.api ||
          (record.config.provider ?? 'relay') !== (current.config.provider ?? 'relay'))
      )
        throw new Error('此对话使用旧配置，请重新选择一个已保存的模型');
      if (record.view.modelId) {
        record.config = current.config;
        record.view.model = current.config.model;
        record.view.contextWindow = current.config.contextWindow;
      }
      if (
        record.config.provider === 'deepseek' &&
        record.config.model === 'deepseek-v4-pro' &&
        (images.length || record.view.messages.some((message) => message.visionAssets?.length))
      )
        throw new Error('DeepSeek Pro 不支持图片，请使用 Flash 或新建文字对话');
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
        record.config,
        current.apiKey,
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
    config: Parameters<typeof openAgent>[2],
    key: string,
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
        config,
        key,
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
  async test(input: RelayInput, owner: number) {
    return this.exclusive(async () => {
      this.idle();
      this.testing = true;
      const run = { owner, cancelled: false, sdk: undefined as AgentSession | undefined };
      this.testRun = run;
      let sdk: AgentSession | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const c = this.config.resolve(input);
        const runtime = await openAgent(this.root, randomUUID(), c.config, c.apiKey, true);
        sdk = runtime.session;
        run.sdk = sdk;
        if (run.cancelled) throw new Error('连接测试已取消');
        timeout = setTimeout(() => {
          void sdk?.abort();
        }, 20000);
        await sdk.prompt('仅回复 OK', { expandPromptTemplates: false });
        const last = sdk.messages.filter((m) => m.role === 'assistant').at(-1);
        if (
          !last ||
          last.stopReason !== 'stop' ||
          !last.content.some((b) => b.type === 'text' && b.text.trim())
        )
          throw new Error(replyFailure(runtime.httpStatus()));
        return '连接成功 · 已收到流式回复';
      } finally {
        clearTimeout(timeout);
        sdk?.dispose();
        this.testing = false;
        this.testRun = null;
      }
    });
  }
}
