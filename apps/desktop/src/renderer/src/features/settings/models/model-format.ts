import type {
  CapabilitySource,
  ModelView,
  ProviderView,
  Vision,
} from '../../../../../shared/models';

export function tokens(value: number | null) {
  if (!value) return '';
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

export const SOURCE_LABELS: Record<CapabilitySource, string> = {
  catalog: '目录',
  provider: '服务商',
  probe: '检测',
  manual: '手动',
  unknown: '未识别',
};

export function visionBadge(vision: Vision) {
  return vision === 'supported'
    ? { tone: 'info' as const, label: '图片' }
    : vision === 'unsupported'
      ? { tone: 'neutral' as const, label: '仅文字' }
      : { tone: 'warning' as const, label: '图片未确认' };
}

export const API_LABELS: Record<string, string> = {
  'openai-completions': 'Chat Completions',
  'openai-responses': 'Responses',
  'anthropic-messages': 'Anthropic Messages',
  'google-generative-ai': 'Gemini',
};

export function providerMeta(provider: ProviderView, catalogBaseUrl?: string) {
  const host = (url?: string) => {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
    } catch {
      return url;
    }
  };
  if (provider.kind === 'builtin') return host(catalogBaseUrl);
  return [API_LABELS[provider.api ?? ''] ?? provider.api, host(provider.baseUrl)]
    .concat(provider.hasKey ? [] : ['无 Key'])
    .filter(Boolean)
    .join(' · ');
}

export function capabilityTitle(model: ModelView) {
  return `图片：${SOURCE_LABELS[model.visionSource]} · 思考：${SOURCE_LABELS[model.thinkingSource]}`;
}
