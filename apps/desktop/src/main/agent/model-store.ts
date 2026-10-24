import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Api, Model } from '@earendil-works/pi-ai';
import { z } from 'zod';
import {
  DEEPSEEK_BASE_URL,
  relaySchema,
  type RelayConfig,
  type RelayInput,
  type RelayView,
} from '../../shared/agent';
import {
  THINKING_LEVELS,
  customApiSchema,
  thinkingLevelSchema,
  type CapabilitySource,
  type CustomApi,
  type ModelCandidate,
  type ModelSettingsView,
  type ModelView,
  type ProviderInput,
  type ProviderView,
  type ThinkingLevel,
  type UpdateModelInput,
  type Vision,
} from '../../shared/models';
import {
  builtinModel,
  builtinProvider,
  ensureCatalog,
  matchCatalog,
  thinkingLevels,
} from './catalog';
import { JsonFile, readJson } from './json-file';
import type { KeyCipher } from './key-cipher';

const providerSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['builtin', 'custom']),
  sdkProvider: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100),
  baseUrl: z.string().max(2000).optional(),
  api: customApiSchema.optional(),
  encryptedKey: z.string(),
  keyError: z.boolean().optional(),
});
const modelSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid(),
  modelId: z.string().min(1).max(200),
  label: z.string().min(1).max(100).optional(),
  providerVision: z.boolean().optional(),
  probe: z.object({ vision: z.enum(['supported', 'unsupported']), at: z.number() }).optional(),
  manual: z
    .object({
      vision: z.enum(['supported', 'unsupported']).optional(),
      thinkingLevels: z.array(thinkingLevelSchema).max(7).optional(),
      contextWindow: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
    })
    .default({}),
  lastThinkingLevel: thinkingLevelSchema.optional(),
});
const storedSchema = z
  .object({
    version: z.literal(3),
    defaultModelId: z.string().uuid().nullable(),
    providers: z.array(providerSchema).max(100),
    models: z.array(modelSchema).max(1000),
  })
  .refine(
    (v) =>
      new Set(v.providers.map((p) => p.id)).size === v.providers.length &&
      new Set(v.models.map((m) => m.id)).size === v.models.length &&
      v.models.every((m) => v.providers.some((p) => p.id === m.providerId)) &&
      (v.defaultModelId === null || v.models.some((m) => m.id === v.defaultModelId)),
  );
const v2Schema = z.object({
  version: z.literal(2),
  defaultModelId: z.string().uuid().nullable(),
  models: z.array(
    z.object({ id: z.string().uuid(), config: relaySchema, encryptedKey: z.string() }),
  ),
});
const v1Schema = z.object({ config: relaySchema, encryptedKey: z.string() });
type Stored = z.infer<typeof storedSchema>;
type StoredProvider = z.infer<typeof providerSchema>;
type StoredModel = z.infer<typeof modelSchema>;

/** Everything the runtime needs to open one model, including its decrypted Key. */
export interface ResolvedModel {
  id: string;
  kind: 'builtin' | 'custom';
  sdkProvider?: string;
  providerName: string;
  baseUrl?: string;
  api?: CustomApi;
  modelId: string;
  name: string;
  apiKey: string;
  vision: Vision;
  thinkingLevels: ThinkingLevel[];
  thinkingLevelMap?: Model<Api>['thinkingLevelMap'];
  contextWindow: number | null;
  maxTokens: number | null;
}

/** Legacy default used by the v2 settings form; treated as "not set" when migrating. */
const LEGACY_MAX_TOKENS = 4096;
const keyLost = '无法解密已保存的 Key，请重新填写';
/** Names the v2 form filled in by default; they describe the provider, so they do not become labels. */
const LEGACY_DEFAULT_NAMES = new Set(['DeepSeek 官方', '我的中转站']);

export class ModelStore {
  private stored: Stored = { version: 3, defaultModelId: null, providers: [], models: [] };
  constructor(
    private file: JsonFile,
    private cipher: KeyCipher,
  ) {}

