import { Readable } from 'node:stream';
import type { WritingFiles } from './files';

const mime: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};
export async function writingAssetResponse(
  files: WritingFiles,
  request: Request,
): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  try {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.slice(1));
    const { handle, size } = await files.asset(url.hostname, path);
    let start = 0,
      end = size - 1;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        if (match[1]) {
          start = Number(match[1]);
          end = match[2] ? Math.min(Number(match[2]), end) : end;
        } else start = Math.max(0, size - Number(match[2]));
      } else start = size;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size
      ) {
        await handle.close();
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      }
    }
    const headers: Record<string, string> = {
      'content-type':
        mime[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream',
      'content-length': String(Math.max(0, end - start + 1)),
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    };
    if (range) headers['content-range'] = `bytes ${start}-${end}/${size}`;
    if (!size) {
      await handle.close();
      return new Response(null, { headers });
    }
    const stream = handle.createReadStream({ start, end, autoClose: true });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: range ? 206 : 200,
      headers,
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
