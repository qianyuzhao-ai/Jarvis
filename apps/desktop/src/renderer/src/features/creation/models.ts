import type { MediaData } from './types';

import { gptSizes, nanoRatios, videoRatios } from '../../../../shared/canvas-presets';
export {
  imageModels,
  videoModels,
  gptSizes,
  nanoRatios,
  videoRatios,
} from '../../../../shared/canvas-presets';
export const isNano = (model: string) => model.startsWith('nano-');
export function gptDimensions(preset: string) {
  return {
    ratio: preset.split('(')[0]!,
    resolution:
      preset === 'auto'
        ? 'auto'
        : preset.includes('(4k)')
          ? '4K'
          : preset.includes('(2k)')
            ? '2K'
            : '1K',
  };
}
export function gptPreset(ratio: string, resolution: string): string {
  return (
    gptSizes.find(
      (p) => gptDimensions(p).ratio === ratio && gptDimensions(p).resolution === resolution,
    ) ??
    gptSizes.find((p) => gptDimensions(p).ratio === ratio) ??
    '1:1'
  );
}
export function normalizeMedia(data: MediaData): MediaData {
  const next = { ...data };
  const sizes = next.kind === 'video' ? videoRatios : isNano(next.model) ? nanoRatios : gptSizes;
  if (!sizes.includes(next.size)) {
    const ratio = gptDimensions(next.size).ratio;
    next.size =
      next.kind === 'image' && !isNano(next.model)
        ? gptPreset(ratio, next.resolution)
        : sizes.includes(ratio)
          ? ratio
          : sizes[0]!;
  }
  if (next.kind === 'image' && !isNano(next.model))
    next.resolution = gptDimensions(next.size).resolution;
  if (next.kind === 'image' && isNano(next.model) && !['1K', '2K', '4K'].includes(next.resolution))
    next.resolution = '2K';
  if (next.kind === 'video') {
    const max = next.model === 'seedance-2.5' ? 30 : 15;
    if (next.duration !== -1) next.duration = Math.min(max, Math.max(4, next.duration));
    if (next.model === 'seedance-2.5' && next.resolution === '4k') next.resolution = '1080p';
  }
  if (next.model === 'gpt-image-2' && ['max', 'xhigh'].includes(next.quality))
    next.quality = 'high';
  return next;
}
