import type { WritingScope } from '../../shared/writing-agent';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  chatMessageSchema,
  chatSessionSchema,
  relaySchema,
  sessionMetaSchema,
  type AgentRole,
  type ChatMessage,
  type ChatSession,
  type ChatSessionMeta,
} from '../../shared/agent';
import type { ThinkingLevel } from '../../shared/models';
import type { ResolvedModel } from './model-store';
import { JsonFile, readJson } from './json-file';

const requestSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  runId: z.string().uuid(),
  text: z.string(),
  inputHash: z.string().optional(),
});
/** `config` is only present on sessions created before models were stored by ID. */
const v1IndexSchema = z.object({
  version: z.literal(1),
  sessions: z.array(z.object({ view: chatSessionSchema, config: relaySchema.optional() })),
  requests: z.array(requestSchema),
});
const indexSchema = z.object({
  version: z.literal(2),
  sessions: z.array(z.object({ meta: sessionMetaSchema, config: relaySchema.optional() })),
  requests: z.array(requestSchema),
});
const viewSchema = z.object({ version: z.literal(1), messages: z.array(chatMessageSchema) });
type StoredSession = Omit<ChatSession, 'lastReplyAt'>;

/** The role a v1 conversation gets: its space follows from what it was bound to. */
export function roleOf(view: { projectId?: string; writingScope?: WritingScope }): AgentRole {
  return {
    kind: view.projectId ? 'canvas' : view.writingScope ? 'writing' : 'main',
    origin: 'user',
  };
}

/**
 * Conversations in two layers: `index.json` holds every conversation's metadata and the request
 * log, and `sessions/<id>.view.json` holds one conversation's messages, so a streaming reply only
 * rewrites its own file. Version 1 files (everything in `index.json`) are migrated on first start
 * with a backup in `index.v1.bak.json`.
 */
export class AgentStore {
  records: { view: StoredSession; config?: z.infer<typeof relaySchema> }[] = [];
  requests: z.infer<typeof requestSchema>[] = [];
  private views = new Map<string, JsonFile>();
  private dir: string;
  constructor(private file: JsonFile) {
    this.dir = dirname(file.path);
  }
  async initialize() {
    const raw = await readJson(this.file.path);
    if (!raw) return;
    if ((raw as { version?: unknown }).version === 1) await this.migrate(raw);
    else {
      const data = indexSchema.parse(raw);
      this.requests = data.requests;
      for (const { meta, config } of data.sessions) {
        const { lastReplyAt: _derived, ...view } = meta;
        const stored = await readJson(this.viewPath(meta.id));
        const messages = stored ? viewSchema.parse(stored).messages : [];
        this.records.push({ view: { ...view, messages }, ...(config ? { config } : {}) });
      }
    }
    const interrupted = new Set<string>();
    for (const { view } of this.records) {
      if (view.runId) {
        interrupted.add(view.id);
        view.runId = null;
      }
      for (const m of view.messages) {
        if (m.status === 'queued') {
          m.status = 'cancelled';
          m.error = '应用已重启，排队的消息没有发送';
          interrupted.add(view.id);
        }
        if (m.status === 'running') {
          m.status = 'interrupted';
          if (m.role === 'assistant') m.error = '应用已重启，上次回复已中断；不会自动重发';
          interrupted.add(view.id);
        }
      }
    }
    if (interrupted.size) {
      await Promise.all([...interrupted].map((id) => this.saveView(id)));
      await this.saveIndex();
    }
  }
  /**
   * Writes the backup, every view and the v2 index, then reads them back. Any difference restores
   * the version 1 index so nothing is lost and the next start tries again.
   */
  private async migrate(raw: unknown) {
    const old = v1IndexSchema.parse(raw);
    await new JsonFile(join(this.dir, 'index.v1.bak.json')).write(raw);
    this.requests = old.requests;
    this.records = old.sessions.map(({ view, config }) => ({
      view: { ...view, agent: roleOf(view) },
      ...(config ? { config } : {}),
    }));
    try {
      for (const { view } of this.records) await this.saveView(view.id);
      await this.saveIndex();
      const back = indexSchema.parse(await readJson(this.file.path));
      const same =
        isDeepStrictEqual(back.requests, old.requests) &&
        back.sessions.length === old.sessions.length &&
        (await Promise.all(
          back.sessions.map(async ({ meta, config }, i) => {
            const before = old.sessions[i];
            const stored = viewSchema.parse(await readJson(this.viewPath(meta.id)));
            const { agent: _role, lastReplyAt: _derived, ...rest } = meta;
            return (
              !!before &&
              isDeepStrictEqual({ ...rest, messages: stored.messages }, before.view) &&
              isDeepStrictEqual(config, before.config)
            );
          }),
        ).then((results) => results.every(Boolean)));
      if (!same) throw new Error('mismatch');
    } catch (error) {
      await this.file.write(raw);
      throw new Error('Agent 记录升级校验失败，原记录已保留', { cause: error });
    }
  }
  /** Metadata as shown in lists and stored in the index. */
  meta(view: StoredSession): ChatSessionMeta {
    const { messages, ...meta } = view;
    const lastReplyAt = messages.at(-1)?.completedAt;
    return lastReplyAt === undefined ? meta : { ...meta, lastReplyAt };
  }
  saveIndex() {
    return this.file.write({
      version: 2,
      sessions: this.records.map(({ view, config }) => ({
        meta: this.meta(view),
        ...(config ? { config } : {}),
      })),
      requests: this.requests,
    });
  }
  /** Writes one conversation's messages; the index is untouched. */
  saveView(id: string) {
    const messages: ChatMessage[] = this.record(id).view.messages;
    let file = this.views.get(id);
    if (!file) {
      file = new JsonFile(this.viewPath(id));
      this.views.set(id, file);
    }
    return file.write({ version: 1, messages });
  }
  /** Writes one conversation's messages and then the index. */
  async save(id: string) {
    await this.saveView(id);
    await this.saveIndex();
  }
  record(id: string) {
    const record = this.records.find((s) => s.view.id === id);
    if (!record) throw new Error('对话不存在');
    return record;
  }
  async remove(id: string) {
    this.record(id);
    const before = this.records,
      requests = this.requests;
    this.records = before.filter((r) => r.view.id !== id);
    this.requests = requests.filter((r) => r.sessionId !== id);
    try {
      await this.saveIndex();
    } catch (error) {
      this.records = before;
      this.requests = requests;
      throw error;
    }
    const file = this.views.get(id);
    this.views.delete(id);
    await file?.settled();
    // A leftover view file is harmless: only files listed in the index are read.
    await unlink(this.viewPath(id)).catch(() => {});
  }
  async create(
    model: ResolvedModel,
    projectId?: string,
    thinkingLevel: ThinkingLevel = 'off',
    writingScope?: WritingScope,
  ) {
    const view: StoredSession = {
      id: randomUUID(),
      title: '新对话',
      model: model.modelId,
      modelId: model.id,
      thinkingLevel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      runId: null,
      contextTokens: null,
      contextWindow: model.contextWindow,
      agent: roleOf({ projectId, writingScope }),
      ...(projectId ? { projectId } : {}),
      ...(writingScope ? { writingScope } : {}),
    };
    this.records.push({ view });
    try {
      await this.save(view.id);
    } catch (error) {
      this.records.pop();
      throw error;
    }
    return view.id;
  }
  private viewPath(id: string) {
    return join(this.dir, 'sessions', `${id}.view.json`);
  }
}