  async initialize() {
    await ensureCatalog();
    const value = await readJson(this.file.path);
    if (!value) return;
    if (typeof value === 'object' && 'version' in value && value.version === 3) {
      this.stored = storedSchema.parse(value);
      return;
    }
    const legacy =
      typeof value === 'object' && 'version' in value
        ? v2Schema.parse(value)
        : (() => {
            const v1 = v1Schema.parse(value);
            const id = randomUUID();
            return { version: 2 as const, defaultModelId: id, models: [{ id, ...v1 }] };
          })();
    const next = this.migrate(legacy);
    await writeFile(`${this.file.path.replace(/\.json$/, '')}.v2.bak.json`, JSON.stringify(value), {
      mode: 0o600,
    });
    await this.file.write(next);
    this.stored = next;
  }

  /** Groups v2 entries that share an endpoint and Key into one provider, keeping every model ID. */
  private migrate(legacy: z.infer<typeof v2Schema>): Stored {
    if (legacy.models.some((m) => m.encryptedKey) && !this.cipher.available())
      throw new Error('系统密钥存储不可用，模型配置未迁移，原文件已保留');
    const providers: StoredProvider[] = [];
    const groups = new Map<string, StoredProvider>();
    const models: StoredModel[] = [];
    for (const entry of legacy.models) {
      const { config } = entry;
      let key = '';
      let failed = false;
      if (entry.encryptedKey)
        try {
          key = this.cipher.decrypt(entry.encryptedKey);
        } catch {
          failed = true;
        }
      const builtin = config.provider === 'deepseek';
      const group = failed
        ? `error:${entry.id}`
        : builtin
          ? `builtin:deepseek:${key}`
          : `custom:${config.baseUrl}:${config.api}:${key}`;
      let provider = groups.get(group);
      if (!provider) {
        provider = builtin
          ? {
              id: randomUUID(),
              kind: 'builtin',
              sdkProvider: 'deepseek',
              name: 'DeepSeek',
              encryptedKey: failed ? '' : entry.encryptedKey,
            }
          : {
              id: randomUUID(),
              kind: 'custom',
              name: config.name,
              baseUrl: config.baseUrl,
              api: config.api,
              encryptedKey: failed ? '' : entry.encryptedKey,
            };
        if (failed) provider.keyError = true;
        groups.set(group, provider);
        providers.push(provider);
      }
      const label =
        config.name !== provider.name &&
        config.name !== config.model &&
        !LEGACY_DEFAULT_NAMES.has(config.name)
          ? config.name
          : undefined;
      const manual: StoredModel['manual'] = {};
      if (!builtin) {
        if (config.contextWindow) manual.contextWindow = config.contextWindow;
        if (config.maxTokens !== LEGACY_MAX_TOKENS) manual.maxTokens = config.maxTokens;
      }
      models.push({
        id: entry.id,
        providerId: provider.id,
        modelId: config.model,
        ...(label ? { label } : {}),
        manual,
      });
    }
    return storedSchema.parse({
      version: 3,
      defaultModelId: models.some((m) => m.id === legacy.defaultModelId)
        ? legacy.defaultModelId
        : (models[0]?.id ?? null),
      providers,
      models,
    });
  }

  private async commit(next: Stored) {
    const parsed = storedSchema.parse(next);
    await this.file.write(parsed);
    this.stored = parsed;
  }
  private clone() {
    return structuredClone(this.stored);
  }
  private provider(id: string, from = this.stored) {
    const provider = from.providers.find((p) => p.id === id);
    if (!provider) throw new Error('服务商不存在或已删除');
    return provider;
  }
  private model(id: string, from = this.stored) {
    const model = from.models.find((m) => m.id === id);
    if (!model) throw new Error('模型不存在或已删除，请重新选择');
    return model;
  }
  private decrypt(provider: StoredProvider) {
    if (provider.keyError) throw new Error(keyLost);
    if (!provider.encryptedKey) return '';
    if (!this.cipher.available()) throw new Error('系统密钥存储不可用，请重新配置');
    try {
      return this.cipher.decrypt(provider.encryptedKey);
    } catch {
      throw new Error(keyLost);
    }
  }
  private encrypt(key: string) {
    if (!key) return '';
    if (!this.cipher.available()) throw new Error('系统密钥存储不可用，未保存 Key');
    return this.cipher.encrypt(key);
  }

