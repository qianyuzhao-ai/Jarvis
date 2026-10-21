import {
  app,
  clipboard,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  type WebContents,
  type IpcMainInvokeEvent,
} from 'electron';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { GenerationJobs } from './jobs';
import { UploadHistory } from './upload-history';
import { createProjectWorkbook, exportFileName } from './export-project';
import { downloadMedia } from './download-media';
import { DownloadPreferencesStore } from './download-preferences';
import {
  startRequestSchema,
  uploadRequestSchema,
  httpUrl,
  exportProjectSchema,
  downloadMediaSchema,
  type BridgeResult,
} from '../../shared/generation';

const trusted = new Map<number, string>();
export function trustGenerationWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, new URL(url).href);
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
  const downloadPreferences = new DownloadPreferencesStore(
    join(dirname(file), 'download-preferences.json'),
  );
  let preferencesError = false;
  try {
    await downloadPreferences.initialize();
  } catch {
    preferencesError = true;
  }
  const jobs = new GenerationJobs(file);
  const uploads = new UploadHistory(join(dirname(file), 'upload-history.json'));
  let uploadHistoryError = false;
  try {
    await uploads.initialize();
  } catch {
    uploadHistoryError = true;
  }
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
    callback: (request: unknown, event: IpcMainInvokeEvent) => Promise<T> | T,
    requiresJobs = true,
  ) {
    ipcMain.handle(channel, async (event, request): Promise<BridgeResult<T>> => {
      try {
        assertSender(event);
        if (requiresJobs && storageError)
          throw new Error('本地任务记录无法读取，原文件已保留；请先恢复记录再生成');
        return { ok: true, value: await callback(request, event) };
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
  handle(
    'generation:upload',
    (request) => {
      if (uploadHistoryError) throw new Error('上传请求账本无法读取，原文件已保留；请先恢复记录');
      return uploads.upload(uploadRequestSchema.parse(request));
    },
    false,
  );
  handle('generation:start', (request) => jobs.start(startRequestSchema.parse(request)));
  handle('generation:get', (request) => jobs.get(z.uuid().parse(request)));
  handle('generation:copy-result-url', (request) => {
    const job = jobs.get(z.uuid().parse(request));
    if (!job || job.status !== 'succeeded' || !job.resultUrl)
      throw new Error('没有可复制的成功生成结果');
    clipboard.writeText(httpUrl.parse(job.resultUrl));
  });
  const preferences = () => {
    if (preferencesError) throw new Error('下载设置无法读取，原文件已保留，请先恢复设置文件');
    return downloadPreferences.get();
  };
  handle('downloads:get-preferences', () => preferences(), false);
  handle(
    'downloads:set-dont-ask',
    (value) => {
      preferences();
      return downloadPreferences.setDontAsk(z.boolean().parse(value));
    },
    false,
  );
  handle(
    'downloads:choose-directory',
    async (_, event) => {
      const current = preferences();
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('未找到设置窗口');
      const result = await dialog.showOpenDialog(owner, {
        title: '选择默认下载文件夹',
        defaultPath: current.directory || app.getPath('downloads'),
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true, preferences: current };
      return {
        canceled: false,
        preferences: await downloadPreferences.setDirectory(result.filePaths[0]),
      };
    },
    false,
  );
  handle(
    'generation:download-media',
    (request, event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('未找到当前画布窗口');
      return downloadMedia(downloadMediaSchema.parse(request), owner, preferences());
    },
    false,
  );
  handle('generation:export-project', async (request, event) => {
    if (uploadHistoryError) throw new Error('上传请求账本无法读取，导出已停止以免遗漏记录');
    const project = exportProjectSchema.parse(request);
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error('未找到当前画布窗口');
    const selection = await dialog.showSaveDialog(owner, {
      title: '导出画布请求记录',
      defaultPath: exportFileName(project.projectName),
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
    });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    const filePath = selection.filePath.toLowerCase().endsWith('.xlsx')
      ? selection.filePath
      : selection.filePath + '.xlsx';
    const records = [...jobs.records(project.projectId), ...uploads.records(project.projectId)];
    const bytes = await createProjectWorkbook(project, records);
    await writeFile(filePath, bytes);
    return { canceled: false, filePath };
  });
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
      safeHeaders.set('Access-Control-Allow-Origin', '*');
      safeHeaders.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers: safeHeaders });
    } catch {
      return new Response('无法读取媒体', { status: 502 });
    }
  });
}
