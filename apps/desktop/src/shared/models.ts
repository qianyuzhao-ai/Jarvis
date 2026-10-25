import { z } from 'zod';

export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const thinkingLevelSchema = z.enum(THINKING_LEVELS);
export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;
export const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: '关闭',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最高',
};

export const baseUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, '地址不能包含账号、密码、查询参数或锚点')
  .transform((value) => value.replace(/\/+$/, ''));
export const apiKeySchema = z
  .string()
  .trim()
  .max(4000)
  .refine((key) => !/[\r\n]/.test(key))
  .default('');

export const CUSTOM_APIS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
] as const;
export const customApiSchema = z.enum(CUSTOM_APIS);
export type CustomApi = z.infer<typeof customApiSchema>;

/** Effective image capability of a model, with where the conclusion came from. */
export type Vision = 'supported' | 'unsupported' | 'unknown';
export type CapabilitySource = 'catalog' | 'provider' | 'probe' | 'manual' | 'unknown';

const name = z.string().trim().min(1).max(100);
const modelIdSchema = z.string().trim().min(1).max(200);
const contextWindowSchema = z.number().int().min(1024).max(10_000_000);
const maxTokensSchema = z.number().int().min(256).max(2_000_000);

export const providerInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('builtin'),
      id: z.string().uuid().optional(),
      sdkProvider: z.string().trim().min(1).max(100),
      name: name.optional(),
      apiKey: apiKeySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('custom'),
      id: z.string().uuid().optional(),
      name,
      baseUrl: baseUrlSchema,
      api: customApiSchema,
      apiKey: apiKeySchema,
      clearKey: z.boolean().default(false),
    })
    .strict()
    .refine((p) => !(p.apiKey && p.clearKey), '不能同时填写和清除 Key'),
]);
export type ProviderInput = z.infer<typeof providerInputSchema>;

export const providerTestSchema = z
  .object({ provider: providerInputSchema, modelId: modelIdSchema.optional() })
  .strict();

export const setProviderModelsSchema = z
  .object({
    providerId: z.string().uuid(),
    models: z
      .array(
        z
          .object({
            modelId: modelIdSchema,
            label: name.optional(),
            /** Image support reported by the relay's own /models listing, when it had one. */
            providerVision: z.boolean().optional(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
  .refine(
    (v) => new Set(v.models.map((m) => m.modelId)).size === v.models.length,
    '模型 ID 不能重复',
  );

const auto = z.literal('auto');
export const updateModelSchema = z
  .object({
    id: z.string().uuid(),
    label: name.nullable().optional(),
    vision: z.enum(['auto', 'supported', 'unsupported']).optional(),
    thinkingLevels: z.union([auto, z.array(thinkingLevelSchema).max(7)]).optional(),
    contextWindow: z.union([auto, contextWindowSchema]).optional(),
    maxTokens: z.union([auto, maxTokensSchema]).optional(),
  })
  .strict();
export type UpdateModelInput = z.infer<typeof updateModelSchema>;

export const thinkingInputSchema = z
  .object({ sessionId: z.string().uuid(), level: thinkingLevelSchema })
  .strict();

export interface ProviderView {
  id: string;
  kind: 'builtin' | 'custom';
  sdkProvider?: string;
  name: string;
  baseUrl?: string;
  api?: string;
  hasKey: boolean;
  /** The stored Key could not be decrypted (for example after migration) and must be re-entered. */
  keyError?: boolean;
}
export interface ModelView {
  id: string;
  providerId: string;
  modelId: string;
  label?: string;
  /** Label, else the SDK display name, else the model ID. */
  name: string;
  /** False when a built-in model is no longer in the SDK catalog. */
  available: boolean;
  vision: Vision;
  visionSource: CapabilitySource;
  /** Supported thinking levels (including 'off'); empty means Jarvis sends no thinking parameters. */
  thinkingLevels: ThinkingLevel[];
  thinkingSource: CapabilitySource;
  contextWindow: number | null;
  contextSource: CapabilitySource;
  /** Null means automatic: no explicit output limit is sent. */
  maxTokens: number | null;
  maxTokensSource: CapabilitySource;
  lastThinkingLevel?: ThinkingLevel;
}
export interface ModelSettingsView {
  providers: ProviderView[];
  models: ModelView[];
  defaultModelId: string | null;
}
export interface CatalogModel {
  id: string;
  name: string;
  vision: boolean;
  thinkingLevels: ThinkingLevel[];
  contextWindow: number | null;
  maxTokens: number | null;
}
export interface CatalogProvider {
  id: string;
  name: string;
  group: 'domestic' | 'international' | 'more';
  baseUrl?: string;
  models: CatalogModel[];
}
/** A model offered by a provider's model list, with capabilities inferred for display. */
export interface ModelCandidate extends CatalogModel {
  visionSource: CapabilitySource;
  vision: boolean;
  visionKnown: boolean;
  providerVision?: boolean;
}
export interface ProbeResult {
  vision: Vision;
  message: string;
}

/** Picks the supported level closest to the requested one, preferring the lower side; 'off' when none. */
export function nearestThinkingLevel(levels: ThinkingLevel[], level: ThinkingLevel): ThinkingLevel {
  if (levels.includes(level)) return level;
  if (!levels.length) return 'off';
  const rank = (l: ThinkingLevel) => THINKING_LEVELS.indexOf(l);
  return [...levels].sort(
    (a, b) =>
      Math.abs(rank(a) - rank(level)) - Math.abs(rank(b) - rank(level)) || rank(a) - rank(b),
  )[0]!;
}

/** Level shown for a model: the session's own level, else the draft pick or the model's last level. */
export function thinkingFor(
  model: ModelView | undefined,
  level: ThinkingLevel | undefined,
): ThinkingLevel {
  if (!model) return 'off';
  return nearestThinkingLevel(model.thinkingLevels, level ?? model.lastThinkingLevel ?? 'off');
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
/** Model settings bridge exposed to the renderer; Keys are only ever written, never returned. */
export interface ModelsBridge {
  getSettings(): Promise<Result<ModelSettingsView>>;
  getCatalog(): Promise<Result<CatalogProvider[]>>;
  saveProvider(
    input: z.input<typeof providerInputSchema>,
  ): Promise<Result<{ id: string; settings: ModelSettingsView }>>;
  testProvider(input: z.input<typeof providerTestSchema>): Promise<Result<string>>;
  listCandidates(input: z.input<typeof providerInputSchema>): Promise<Result<ModelCandidate[]>>;
  setProviderModels(
    input: z.input<typeof setProviderModelsSchema>,
  ): Promise<Result<ModelSettingsView>>;
  updateModel(input: UpdateModelInput): Promise<Result<ModelSettingsView>>;
  removeModel(id: string): Promise<Result<ModelSettingsView>>;
  removeProvider(id: string): Promise<Result<ModelSettingsView>>;
  setDefaultModel(id: string): Promise<Result<ModelSettingsView>>;
  probeVision(id: string): Promise<Result<ProbeResult>>;
}
