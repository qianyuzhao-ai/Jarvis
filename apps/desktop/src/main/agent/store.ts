import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  chatSessionSchema,
  relaySchema,
  type ChatSession,
  type RelayConfig,
} from '../../shared/agent';
import { JsonFile, readJson } from './json-file';

const recordSchema = z.object({ view: chatSessionSchema, config: relaySchema });
const requestSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  runId: z.string().uuid(),
  text: z.string(),
});
const indexSchema = z.object({
  version: z.literal(1),
  sessions: z.array(recordSchema),
  requests: z.array(requestSchema),
});
export class AgentStore {
  records: z.infer<typeof recordSchema>[] = [];
  requests: z.infer<typeof requestSchema>[] = [];
  constructor(private file: JsonFile) {}
  async initialize() {
    const raw = await readJson(this.file.path);
    if (!raw) return;
    const data = indexSchema.parse(raw);
    this.records = data.sessions;
    this.requests = data.requests;
    let interrupted = false;
    for (const { view } of this.records) {
      if (view.runId) {
        interrupted = true;
        view.runId = null;
      }
      for (const m of view.messages)
        if (m.status === 'running') {
          m.status = 'interrupted';
          if (m.role === 'assistant') m.error = '应用已重启，上次回复已中断；不会自动重发';
          interrupted = true;
        }
    }
    if (interrupted) await this.save();
  }
  save() {
    return this.file.write({ version: 1, sessions: this.records, requests: this.requests });
  }
  record(id: string) {
    const record = this.records.find((s) => s.view.id === id);
    if (!record) throw new Error('对话不存在');
    return record;
  }
  async create(config: RelayConfig) {
    const view: ChatSession = {
      id: randomUUID(),
      title: '新对话',
      model: config.model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      runId: null,
      contextTokens: null,
      contextWindow: config.contextWindow,
    };
    this.records.push({ view, config });
    try {
      await this.save();
    } catch (error) {
      this.records.pop();
      throw error;
    }
    return view.id;
  }
}
