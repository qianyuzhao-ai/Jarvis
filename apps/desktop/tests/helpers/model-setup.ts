import type { Page } from '@playwright/test';

/** Adds a custom relay provider with one enabled model through the model settings bridge. */
export async function addRelayModel(
  page: Page,
  options: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    name?: string;
    vision?: 'supported' | 'unsupported';
    contextWindow?: number;
  },
) {
  return page.evaluate(async (o) => {
    const models = window.desktop!.models;
    const saved = await models.saveProvider({
      kind: 'custom',
      name: o.name ?? 'Mock relay',
      baseUrl: o.baseUrl,
      api: 'openai-completions',
      apiKey: o.apiKey ?? '',
      clearKey: false,
    });
    if (!saved.ok) throw new Error(saved.error);
    const set = await models.setProviderModels({
      providerId: saved.value.id,
      models: [{ modelId: o.model }],
    });
    if (!set.ok) throw new Error(set.error);
    const model = set.value.models.find(
      (m) => m.providerId === saved.value.id && m.modelId === o.model,
    );
    if (!model) throw new Error('Missing model');
    if (o.vision || o.contextWindow) {
      const updated = await models.updateModel({
        id: model.id,
        ...(o.vision ? { vision: o.vision } : {}),
        ...(o.contextWindow ? { contextWindow: o.contextWindow } : {}),
      });
      if (!updated.ok) throw new Error(updated.error);
    }
    return { providerId: saved.value.id, id: model.id };
  }, options);
}
