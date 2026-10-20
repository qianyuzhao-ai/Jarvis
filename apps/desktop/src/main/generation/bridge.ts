import { ipcMain, net, protocol, type WebContents, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { GenerationJobs } from './jobs';
import { upload } from './protocol';
import {
  startRequestSchema,
  uploadRequestSchema,
  httpUrl,
  type BridgeResult,
} from '../../shared/generation';

const trusted = new Map<number, string>();
export function trustGenerationWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, url);
  contents.once('destroyed', () => trusted.delete(contents.id));
}
function assertSender(event: IpcMainInvokeEvent) {
  const expected = trusted.get(event.sender.id);
  if (
    !expected ||
    event.senderFrame !== event.sender.mainFrame ||
    event.senderFrame?.url !== expected
  )
    throw new Error('请求来源不可信');
}
export async function registerGeneration(file: string) {
  const jobs = new GenerationJobs(file);
  const mediaUrls = new Map<string, string>();
  const mediaIds = new Map<string, string>();
  let storageError = false;
  try {
    await jobs.initialize();
  } catch {
    storageError = true;
  }
  function handle<T>(
    channel: string,
    callback: (request: unknown) => Promise<T> | T,
    requiresJobs = true,
  ) {
    ipcMain.handle(channel, async (event, request): Promise<BridgeResult<T>> => {
      try {
        assertSender(event);
        if (requiresJobs && storageError)
          throw new Error('本地任务记录无法读取，原文件已保留；请先恢复记录再生成');
        return { ok: true, value: await callback(request) };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join('；')
              : error instanceof Error
                ? error.message
                : '请求失败',
        };
      }
    });
  }
  handle('generation:upload', (request) => upload(uploadRequestSchema.parse(request)), false);
  handle('generation:start', (request) => jobs.start(startRequestSchema.parse(request)));
  handle('generation:get', (request) => jobs.get(z.uuid().parse(request)));
  handle(
    'generation:media-url',
    (request) => {
      const target = httpUrl.parse(request);
      let id = mediaIds.get(target);
      if (!id) {
        id = randomUUID();
        mediaIds.set(target, id);
        mediaUrls.set(id, target);
      }
      return `jarvis-media://url/${id}`;
    },
    false,
  );
  protocol.handle('jarvis-media', async (request) => {
    const url = new URL(request.url);
    const id = url.pathname.slice(1);
    if (!z.uuid().safeParse(id).success || request.method !== 'GET')
      return new Response('Not found', { status: 404 });
    const job = url.hostname === 'result' ? jobs.get(id) : undefined;
    const targetUrl =
      url.hostname === 'url'
        ? mediaUrls.get(id)
        : job?.status === 'succeeded'
          ? job.resultUrl
          : undefined;
    if (!targetUrl) return new Response('Not found', { status: 404 });
    try {
      const target = httpUrl.parse(targetUrl);
      const headers = new Headers();
      const range = request.headers.get('range');
      if (range) headers.set('range', range);
      const response = await net.fetch(target, {
        method: 'GET',
        headers,
        credentials: 'omit',
        redirect: 'error',
      });
      const safeHeaders = new Headers();
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = response.headers.get(name);
        if (value) safeHeaders.set(name, value);
      }
      safeHeaders.set('Cache-Control', 'no-store');
      safeHeaders.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers: safeHeaders });
    } catch {
      return new Response('无法读取媒体', { status: 502 });
    }
  });
}
