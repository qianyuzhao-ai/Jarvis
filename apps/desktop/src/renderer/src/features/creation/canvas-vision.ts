import type { VisionAsset } from '../../../../shared/canvas-vision';
import { mediaName, type CanvasNode } from './types';
function waitFor(target: EventTarget, event: string, start: () => void) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('媒体读取超时，请检查资源后重试')), 15000);
    const success = () => finish();
    const error = () => finish(new Error('无法加载媒体，请确认资源可访问'));
    function finish(failure?: Error) {
      clearTimeout(timeout);
      target.removeEventListener(event, success);
      target.removeEventListener('error', error);
      if (failure) reject(failure);
      else resolve();
    }
    target.addEventListener(event, success, { once: true });
    target.addEventListener('error', error, { once: true });
    try {
      start();
    } catch (e) {
      finish(e instanceof Error ? e : new Error('无法读取媒体'));
    }
  });
}
function capture(source: CanvasImageSource, width: number, height: number, longest: number) {
  if (!width || !height) throw new Error('媒体尺寸无效');
  const scale = Math.min(1, longest / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法准备图片');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
export function visualSource(node: CanvasNode) {
  if (
    node.data.kind === 'audio' ||
    (node.type === 'media' &&
      ['uploading', 'submitting', 'running'].includes(node.data.generation?.status ?? ''))
  )
    return null;
  const url =
    node.type === 'asset'
      ? node.data.upload.status === 'ready'
        ? node.data.upload.url
        : undefined
      : node.data.result?.url;
  return url
    ? {
        url,
        kind: node.data.kind,
        name: node.type === 'asset' ? node.data.name : mediaName(node.data),
      }
    : null;
}
export async function prepareVisualAsset(node: CanvasNode): Promise<VisionAsset[]> {
  const source = visualSource(node);
  if (!source) throw new Error('请选择已完成上传或生成的图片/视频资产');
  const response = await window.desktop?.generation.mediaUrl(source.url);
  if (!response?.ok) throw new Error(response && !response.ok ? response.error : '媒体桥接不可用');
  const result: VisionAsset[] = [];
  function frame(image: CanvasImageSource, w: number, h: number, time?: number) {
    const encoded = capture(image, w, h, 1536);
    const data = encoded.slice(encoded.indexOf(',') + 1);
    if (data.length > 2800000) throw new Error('图片内容过大，请使用较小尺寸的资产');
    result.push({
      nodeId: node.id,
      name: source!.name.slice(0, 200),
      kind: source!.kind === 'video' ? 'video-frame' : 'image',
      time,
      mimeType: 'image/jpeg',
      data,
      preview: capture(image, w, h, 128),
    });
  }
  if (source.kind === 'image') {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    try {
      await waitFor(image, 'load', () => {
        image.src = response.value;
      });
      frame(image, image.naturalWidth, image.naturalHeight);
    } finally {
      image.src = '';
    }
  } else {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    try {
      await waitFor(video, 'loadeddata', () => {
        video.src = response.value;
      });
      if (!Number.isFinite(video.duration) || video.duration <= 0)
        throw new Error('视频缺少有效时长，暂无法抽帧');
      const times = [
        ...new Set([0.1, 0.5, 0.9].map((t) => Number((video.duration * t).toFixed(2)))),
      ];
      for (const time of times) {
        if (Math.abs(video.currentTime - time) > 0.01)
          await waitFor(video, 'seeked', () => {
            video.currentTime = time;
          });
        frame(video, video.videoWidth, video.videoHeight, time);
      }
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }
  return result;
}