  /** Effective capabilities: built-in models read the SDK catalog; custom ones layer manual > probe > relay > catalog. */
  private capabilities(provider: StoredProvider, model: StoredModel) {
    if (provider.kind === 'builtin') {
      const found = builtinModel(provider.sdkProvider ?? '', model.modelId);
      const source: CapabilitySource = found ? 'catalog' : 'unknown';
      return {
        name: model.label ?? found?.name ?? model.modelId,
        available: !!found,
        vision: (found
          ? found.input.includes('image')
            ? 'supported'
            : 'unsupported'
          : 'unknown') as Vision,
        visionSource: source,
        thinkingLevels: found ? thinkingLevels(found) : [],
        thinkingSource: source,
        thinkingLevelMap: undefined,
        contextWindow: found?.contextWindow || null,
        contextSource: source,
        maxTokens: found?.maxTokens || null,
        maxTokensSource: source,
      };
    }
    const match = matchCatalog(model.modelId);
    const manual = model.manual;
    const [vision, visionSource]: [Vision, CapabilitySource] = manual.vision
      ? [manual.vision, 'manual']
      : model.probe
        ? [model.probe.vision, 'probe']
        : model.providerVision !== undefined
          ? [model.providerVision ? 'supported' : 'unsupported', 'provider']
          : match?.vision !== undefined
            ? [match.vision ? 'supported' : 'unsupported', 'catalog']
            : ['unknown', 'unknown'];
    const [levels, thinkingSource]: [ThinkingLevel[], CapabilitySource] = manual.thinkingLevels
      ? [manual.thinkingLevels, 'manual']
      : match
        ? [match.thinkingLevels, 'catalog']
        : [[], 'unknown'];
    const thinking =
      levels.length && !levels.includes('off') ? ['off' as const, ...levels] : levels;
    return {
      name: model.label ?? model.modelId,
      available: true,
      vision,
      visionSource,
      thinkingLevels: thinking,
      thinkingSource,
      thinkingLevelMap:
        thinkingSource === 'catalog' && match?.model.api === provider.api
          ? match?.model.thinkingLevelMap
          : thinking.length
            ? Object.fromEntries(
                THINKING_LEVELS.filter((l) => !thinking.includes(l)).map((l) => [l, null]),
              )
            : undefined,
      contextWindow: manual.contextWindow ?? match?.contextWindow ?? null,
      contextSource: (manual.contextWindow
        ? 'manual'
        : match?.contextWindow
          ? 'catalog'
          : 'unknown') as CapabilitySource,
      maxTokens: manual.maxTokens ?? match?.maxTokens ?? null,
      maxTokensSource: (manual.maxTokens
        ? 'manual'
        : match?.maxTokens
          ? 'catalog'
          : 'unknown') as CapabilitySource,
    };
  }

  view(): ModelSettingsView {
    return {
      providers: this.stored.providers.map(
        (p): ProviderView => ({
          id: p.id,
          kind: p.kind,
          ...(p.sdkProvider ? { sdkProvider: p.sdkProvider } : {}),
          name: p.name,
          ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
          ...(p.api ? { api: p.api } : {}),
          hasKey: !!p.encryptedKey,
          ...(p.keyError ? { keyError: true } : {}),
        }),
      ),
      models: this.stored.models.map((m): ModelView => {
        const { thinkingLevelMap: _map, ...c } = this.capabilities(this.provider(m.providerId), m);
        return {
          id: m.id,
          providerId: m.providerId,
          modelId: m.modelId,
          ...(m.label ? { label: m.label } : {}),
          ...c,
          ...(m.lastThinkingLevel ? { lastThinkingLevel: m.lastThinkingLevel } : {}),
        };
      }),
      defaultModelId: this.stored.defaultModelId,
    };
  }
  get defaultModelId() {
    return this.stored.defaultModelId;
  }

