import { randomUUID } from 'node:crypto';
import { safeStorage } from 'electron';
import { z } from 'zod';
import { relaySchema, type RelayInput, type RelayView } from '../../shared/agent';
import { JsonFile, readJson } from './json-file';

const modelSchema = z.object({
  id: z.string().uuid(),
  config: relaySchema,
  encryptedKey: z.string(),
});
const legacySchema = z.object({ config: relaySchema, encryptedKey: z.string() });
const storedSchema = z
  .object({
    version: z.literal(2),
    defaultModelId: z.string().uuid().nullable(),
    models: z.array(modelSchema).max(100),
  })
  .refine(
    (v) =>
      new Set(v.models.map((m) => m.id)).size === v.models.length &&
      (v.models.length
        ? v.models.some((m) => m.id === v.defaultModelId)
        : v.defaultModelId === null),
  );
function secureStorageAvailable() {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  );
}
export class RelayConfiguration {
  private stored: z.infer<typeof storedSchema> = { version: 2, defaultModelId: null, models: [] };
  constructor(private file: JsonFile) {}
  async initialize() {
    const value = await readJson(this.file.path);
    if (!value) return;
    if (typeof value === 'object' && 'version' in value) {
      this.stored = storedSchema.parse(value);
    } else {
      const legacy = legacySchema.parse(value);
      const id = randomUUID();
      const next = { version: 2 as const, defaultModelId: id, models: [{ id, ...legacy }] };
      await this.file.write(next);
      this.stored = next;
    }
  }
  private profile(id: string) {
    const profile = this.stored.models.find((m) => m.id === id);
    if (!profile) throw new Error('模型不存在或已删除，请重新选择');
    return profile;
  }
  view(): RelayView {
    const selected = this.stored.models.find((m) => m.id === this.stored.defaultModelId);
    return {
      config: selected ? structuredClone(selected.config) : null,
      hasKey: !!selected?.encryptedKey,
      defaultModelId: this.stored.defaultModelId,
      models: this.stored.models.map(({ id, config, encryptedKey }) => ({
        id,
        config: structuredClone(config),
        hasKey: !!encryptedKey,
      })),
    };
  }
  resolve(input?: RelayInput) {
    const id = input?.modelId ?? (input?.create ? null : this.stored.defaultModelId);
    const profile = id ? this.profile(id) : undefined;
    const config = input?.config ?? profile?.config;
    if (!config) throw new Error('请先添加模型');
    let apiKey = '';
    if (input?.clearKey) {
      if (config.provider === 'deepseek') throw new Error('DeepSeek 官方接入需要 API Key');
    } else if (input?.apiKey) apiKey = input.apiKey;
    else if (profile?.encryptedKey) {
      if (
        config.baseUrl !== profile.config.baseUrl ||
        (config.provider ?? 'relay') !== (profile.config.provider ?? 'relay')
      )
        throw new Error('更换服务来源或地址时请填写新 API Key；中转站也可明确清除旧 Key');
      if (!secureStorageAvailable()) throw new Error('系统密钥存储不可用，请重新配置');
      try {
        apiKey = safeStorage.decryptString(Buffer.from(profile.encryptedKey, 'base64'));
      } catch {
        throw new Error('无法解密已保存的 Key，请重新填写');
      }
    }
    if (config.provider === 'deepseek' && !apiKey) throw new Error('请填写 DeepSeek API Key');
    return { config: structuredClone(config), apiKey, modelId: profile?.id };
  }
  resolveModel(id: string) {
    const profile = this.profile(id);
    return this.resolve({ config: profile.config, modelId: id, apiKey: '', clearKey: false });
  }
  async save(input: RelayInput) {
    const { config, apiKey, modelId } = this.resolve(input);
    let encryptedKey = '';
    if (apiKey) {
      if (!secureStorageAvailable()) throw new Error('系统密钥存储不可用，未保存 Key');
      encryptedKey = safeStorage.encryptString(apiKey).toString('base64');
    }
    const id = modelId ?? randomUUID();
    const models = [...this.stored.models];
    const index = models.findIndex((m) => m.id === id);
    const model = { id, config, encryptedKey };
    if (index < 0) {
      if (models.length >= 100) throw new Error('最多保存 100 个模型');
      models.push(model);
    } else models[index] = model;
    const next = { version: 2 as const, defaultModelId: this.stored.defaultModelId ?? id, models };
    await this.file.write(next);
    this.stored = next;
    return this.view();
  }
  async remove(id: string) {
    this.profile(id);
    const models = this.stored.models.filter((m) => m.id !== id);
    const next = {
      ...this.stored,
      models,
      defaultModelId:
        this.stored.defaultModelId === id ? (models[0]?.id ?? null) : this.stored.defaultModelId,
    };
    await this.file.write(next);
    this.stored = next;
    return this.view();
  }
  async setDefault(id: string) {
    this.profile(id);
    const next = { ...this.stored, defaultModelId: id };
    await this.file.write(next);
    this.stored = next;
    return this.view();
  }
  async models(input: RelayInput) {
    const { config, apiKey } = this.resolve(input);
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`获取模型失败（${response.status}），可手动填写模型 ID`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('模型列表为空');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_048_576) throw new Error('模型列表过大');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const body = z
      .object({ data: z.array(z.object({ id: z.string().min(1).max(200) })).max(5000) })
      .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    return [...new Set(body.data.map((m) => m.id))].sort();
  }
}
