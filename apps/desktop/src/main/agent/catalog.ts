import type { Api, Model as SdkModel, Provider } from '@earendil-works/pi-ai';

type Model = SdkModel<Api>;
import {
  THINKING_LEVELS,
  type CatalogModel,
  type CatalogProvider,
  type ThinkingLevel,
} from '../../shared/models';

const DOMESTIC = [
  'deepseek',
  'moonshotai-cn',
  'kimi-coding',
  'zai-coding-cn',
  'minimax-cn',
  'qwen-token-plan-cn',
  'xiaomi',
];
const INTERNATIONAL = ['openai', 'anthropic', 'google', 'xai', 'mistral'];
/** Providers that need local credentials, extra account fields, OAuth or a dynamic catalog. */
const DEFERRED = new Set([
  'amazon-bedrock',
  'google-vertex',
  'azure',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'openai-codex',
  'github-copilot',
  'radius',
  'typesafe',
]);
/** Model ID prefixes mapped to the provider that publishes the model, preferred when a relay ID matches several catalogs. */
const VENDORS: [RegExp, string][] = [
  [/^(gpt|o\d|chatgpt|codex)/, 'openai'],
  [/^claude/, 'anthropic'],
  [/^gemini/, 'google'],
  [/^deepseek/, 'deepseek'],
  [/^grok/, 'xai'],
  [/^kimi/, 'moonshotai'],
  [/^glm/, 'zai'],
  [/^(mistral|magistral|devstral|codestral|ministral)/, 'mistral'],
  [/^minimax/, 'minimax'],
];

let cache:
  | {
      providers: Provider[];
      index: Map<string, { provider: string; model: Model }[]>;
      levels: (model: Model) => string[];
    }
  | undefined;
/** Loads the SDK catalog once; must be awaited before the synchronous accessors below. */
export async function ensureCatalog() {
  if (cache) return;
  const [{ builtinProviders }, { getSupportedThinkingLevels }] = await Promise.all([
    import('@earendil-works/pi-ai/providers/all'),
    import('@earendil-works/pi-ai'),
  ]);
  const providers = builtinProviders();
  const index = new Map<string, { provider: string; model: Model }[]>();
  for (const provider of providers)
    for (const model of safeModels(provider)) {
      const key = normalizeModelId(model.id);
      index.set(key, [...(index.get(key) ?? []), { provider: provider.id, model }]);
    }
  cache = { providers, index, levels: getSupportedThinkingLevels };
}
function load() {
  if (!cache) throw new Error('模型目录尚未加载');
  return cache;
}
function safeModels(provider: Provider): readonly Model[] {
  try {
    return provider.getModels();
  } catch {
    return [];
  }
}
export function normalizeModelId(id: string) {
  return id.trim().toLowerCase().split('/').at(-1) ?? '';
}
export function thinkingLevels(model: Model): ThinkingLevel[] {
  if (!model.reasoning) return [];
  return load()
    .levels(model)
    .filter((level): level is ThinkingLevel =>
      (THINKING_LEVELS as readonly string[]).includes(level),
    );
}
function describe(model: Model): CatalogModel {
  return {
    id: model.id,
    name: model.name || model.id,
    vision: model.input.includes('image'),
    thinkingLevels: thinkingLevels(model),
    contextWindow: model.contextWindow > 0 ? model.contextWindow : null,
    maxTokens: model.maxTokens > 0 ? model.maxTokens : null,
  };
}
export function builtinProvider(id: string) {
  if (DEFERRED.has(id)) return undefined;
  const provider = load().providers.find((p) => p.id === id);
  return provider?.auth.apiKey?.login ? provider : undefined;
}
export function builtinModel(provider: string, id: string) {
  const found = builtinProvider(provider);
  return found ? safeModels(found).find((m) => m.id === id) : undefined;
}
export function providerCatalog(): CatalogProvider[] {
  const rank = (id: string) => {
    const d = DOMESTIC.indexOf(id);
    if (d >= 0) return d;
    const i = INTERNATIONAL.indexOf(id);
    return i >= 0 ? 100 + i : 1000;
  };
  return load()
    .providers.filter((p) => builtinProvider(p.id) && safeModels(p).length)
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
    .map((p) => ({
      id: p.id,
      name: p.name,
      group: DOMESTIC.includes(p.id)
        ? 'domestic'
        : INTERNATIONAL.includes(p.id)
          ? 'international'
          : 'more',
      ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
      models: safeModels(p).map(describe),
    }));
}

export interface CatalogMatch {
  /** Undefined when the matching catalogs disagree about image input. */
  vision?: boolean;
  thinkingLevels: ThinkingLevel[];
  contextWindow: number | null;
  maxTokens: number | null;
  /** The entry whose request details best represent the model, for copying the thinking level map. */
  model: Model;
}
/** Matches a custom (relay) model ID against every SDK catalog by exact ID, ignoring a "vendor/" prefix. */
export function matchCatalog(modelId: string): CatalogMatch | undefined {
  const key = normalizeModelId(modelId);
  const entries = load().index.get(key);
  if (!entries?.length) return undefined;
  const visions = new Set(entries.map((e) => e.model.input.includes('image')));
  const vendor = VENDORS.find(([pattern]) => pattern.test(key))?.[1];
  const official = entries.find((e) => e.provider === vendor);
  const pick = (values: number[]) => {
    const known = values.filter((v) => v > 0);
    return known.length ? Math.min(...known) : null;
  };
  if (official) {
    const d = describe(official.model);
    return {
      ...(visions.size === 1 ? { vision: [...visions][0] } : {}),
      thinkingLevels: d.thinkingLevels,
      contextWindow: d.contextWindow,
      maxTokens: d.maxTokens,
      model: official.model,
    };
  }
  const levels = entries
    .map((e) => thinkingLevels(e.model))
    .reduce((all, next) => all.filter((level) => next.includes(level)));
  const smallest = entries.reduce((a, b) =>
    (b.model.maxTokens || Infinity) < (a.model.maxTokens || Infinity) ? b : a,
  );
  return {
    ...(visions.size === 1 ? { vision: [...visions][0] } : {}),
    thinkingLevels: levels.includes('off') || !levels.length ? levels : ['off', ...levels],
    contextWindow: pick(entries.map((e) => e.model.contextWindow)),
    maxTokens: pick(entries.map((e) => e.model.maxTokens)),
    model: smallest.model,
  };
}
