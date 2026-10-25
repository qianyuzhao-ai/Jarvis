import { gptSizes, nanoRatios, videoRatios } from './canvas-presets';

/** Media node fields shared by the renderer and the main process; references differ per side. */
export type MediaCore = {
  name?: string;
  kind: 'image' | 'video';
  prompt: string;
  model: string;
  size: string;
  resolution: string;
  quality: string;
  duration: number;
  generateAudio: boolean;
};
export function mediaName(data: { kind: 'image' | 'video'; name?: string }): string {
  return data.name || (data.kind === 'image' ? '图像生成' : '视频生成');
}
/** A new media node's settings, without references. */
export function defaultMedia(kind: MediaCore['kind']): MediaCore {
  return {
    kind,
    name: mediaName({ kind }),
    prompt: '',
    model: kind === 'image' ? 'gpt-image-2.5-flare' : 'seedance-2.5',
    size: kind === 'image' ? '16:9(2k)' : '16:9',
    resolution: kind === 'image' ? '2K' : '1080p',
    quality: 'medium',
    duration: 5,
    generateAudio: true,
  };
}
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
export function normalizeMedia<T extends MediaCore>(data: T): T {
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