  resolve(id = this.stored.defaultModelId): ResolvedModel {
    if (!id) throw new Error('请先添加模型');
    const model = this.model(id);
    const provider = this.provider(model.providerId);
    const c = this.capabilities(provider, model);
    if (!c.available) throw new Error('该模型已不在当前版本的模型目录中，请重新选择');
    const apiKey = this.decrypt(provider);
    if (provider.kind === 'builtin' && !apiKey) throw new Error(`请填写 ${provider.name} API Key`);
    return {
      id: model.id,
      kind: provider.kind,
      ...(provider.sdkProvider ? { sdkProvider: provider.sdkProvider } : {}),
      providerName: provider.name,
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
      ...(provider.api ? { api: provider.api } : {}),
      modelId: model.modelId,
      name: c.name,
      apiKey,
      vision: c.vision,
      thinkingLevels: c.thinkingLevels,
      ...(c.thinkingLevelMap ? { thinkingLevelMap: c.thinkingLevelMap } : {}),
      contextWindow: c.contextWindow,
      maxTokens: c.maxTokens,
    };
  }

  /** Applies the Key rules to a provider form without saving: a new endpoint needs a new Key. */
  connection(input: ProviderInput) {
    const existing = input.id ? this.provider(input.id) : undefined;
    if (existing && existing.kind !== input.kind) throw new Error('服务商类型创建后不能修改');
    if (input.kind === 'builtin') {
      const sdk = builtinProvider(input.sdkProvider);
      if (!sdk) throw new Error('当前版本不支持该服务商');
      if (existing && existing.sdkProvider !== input.sdkProvider)
        throw new Error('服务商类型创建后不能修改');
      const apiKey = input.apiKey || (existing ? this.decrypt(existing) : '');
      if (!apiKey) throw new Error(`请填写 ${sdk.name} API Key`);
      return { input, apiKey, name: input.name ?? existing?.name ?? sdk.name };
    }
    let apiKey = '';
    if (input.apiKey) apiKey = input.apiKey;
    else if (!input.clearKey && existing?.encryptedKey) {
      if (existing.baseUrl !== input.baseUrl)
        throw new Error('更换地址时请填写新 API Key；无鉴权的服务也可明确清除旧 Key');
      apiKey = this.decrypt(existing);
    }
    return { input, apiKey, name: input.name };
  }

  async saveProvider(input: ProviderInput) {
    const { apiKey, name } = this.connection(input);
    const next = this.clone();
    const id = input.id ?? randomUUID();
    const record: StoredProvider =
      input.kind === 'builtin'
        ? { id, kind: 'builtin', sdkProvider: input.sdkProvider, name, encryptedKey: '' }
        : {
            id,
            kind: 'custom',
            name,
            baseUrl: input.baseUrl,
            api: input.api,
            encryptedKey: '',
          };
    record.encryptedKey = this.encrypt(apiKey);
    const index = next.providers.findIndex((p) => p.id === id);
    if (index < 0) {
      if (next.providers.length >= 100) throw new Error('最多保存 100 个服务商');
      next.providers.push(record);
    } else next.providers[index] = record;
    await this.commit(next);
    return id;
  }

  /** Replaces the enabled model list of one provider; existing entries keep their IDs and settings. */
  async setProviderModels(
    providerId: string,
    entries: { modelId: string; label?: string; providerVision?: boolean }[],
  ) {
    const next = this.clone();
    const provider = this.provider(providerId, next);
    if (provider.kind === 'builtin')
      for (const e of entries)
        if (!builtinModel(provider.sdkProvider ?? '', e.modelId))
          throw new Error(`目录中没有模型 ${e.modelId}`);
    const current = next.models.filter((m) => m.providerId === providerId);
    const kept: StoredModel[] = entries.map((e) => {
      const found = current.find((m) => m.modelId === e.modelId);
      if (found) {
        if (e.label) found.label = e.label;
        if (e.providerVision !== undefined) found.providerVision = e.providerVision;
        return found;
      }
      return {
        id: randomUUID(),
        providerId,
        modelId: e.modelId,
        ...(e.label ? { label: e.label } : {}),
        ...(e.providerVision !== undefined ? { providerVision: e.providerVision } : {}),
        manual: {},
      };
    });
    next.models = [...next.models.filter((m) => m.providerId !== providerId), ...kept];
    if (!next.models.some((m) => m.id === next.defaultModelId))
      next.defaultModelId = next.models[0]?.id ?? null;
    await this.commit(next);
    return kept.map((m) => m.id);
  }

