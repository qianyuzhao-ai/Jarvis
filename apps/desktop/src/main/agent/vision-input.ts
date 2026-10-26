import type { CanvasSnapshot } from '../../shared/canvas-agent';
import type { VisionAsset } from '../../shared/canvas-vision';

/**
 * Checks images a canvas sidebar sends: each is a selected image node (or a frame of a selected
 * video node) of the thread's canvas, the bytes match the declared type, and the conversation
 * stays within its image budget.
 */
export function validateVisionInput(images: VisionAsset[], canvas: CanvasSnapshot, sent: number) {
  if (!images.length) return;
  if (images.reduce((sum, image) => sum + image.data.length, 0) > 16000000)
    throw new Error('图片内容较大，请减少发送的资产');
  if (sent + images.length > 60) throw new Error('这个线程图片较多，请开新线程后继续');
  for (const image of images) {
    const node = canvas.nodes.find((n) => n.id === image.nodeId);
    if (
      !node ||
      !canvas.selectedIds.includes(node.id) ||
      (image.kind === 'image' ? node.kind !== 'image' : node.kind !== 'video')
    )
      throw new Error('图片附件与本次引用的画布资产不匹配');
    const bytes = Buffer.from(image.data, 'base64');
    const valid =
      image.mimeType === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216
        : image.mimeType === 'image/png'
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes.subarray(0, 4).toString() === 'RIFF' &&
            bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid) throw new Error('图片内容格式不正确，请重新添加资产');
  }
}
