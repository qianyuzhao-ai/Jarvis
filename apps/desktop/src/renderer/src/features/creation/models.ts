import type { MediaData } from './types';

export const imageModels = [
  'gpt-image-2',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'nano-banana-2',
  'nano-banana-pro',
];
export const videoModels = ['seedance-2.0', 'seedance-2.5'];
export const gptSizes = [
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '9:16',
  '1:1(2k)',
  '16:9(2k)',
  '9:16(2k)',
  '16:9(4k)',
  '9:16(4k)',
  'auto',
];
export const nanoRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];
export const videoRatios = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'];
export const isNano = (model: string) => model.startsWith('nano-');
export function normalizeMedia(data: MediaData): MediaData {
  const next = { ...data };
  const sizes = next.kind === 'video' ? videoRatios : isNano(next.model) ? nanoRatios : gptSizes;
  if (!sizes.includes(next.size)) next.size = sizes[0]!;
  if (next.kind === 'video') {
    const max = next.model === 'seedance-2.5' ? 30 : 15;
    if (next.duration !== -1) next.duration = Math.min(max, Math.max(4, next.duration));
    if (next.model === 'seedance-2.5' && next.resolution === '4k') next.resolution = '1080p';
  }
  if (next.model === 'gpt-image-2' && ['max', 'xhigh'].includes(next.quality))
    next.quality = 'high';
  return next;
}
