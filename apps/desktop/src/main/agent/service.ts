import { sameWritingScope, type WritingScope } from '../../shared/writing-agent';
import { WritingBroker } from './writing-broker';
import { writingPack } from './packs/writing';
import { createHash, randomUUID } from 'node:crypto';
import { rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { AgentEvent, ChatMessage, RunState, SessionEvent } from '../../shared/agent';
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
import { canvasPack } from './packs/canvas';
import { validateVisionInput } from './vision-input';
import type { VisionAsset } from '../../shared/canvas-vision';
import type { CanvasSnapshot } from '../../shared/canvas-agent';
import { SkillStore } from './skill-store';
import { JsonFile } from './json-file';
import { skillsPack } from './packs/skills';
import { chatPack } from './packs/chat';
import { ApprovalQueue } from './kernel/approval';
import { Ledger } from './kernel/ledger';
import type { UndoRequest } from '../../shared/agent-ledger';
import type { Approver } from './kernel/policy';
import type { ToolContext } from './kernel/capability';
import { Scheduler } from './kernel/scheduler';
import { AgentSettingsStore } from './settings';
import { skillCommand } from '../../shared/agent-skills';
import type { StoredSkill } from './skill-store';

/** Per-round limits by role: the main Agent coordinates longer rounds than space sub-agents. */
const ROUND_LIMITS = {
  main: { requests: 24, timeout: 10 * 60_000 },
  space: { requests: 12, timeout: 5 * 60_000 },
} as const;
const MAX_TOOL_CALLS = 40;

type Run = {
  id: string;
  sessionId: string;
  owner: number;
  cancelled: boolean;
  sdk?: AgentSession;
  done?: Promise<void>;
};
/** A message sent while its conversation was replying; it starts when the reply ends. */
type Pending = {
  runId: string;
  owner: number;
  user: ChatMessage;
  text: string;
  canvas?: CanvasSnapshot;
  images: VisionAsset[];
  writing?: WritingScope;
};

export class AgentService {
  readonly skills: SkillStore;
  readonly canvas = new CanvasBroker();
  readonly writing = new WritingBroker();
  readonly approvals = new ApprovalQueue();
  readonly ledger: Ledger;
  readonly scheduler = new Scheduler();
  readonly settings: AgentSettingsStore;
  private seq = 0;
  /** The round each replying conversation is running, by conversation. */
  private runs = new Map<string, Run>();
  private queues = new Map<string, Pending[]>();
  private timer?: ReturnType<typeof setTimeout>;
  private operations = Promise.resolve();
  private testing = false;
  private testRun: { owner: number; cancelled: boolean; sdk?: AgentSession } | null = null;
  private persistenceError = '';
  onChange: (event: AgentEvent) => void = () => {};
  onSessionChange: (event: SessionEvent) => void = () => {};
  /** Messages changed since the last session push, by conversation. */
  private dirty = new Map<string, Set<string>>();
  constructor(
    readonly config: ModelStore,
    readonly store: AgentStore,
    private root: string,
  ) {
    this.skills = new SkillStore(new JsonFile(join(root, 'skills.json')));
    this.ledger = new Ledger(join(root, 'ledger'));
    this.settings = new AgentSettingsStore(new JsonFile(join(root, 'settings.json')));
    this.ledger.onError = () => {
      this.persistenceError = '操作记录保存失败，请重启应用后检查本地存储';
      this.emit();
    };
    this.scheduler.onChange = () => this.emit();
  }
  snapshot(): AgentEvent {
    return {
      seq: this.seq,
      snapshot: {
        skills: this.skills.list(),
        models: this.config.view(),
        sessions: structuredClone(this.store.records.map((r) => this.store.meta(r.view))),
        runs: this.runStates(),
        currentSegmentId: this.currentSegment(),
      },
    };
  }
  /**
   * The home conversation whose latest round started last. A round starts when a user message is
   * sent (or a queued one begins), and `updatedAt` changes only then.
   */
  currentSegment() {
    let current: { id: string; at: number } | null = null;
    for (const { view } of this.store.records)
      if (
        view.agent.kind === 'main' &&
        view.messages.some((m) => m.role === 'user') &&
        (!current || view.updatedAt > current.at)
      )
        current = { id: view.id, at: view.updatedAt };
    return current?.id ?? null;
  }
  private runStates() {
    const waiting = this.scheduler.waiting();
    const states: Record<string, RunState> = {};
    for (const id of this.runs.keys()) states[id] = waiting.has(id) ? 'waiting' : 'running';
    return states;
  }
  async loadSettings() {
    await this.settings.initialize();
    this.scheduler.setLimit(this.settings.get().concurrency);
  }
  /**
   * Changes how many model requests may stream at once. Requests already streaming finish; new
   * ones follow the new limit.
   */
  async setConcurrency(concurrency: number) {
    const settings = await this.settings.update({ concurrency });
    this.scheduler.setLimit(settings.concurrency);
    return settings;
  }
  /** One conversation with its messages; later session events carry a larger `seq`. */
  session(id: string) {
    const { view } = this.store.record(id);
    return { seq: this.seq, session: structuredClone({ ...view, ...this.store.meta(view) }) };
  }
  /** Pushes pending message changes first, so metadata never runs ahead of its messages. */
  private emit() {
    this.flush();
    this.seq++;
    this.onChange(this.snapshot());
  }
  private flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const dirty = this.dirty;
    this.dirty = new Map();
    for (const [sessionId, ids] of dirty) {
      const record = this.store.records.find((r) => r.view.id === sessionId);
      if (!record) continue;
      const messages = record.view.messages.filter((m) => ids.has(m.id));
      if (!messages.length) continue;
      this.seq++;
      this.onSessionChange({ seq: this.seq, sessionId, messages: structuredClone(messages) });
    }
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
  /** Schedules a push of the given messages; pushes are grouped per 40 ms. */
  private changed(sessionId: string, ...messageIds: string[]) {
    const ids = this.dirty.get(sessionId) ?? new Set<string>();
    for (const id of messageIds) ids.add(id);
    this.dirty.set(sessionId, ids);
    this.timer ??= setTimeout(() => this.flush(), 40);
  }
  /** For changes that affect every conversation, such as models and skills. */
  private idle() {
    if (this.persistenceError) throw new Error(this.persistenceError);
    if (this.runs.size || this.testing) throw new Error('请先停止或等待当前请求完成');
  }
  /** For changes to one conversation; other conversations may keep replying. */
  private sessionIdle(id: string) {
    if (this.persistenceError) throw new Error(this.persistenceError);
    if (this.runs.has(id)) throw new Error('请先停止或等待这个对话的回复完成');
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
      if (this.persistenceError) throw new Error(this.persistenceError);
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
        await this.store.saveIndex();
      } catch (error) {
        record.view.title = before;
        throw error;
      }
      this.emit();
    });
  }
  deleteSession(id: string) {
    return this.exclusive(async () => {
      this.sessionIdle(id);
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
      // A leftover file is harmless: only files of existing conversations are loaded.
      await this.ledger.remove(id).catch(() => {});
    });
  }
  /**
   * Undoes one recorded change through the window that owns its data. Changes made before the
   * ledger existed have no entry; the window still checks they are its latest change.
   */
  undo(owner: number, request: UndoRequest) {
    return this.exclusive(async () => {
      if (this.persistenceError) throw new Error(this.persistenceError);
      const target = (view: { projectId?: string; writingScope?: WritingScope }) =>
        'projectId' in request
          ? view.projectId === request.projectId
          : sameWritingScope(view.writingScope, request.writingScope);
      if (this.store.records.some((r) => this.runs.has(r.view.id) && target(r.view)))
        throw new Error('请先停止或等待正在修改这里的回复完成');
      const entry = this.ledger.find(request.transactionId);
      if (entry?.status === 'undone') throw new Error('这次修改已撤销');
      const runId = entry?.runId ?? randomUUID();
      const command = { type: 'undo' as const, transactionId: request.transactionId };
      const reply =
        'projectId' in request
          ? await this.canvas.request(owner, {
              runId,
              projectId: request.projectId,
              expectedRevision: '',
              command,
            })
          : await this.writing.request(owner, { runId, scope: request.writingScope, command });
      if (!reply.ok) throw new Error(reply.error || '撤销失败');
      if (entry) this.ledger.markUndone(entry.id);
      this.emit();
    });
  }
  setModel(id: string, model: string) {
    return this.exclusive(async () => {
      this.sessionIdle(id);
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
        await this.store.saveIndex();
      } catch (error) {
        Object.assign(r, before);
        throw error;
      }
      this.emit();
    });
  }
  setThinkingLevel(id: string, level: ThinkingLevel) {
    return this.exclusive(async () => {
      this.sessionIdle(id);
      const r = this.store.record(id);
      if (!r.view.modelId) throw new Error('请先为此对话选择一个已保存的模型');
      const selected = this.config.resolve(r.view.modelId);
      if (level !== 'off' && !selected.thinkingLevels.includes(level))
        throw new Error(`${selected.name} 不支持这个思考档位`);
      const before = r.view.thinkingLevel;
      r.view.thinkingLevel = level;
      try {
        await this.store.saveIndex();
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
      if (this.persistenceError) throw new Error(this.persistenceError);
      if (this.testing) throw new Error('请先等待连接测试完成');
      const record = this.store.record(id);
      if (!record.view.modelId) throw new Error('此对话使用旧配置，请重新选择一个已保存的模型');
      this.assertVision(
        this.config.resolve(record.view.modelId),
        images.length > 0 || record.view.messages.some((message) => message.visionAssets?.length),
      );
      const user: ChatMessage = { id: randomUUID(), role: 'user', text, status: 'succeeded' };
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
      const pending: Pending = { runId: randomUUID(), owner, user, text, canvas, images, writing };
      this.store.requests.push({
        id: requestId,
        runId: pending.runId,
        sessionId: id,
        text,
        inputHash,
      });
      if (!this.runs.has(id)) {
        try {
          await this.start(id, pending, skills);
        } catch (error) {
          this.store.requests.pop();
          throw error;
        }
        return pending.runId;
      }
      // The conversation is replying: show the message as queued and send it afterwards.
      user.status = 'queued';
      record.view.messages.push(user);
      try {
        await this.store.save(id);
      } catch (error) {
        record.view.messages.pop();
        this.store.requests.pop();
        throw error;
      }
      this.queues.set(id, [...(this.queues.get(id) ?? []), pending]);
      this.changed(id, user.id);
      this.emit();
      return pending.runId;
    });
  }
  /**
   * Starts one round. A queued message is already in the transcript; its reply is inserted right
   * after it, before any later queued messages.
   */
  private async start(id: string, pending: Pending, skills = this.skills.snapshot()) {
    const record = this.store.record(id);
    if (!record.view.modelId) throw new Error('此对话使用旧配置，请重新选择一个已保存的模型');
    const current = this.config.resolve(record.view.modelId);
    this.assertVision(
      current,
      pending.images.length > 0 ||
        record.view.messages.some((message) => message.visionAssets?.length),
    );
    const thinking = nearestThinkingLevel(
      current.thinkingLevels,
      record.view.thinkingLevel ?? 'off',
    );
    const before = structuredClone(record.view);
    delete record.config;
    record.view.model = current.modelId;
    record.view.contextWindow = current.contextWindow;
    const { user } = pending;
    const assistant: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      text: '',
      status: 'running',
    };
    const index = record.view.messages.findIndex((m) => m.id === user.id);
    if (index >= 0) {
      user.status = 'succeeded';
      record.view.messages.splice(index + 1, 0, assistant);
    } else record.view.messages.push(user, assistant);
    if (!record.view.messages.some((m) => m.role === 'user' && m.id !== user.id))
      record.view.title = pending.text.slice(0, 36);
    record.view.runId = pending.runId;
    record.view.updatedAt = Date.now();
    const run: Run = { id: pending.runId, sessionId: id, owner: pending.owner, cancelled: false };
    this.runs.set(id, run);
    try {
      await this.store.save(id);
    } catch (error) {
      record.view = before;
      this.runs.delete(id);
      throw error;
    }
    this.changed(id, user.id, assistant.id);
    this.emit();
    const limits = record.view.agent.kind === 'main' ? ROUND_LIMITS.main : ROUND_LIMITS.space;
    run.done = this.perform(run, current, thinking, assistant, pending, skills, limits);
  }
  /** Starts the next queued message of a conversation whose round just ended. */
  private async startNext(id: string) {
    const next = this.queues.get(id)?.shift();
    if (!next || this.runs.has(id) || !this.store.records.some((r) => r.view.id === id)) return;
    try {
      if (this.persistenceError) throw new Error(this.persistenceError);
      await this.start(id, next);
    } catch (error) {
      next.user.status = 'failed';
      next.user.error = error instanceof Error ? error.message : '发送失败';
      await this.store.saveView(id).catch(() => {});
      this.changed(id, next.user.id);
      this.emit();
      await this.startNext(id);
    }
  }
  private async perform(
    run: Run,
    model: ResolvedModel,
    thinking: ThinkingLevel,
    output: ChatMessage,
    { text, canvas, images, writing }: Pending,
    skills: StoredSkill[],
    limits: (typeof ROUND_LIMITS)[keyof typeof ROUND_LIMITS],
  ) {
    let stop: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let checkpoint: ReturnType<typeof setInterval> | undefined;
    const changed = () => this.changed(run.sessionId, output.id);
    try {
      const context: ToolContext = {
        owner: run.owner,
        sessionId: run.sessionId,
        runId: run.id,
        output,
        changed,
        record: (change) =>
          this.ledger.record({ ...change, sessionId: run.sessionId, runId: run.id }),
      };
      const skill = skillsPack(context, skills, text);
      const space = canvas
        ? canvasPack(context, canvas, this.canvas)
        : writing
          ? writingPack(context, writing, this.writing)
          : chatPack();
      const arm = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          output.error = '请求超时，已保留部分回复';
          run.cancelled = true;
          void run.sdk?.abort();
        }, limits.timeout);
      };
      // Waiting for the user does not count toward the round's time limit.
      const approve: Approver = async ({ tool, input, signal }) => {
        clearTimeout(timeout);
        const outcome = await this.approvals.request(
          run.owner,
          {
            sessionId: run.sessionId,
            toolName: tool.name,
            title: tool.label.slice(0, 500),
            detail: (tool.describe?.(input) ?? JSON.stringify(input)).slice(0, 2000),
          },
          signal,
        );
        if (outcome !== 'approved') {
          const label = `${outcome === 'denied' ? '已拒绝' : '确认超时，未执行'} · ${tool.label}`;
          output.activities ??= [];
          output.activities.push({ id: randomUUID(), label: label.slice(0, 500), files: [] });
          changed();
        }
        if (!run.cancelled) arm();
        return outcome;
      };
      const runtime = await openAgent(this.root, run.sessionId, model, {
        packs: [space, skill],
        thinkingLevel: thinking,
        approve,
        slot: (signal) => this.scheduler.acquire(run.sessionId, signal),
        maxRequests: limits.requests,
        maxToolCalls: MAX_TOOL_CALLS,
      });
      run.sdk = runtime.session;
      if (run.cancelled) {
        output.status = 'cancelled';
        return;
      }
      arm();
      checkpoint = setInterval(() => {
        // Only this conversation's messages change while it streams.
        void this.store.saveView(run.sessionId).catch(() => {
          this.persistenceError = '会话保存失败，请重启应用后检查本地存储';
          output.error = this.persistenceError;
          run.cancelled = true;
          void runtime.session.abort();
          changed();
        });
      }, 1000);
      let compaction: NonNullable<ChatMessage['activities']>[number] | undefined;
      stop = runtime.session.subscribe((event) => {
        if (run.cancelled) return;
        if (event.type === 'compaction_start') {
          compaction = { id: randomUUID(), label: '正在压缩较早的对话内容…', files: [] };
          output.activities = [...(output.activities ?? []), compaction];
          changed();
        }
        if (event.type === 'compaction_end' && compaction) {
          compaction.label = event.result
            ? '已压缩较早的对话内容，保留摘要继续对话'
            : '压缩较早的对话内容失败';
          changed();
        }
        if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
          output.text += event.assistantMessageEvent.delta;
          if (output.text.length > 200000) {
            output.error = '回复超过长度上限，已停止';
            run.cancelled = true;
            void runtime.session.abort();
          }
          changed();
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
          ? skill.userPrompt + '\n\n附图来源清单（数据）：' + JSON.stringify(roster)
          : skill.userPrompt,
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
      changed();
      try {
        await this.store.save(run.sessionId);
      } catch {
        this.persistenceError = '会话保存失败，请重启应用后检查本地存储';
        output.error = this.persistenceError;
        output.status = 'failed';
      }
      if (this.runs.get(run.sessionId) === run) this.runs.delete(run.sessionId);
      this.emit();
      if (this.queues.get(run.sessionId)?.length)
        void this.exclusive(() => this.startNext(run.sessionId));
    }
  }
  /** Stops a round and drops the messages queued behind it. */
  async cancel(id: string, owner?: number) {
    const run = [...this.runs.values()].find((r) => r.id === id);
    if (!run) return;
    if (owner !== undefined && run.owner !== owner) throw new Error('不能停止其他窗口的请求');
    run.cancelled = true;
    const queued = this.queues.get(run.sessionId) ?? [];
    this.queues.delete(run.sessionId);
    for (const { user } of queued) {
      user.status = 'cancelled';
      this.changed(run.sessionId, user.id);
    }
    this.approvals.cancelSession(run.sessionId);
    await run.sdk?.abort();
    await run.done;
  }
  async cancelOwner(owner: number) {
    this.approvals.cancelOwner(owner);
    for (const run of [...this.runs.values()])
      if (run.owner === owner) await this.cancel(run.id, owner);
    if (this.testRun?.owner === owner) {
      this.testRun.cancelled = true;
      await this.testRun.sdk?.abort();
    }
  }
  get isBusy() {
    return this.runs.size > 0 || this.testing;
  }
  async shutdown() {
    for (const run of [...this.runs.values()]) await this.cancel(run.id);
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
      const runtime = await openAgent(this.root, randomUUID(), model, { transient: true });
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