  async updateModel(input: UpdateModelInput) {
    const next = this.clone();
    const model = this.model(input.id, next);
    const provider = this.provider(model.providerId, next);
    if (input.label !== undefined) {
      if (input.label) model.label = input.label;
      else delete model.label;
    }
    const capability =
      input.vision !== undefined ||
      input.thinkingLevels !== undefined ||
      input.contextWindow !== undefined ||
      input.maxTokens !== undefined;
    if (capability && provider.kind === 'builtin')
      throw new Error('内置服务商的模型能力来自模型目录，不能修改');
    const manual = model.manual;
    if (input.vision === 'auto') delete manual.vision;
    else if (input.vision) manual.vision = input.vision;
    if (input.thinkingLevels === 'auto') delete manual.thinkingLevels;
    else if (input.thinkingLevels)
      manual.thinkingLevels = THINKING_LEVELS.filter((l) =>
        (input.thinkingLevels as ThinkingLevel[]).includes(l),
      );
    if (input.contextWindow === 'auto') delete manual.contextWindow;
    else if (input.contextWindow) manual.contextWindow = input.contextWindow;
    if (input.maxTokens === 'auto') delete manual.maxTokens;
    else if (input.maxTokens) manual.maxTokens = input.maxTokens;
    const window = manual.contextWindow ?? matchCatalog(model.modelId)?.contextWindow;
    if (manual.maxTokens && window && manual.maxTokens >= window)
      throw new Error('输出上限必须小于上下文容量');
    await this.commit(next);
  }

  async recordProbe(id: string, vision: 'supported' | 'unsupported') {
    const next = this.clone();
    this.model(id, next).probe = { vision, at: Date.now() };
    await this.commit(next);
  }
  async rememberThinking(id: string, level: ThinkingLevel) {
    if (this.model(id).lastThinkingLevel === level) return;
    const next = this.clone();
    this.model(id, next).lastThinkingLevel = level;
    await this.commit(next);
  }
  async removeModel(id: string) {
    const next = this.clone();
    this.model(id, next);
    next.models = next.models.filter((m) => m.id !== id);
    if (next.defaultModelId === id) next.defaultModelId = next.models[0]?.id ?? null;
    await this.commit(next);
  }
  async removeProvider(id: string) {
    const next = this.clone();
    this.provider(id, next);
    next.providers = next.providers.filter((p) => p.id !== id);
    next.models = next.models.filter((m) => m.providerId !== id);
    if (!next.models.some((m) => m.id === next.defaultModelId))
      next.defaultModelId = next.models[0]?.id ?? null;
    await this.commit(next);
  }
  async setDefault(id: string) {
    this.model(id);
    await this.commit({ ...this.clone(), defaultModelId: id });
  }

  /** Lists models a provider offers, with capabilities inferred the same way as for saved models. */
  async candidates(input: ProviderInput): Promise<ModelCandidate[]> {
    if (input.kind === 'builtin') {
      const sdk = builtinProvider(input.sdkProvider);
      if (!sdk) throw new Error('当前版本不支持该服务商');
      return sdk.getModels().map((m) => {
        const vision = m.input.includes('image');
        return {
          id: m.id,
          name: m.name || m.id,
          vision,
          visionKnown: true,
          visionSource: 'catalog',
          thinkingLevels: thinkingLevels(m),
          contextWindow: m.contextWindow || null,
          maxTokens: m.maxTokens || null,
        };
      });
    }
    const { apiKey } = this.connection(input);
    const listed = await listRemoteModels(input.baseUrl, apiKey);
    return listed.map(({ id, providerVision }) => {
      const match = matchCatalog(id);
      const known = providerVision ?? match?.vision;
      const levels = match?.thinkingLevels ?? [];
      return {
        id,
        name: id,
        vision: known ?? false,
        visionKnown: known !== undefined,
        visionSource:
          providerVision !== undefined ? 'provider' : known !== undefined ? 'catalog' : 'unknown',
        ...(providerVision !== undefined ? { providerVision } : {}),
        thinkingLevels: levels,
        contextWindow: match?.contextWindow ?? null,
        maxTokens: match?.maxTokens ?? null,
      };
    });
  }

