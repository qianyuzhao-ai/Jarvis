import { safeStorage } from 'electron';
import { z } from 'zod';
import { relaySchema, type RelayInput, type RelayView } from '../../shared/agent';
import { JsonFile, readJson } from './json-file';

const storedSchema = z.object({ config: relaySchema, encryptedKey: z.string() });
function secureStorageAvailable() {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  );
}
export class RelayConfiguration {
  private stored: z.infer<typeof storedSchema> | null = null;
  constructor(private file: JsonFile) {}
  async initialize() {
    const value = await readJson(this.file.path);
    if (value) this.stored = storedSchema.parse(value);
  }
  view(): RelayView {
    return { config: this.stored?.config ?? null, hasKey: !!this.stored?.encryptedKey };
  }
  resolve(input?: RelayInput) {
    const config = input?.config ?? this.stored?.config;
    if (!config) throw new Error('请先配置中转站模型');
    if (input?.clearKey) return { config, apiKey: '' };
    if (input?.apiKey) return { config, apiKey: input.apiKey };
    if (
      input &&
      this.stored &&
      config.baseUrl !== this.stored.config.baseUrl &&
      this.stored.encryptedKey
    )
      throw new Error('更换中转地址时请填写新 API Key 或明确清除旧 Key');
    let apiKey = '';
    if (this.stored?.encryptedKey) {
      if (!secureStorageAvailable()) throw new Error('系统密钥存储不可用，请重新配置');
      try {
        apiKey = safeStorage.decryptString(Buffer.from(this.stored.encryptedKey, 'base64'));
      } catch {
        throw new Error('无法解密已保存的 Key，请重新填写');
      }
    }
    return { config, apiKey };
  }
  async save(input: RelayInput) {
    const { config, apiKey } = this.resolve(input);
    let encryptedKey = '';
    if (apiKey) {
      if (!secureStorageAvailable()) throw new Error('系统密钥存储不可用，未保存 Key');
      encryptedKey = safeStorage.encryptString(apiKey).toString('base64');
    }
    const next = { config, encryptedKey };
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
