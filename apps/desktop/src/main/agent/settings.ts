import {
  agentSettingsSchema,
  DEFAULT_AGENT_SETTINGS,
  type AgentSettings,
} from '../../shared/agent-settings';
import { type JsonFile, readJson } from './json-file';

/** Agent preferences kept in `agent/settings.json`; an unreadable file falls back to defaults. */
export class AgentSettingsStore {
  private value: AgentSettings = { ...DEFAULT_AGENT_SETTINGS };
  constructor(private file: JsonFile) {}
  async initialize() {
    const raw = await readJson(this.file.path).catch(() => null);
    const parsed = agentSettingsSchema.safeParse(raw);
    if (parsed.success) this.value = parsed.data;
  }
  get() {
    return { ...this.value };
  }
  async update(change: Partial<AgentSettings>) {
    const next = agentSettingsSchema.parse({ ...this.value, ...change });
    await this.file.write(next);
    this.value = next;
    return this.get();
  }
}