  /** Builds a one-off model for a connection test without saving anything. */
  transient(input: ProviderInput, modelId?: string): ResolvedModel {
    const { apiKey, name } = this.connection(input);
    if (input.kind === 'builtin') {
      const sdk = builtinProvider(input.sdkProvider);
      const model = modelId
        ? builtinModel(input.sdkProvider, modelId)
        : (sdk?.getModels().find((m) => !m.input.includes('image')) ?? sdk?.getModels()[0]);
      if (!sdk || !model) throw new Error('目录中没有可用于测试的模型');
      return {
        id: '',
        kind: 'builtin',
        sdkProvider: input.sdkProvider,
        providerName: name,
        modelId: model.id,
        name: model.name,
        apiKey,
        vision: model.input.includes('image') ? 'supported' : 'unsupported',
        thinkingLevels: thinkingLevels(model),
        contextWindow: model.contextWindow || null,
        maxTokens: model.maxTokens || null,
      };
    }
    if (!modelId) throw new Error('请填写用于测试的模型 ID');
    return {
      id: '',
      kind: 'custom',
      providerName: name,
      baseUrl: input.baseUrl,
      api: input.api,
      modelId,
      name: modelId,
      apiKey,
      vision: 'unknown',
      thinkingLevels: [],
      contextWindow: null,
      maxTokens: null,
    };
  }

  // ---- Adapter for the v2 settings form; removed together with that form in phase 3. ----

