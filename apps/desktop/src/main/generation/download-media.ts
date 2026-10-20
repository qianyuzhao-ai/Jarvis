import { dialog, net, type BrowserWindow } from 'electron';
import { copyFile, open, rename, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, extname, join, parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { DownloadMedia, DownloadPreferences } from '../../shared/generation';
import { validateDownloadDirectory } from './download-preferences';

const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/ogg': 'ogv',
  'video/x-msvideo': 'avi',
};
function downloadFileName(request: DownloadMedia, contentType: string) {
  const path = new URL(request.url).pathname;
  let original = request.fileName || basename(path);
  try {
    original = decodeURIComponent(original);
  } catch {
    /* Keep malformed URL names readable. */
  }
  original = basename(original)
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\p{Cc}/gu, '')
    .replace(/[. ]+$/g, '');
  const allowed =
    request.kind === 'image'
      ? ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff', 'svg', 'heic', 'heif']
      : ['mp4', 'webm', 'mov', 'mkv', 'ogv', 'avi', 'm4v'];
  const fromName = extname(original).slice(1).toLowerCase();
  const extension =
    extensions[contentType] ??
    (allowed.includes(fromName) ? fromName : request.kind === 'image' ? 'png' : 'mp4');
  const name = (parse(original).name || (request.kind === 'image' ? '图像' : '视频')).slice(0, 100);
  return { name: `${name}.${extension}`, extension };
}
export async function downloadMedia(
  request: DownloadMedia,
  owner: BrowserWindow,
  preferences: DownloadPreferences,
) {
  if (preferences.dontAskAgain) await validateDownloadDirectory(preferences.directory);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('下载超时，请重试')), 10 * 60 * 1000);
  let partial: string | undefined;
  try {
    const response = await net.fetch(request.url, {
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`服务器返回 HTTP ${response.status}`);
    if (!response.body) throw new Error('服务器没有返回文件内容');
    const contentType =
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (
      contentType &&
      contentType !== 'application/octet-stream' &&
      !contentType.startsWith(request.kind + '/')
    )
      throw new Error('下载链接返回的文件类型不匹配，请检查资源是否仍然有效');
    const suggested = downloadFileName(request, contentType);
    const selection = preferences.dontAskAgain
      ? { canceled: false, filePath: join(preferences.directory, suggested.name) }
      : await dialog.showSaveDialog(owner, {
          title: request.kind === 'image' ? '下载图像' : '下载视频',
          defaultPath: preferences.directory
            ? join(preferences.directory, suggested.name)
            : suggested.name,
          filters: [
            { name: request.kind === 'image' ? '图像' : '视频', extensions: [suggested.extension] },
          ],
        });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    let filePath = extname(selection.filePath)
      ? selection.filePath
      : `${selection.filePath}.${suggested.extension}`;
    const temporary = `${filePath}.${randomUUID()}.part`;
    const file = await open(temporary, 'wx', 0o600);
    partial = temporary;
    const reader = response.body.getReader();
    async function* chunks() {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }
    await pipeline(Readable.from(chunks()), file.createWriteStream());
    if (!(await stat(temporary)).size) throw new Error('服务器返回的文件为空');
    if (preferences.dontAskAgain) {
      const { name, ext } = parse(filePath);
      for (let index = 0; ; index++) {
        const candidate = join(preferences.directory, `${name}${index ? ` (${index})` : ''}${ext}`);
        try {
          await copyFile(temporary, candidate, constants.COPYFILE_EXCL);
          filePath = candidate;
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      await unlink(temporary);
    } else await rename(temporary, filePath);
    partial = undefined;
    return { canceled: false, filePath };
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (partial) await unlink(partial);
  }
}
