import { randomUUID } from 'node:crypto';
import type { ResolvedModel } from '../../src/main/agent/model-store';
import type { CustomApi, ThinkingLevel, Vision } from '../../src/shared/models';

/** A custom (relay) model as the model store would resolve it. */
export function relayModel(input: {
  baseUrl: string;
  model: string;
  api?: CustomApi;
  apiKey?: string;
  vision?: Vision;
  thinkingLevels?: ThinkingLevel[];
  contextWindow?: number | null;
  maxTokens?: number | null;
}): ResolvedModel {
  return {
    id: randomUUID(),
    kind: 'custom',
    providerName: 'Mock',
    baseUrl: input.baseUrl,
    api: input.api ?? 'openai-completions',
    modelId: input.model,
    name: input.model,
    apiKey: input.apiKey ?? '',
    vision: input.vision ?? 'unknown',
    thinkingLevels: input.thinkingLevels ?? [],
    contextWindow: input.contextWindow ?? null,
    maxTokens: input.maxTokens === undefined ? 4096 : input.maxTokens,
  };
}

/** A built-in provider model; capabilities come from the SDK catalog at runtime. */
export function catalogModel(sdkProvider: string, modelId: string, apiKey: string): ResolvedModel {
  return {
    id: randomUUID(),
    kind: 'builtin',
    sdkProvider,
    providerName: sdkProvider,
    modelId,
    name: modelId,
    apiKey,
    vision: 'unknown',
    thinkingLevels: [],
    contextWindow: null,
    maxTokens: null,
  };
}