  private legacyConfig(provider: StoredProvider, model: StoredModel): RelayConfig {
    const c = this.capabilities(provider, model);
    const name = model.label ?? provider.name;
    if (provider.kind === 'builtin')
      return provider.sdkProvider === 'deepseek'
        ? {
            provider: 'deepseek',
            name,
            baseUrl: DEEPSEEK_BASE_URL,
            api: 'openai-completions',
            model: model.modelId,
            contextWindow: c.contextWindow,
            maxTokens: LEGACY_MAX_TOKENS,
          }
        : {
            provider: 'relay',
            name,
            baseUrl: builtinProvider(provider.sdkProvider ?? '')?.baseUrl ?? 'https://invalid',
            api: 'openai-completions',
            model: model.modelId,
            contextWindow: null,
            maxTokens: LEGACY_MAX_TOKENS,
          };
    const window = model.manual.contextWindow ?? null;
    const legacyWindow = window && window >= 8192 && window <= 2_000_000 ? window : null;
    let maxTokens = model.manual.maxTokens ?? LEGACY_MAX_TOKENS;
    maxTokens = Math.min(Math.max(maxTokens, 256), 32768, (legacyWindow ?? 32768) - 1);
    return {
      provider: 'relay',
      name,
      baseUrl: provider.baseUrl ?? '',
      api: provider.api === 'openai-responses' ? 'openai-responses' : 'openai-completions',
      model: model.modelId,
      contextWindow: legacyWindow,
      maxTokens,
    };
  }
  legacyView(): RelayView {
    const models = this.stored.models.map((m) => {
      const provider = this.provider(m.providerId);
      return { id: m.id, config: this.legacyConfig(provider, m), hasKey: !!provider.encryptedKey };
    });
    const selected = models.find((m) => m.id === this.stored.defaultModelId);
    return {
      config: selected ? selected.config : null,
      hasKey: !!selected?.hasKey,
      defaultModelId: this.stored.defaultModelId,
      models,
    };
  }
  private legacyProvider(input: RelayInput, existing?: StoredProvider): ProviderInput {
    const { config } = input;
    return config.provider === 'deepseek'
      ? {
          kind: 'builtin',
          sdkProvider: 'deepseek',
          ...(existing?.kind === 'builtin' ? { id: existing.id } : {}),
          apiKey: input.apiKey,
        }
      : {
          kind: 'custom',
          ...(existing?.kind === 'custom' ? { id: existing.id } : {}),
          name: existing?.kind === 'custom' ? existing.name : config.name,
          baseUrl: config.baseUrl,
          api: config.api,
          apiKey: input.apiKey,
          clearKey: input.clearKey,
        };
  }
  async legacySave(input: RelayInput) {
    if (input.config.provider === 'deepseek' && input.clearKey)
      throw new Error('DeepSeek 官方接入需要 API Key');
    const model = input.modelId && !input.create ? this.model(input.modelId) : undefined;
    const existing = model ? this.provider(model.providerId) : undefined;
    const kindChanged =
      !!existing && (existing.kind === 'builtin') !== (input.config.provider === 'deepseek');
    if (kindChanged && !input.apiKey && input.config.provider === 'deepseek')
      throw new Error('更换服务来源时请填写新 API Key');
    const providerInput = this.legacyProvider(input, kindChanged ? undefined : existing);
    const providerId = await this.saveProvider(providerInput);
    const next = this.clone();
    const provider = this.provider(providerId, next);
    const record: StoredModel = model
      ? (next.models.find((m) => m.id === model.id) as StoredModel)
      : { id: randomUUID(), providerId, modelId: input.config.model, manual: {} };
    record.providerId = providerId;
    record.modelId = input.config.model;
    if (input.config.name !== provider.name && input.config.name !== input.config.model)
      record.label = input.config.name;
    else delete record.label;
    if (provider.kind === 'custom') {
      record.manual.contextWindow = input.config.contextWindow ?? undefined;
      record.manual.maxTokens =
        input.config.maxTokens !== LEGACY_MAX_TOKENS ? input.config.maxTokens : undefined;
      if (record.manual.contextWindow === undefined) delete record.manual.contextWindow;
      if (record.manual.maxTokens === undefined) delete record.manual.maxTokens;
    } else record.manual = {};
    if (!model) next.models.push(record);
    if (kindChanged && existing && !next.models.some((m) => m.providerId === existing.id))
      next.providers = next.providers.filter((p) => p.id !== existing.id);
    next.defaultModelId ??= record.id;
    await this.commit(next);
    return this.legacyView();
  }
  legacyTransient(input: RelayInput): ResolvedModel {
    const model = input.modelId && !input.create ? this.model(input.modelId) : undefined;
    const existing = model ? this.provider(model.providerId) : undefined;
    const sameKind =
      !!existing && (existing.kind === 'builtin') === (input.config.provider === 'deepseek');
    if (input.config.provider === 'deepseek' && input.clearKey)
      throw new Error('DeepSeek 官方接入需要 API Key');
    if (existing && !sameKind && !input.apiKey && existing.encryptedKey)
      throw new Error('更换服务来源或地址时请填写新 API Key；中转站也可明确清除旧 Key');
    const resolved = this.transient(
      this.legacyProvider(input, sameKind ? existing : undefined),
      input.config.model,
    );
    return {
      ...resolved,
      ...(resolved.kind === 'custom'
        ? { contextWindow: input.config.contextWindow, maxTokens: input.config.maxTokens }
        : {}),
    };
  }
  async legacyModels(input: RelayInput) {
    const model = input.modelId && !input.create ? this.model(input.modelId) : undefined;
    const existing = model ? this.provider(model.providerId) : undefined;
    const sameKind = !!existing && existing.kind === 'custom';
    const provider = this.legacyProvider(
      { ...input, config: { ...input.config, provider: 'relay' } },
      sameKind ? existing : undefined,
    );
    const list = await this.candidates(provider);
    return [...new Set(list.map((m) => m.id))].sort();
  }
}

/** Reads an OpenAI-, Anthropic- or Gemini-style model list, keeping image support when the relay reports it. */
export async function listRemoteModels(baseUrl: string, apiKey: string) {
  const response = await fetch(`${baseUrl}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {},
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
      if (size > 4 * 1_048_576) throw new Error('模型列表过大');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const modalities = z.array(z.string()).optional();
  const entry = z
    .object({
      id: z.string().min(1).max(200).optional(),
      name: z.string().min(1).max(200).optional(),
      input_modalities: modalities,
      modalities,
      architecture: z.object({ input_modalities: modalities }).partial().optional(),
    })
    .passthrough();
  const body = z
    .object({
      data: z.array(entry).max(5000).optional(),
      models: z.array(entry).max(5000).optional(),
    })
    .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const seen = new Set<string>();
  const result: { id: string; providerVision?: boolean }[] = [];
  for (const item of [...(body.data ?? []), ...(body.models ?? [])]) {
    const id = item.id ?? item.name?.replace(/^models\//, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const listed =
      item.architecture?.input_modalities ?? item.input_modalities ?? item.modalities ?? undefined;
    result.push(listed ? { id, providerVision: listed.includes('image') } : { id });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
