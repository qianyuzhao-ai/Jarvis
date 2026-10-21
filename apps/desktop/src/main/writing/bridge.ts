import { app, BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import {
  writingCreateSchema,
  writingPathSchema,
  writingSaveSchema,
  type WritingResult,
} from '../../shared/writing';
import { WritingConflict, WritingFiles } from './files';

const trusted = new Map<number, string>();
export function trustWritingWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, new URL(url).href);
  contents.once('destroyed', () => trusted.delete(contents.id));
}
export async function registerWriting() {
  const files = new WritingFiles(join(app.getPath('userData'), 'writing-roots.json'));
  let initializationError = '';
  try {
    await files.initialize();
  } catch {
    initializationError = '写作目录记录无法读取，原记录已保留';
  }
  const handlers: Record<string, (request: unknown) => unknown> = {
    'writing:roots': () => files.getRoots(),
    'writing:list': (request) => {
      const r = writingPathSchema.parse(request);
      return files.list(r.rootId, r.path);
    },
    'writing:read': (request) => {
      const r = writingPathSchema.parse(request);
      return files.read(r.rootId, r.path);
    },
    'writing:save': (request) => {
      const r = writingSaveSchema.parse(request);
      return files.save(r.rootId, r.path, r.content, r.revision);
    },
    'writing:create': (request) => {
      const r = writingCreateSchema.parse(request);
      return files.create(r.rootId, r.path, r.name, r.kind);
    },
    'writing:search': (request) => {
      const r = z.object({ rootId: z.string(), query: z.string().min(1).max(200) }).parse(request);
      return files.search(r.rootId, r.query);
    },
  };
  for (const channel of [...Object.keys(handlers), 'writing:choose']) {
    ipcMain.handle(channel, async (event, request): Promise<WritingResult<unknown>> => {
      try {
        if (
          event.senderFrame !== event.sender.mainFrame ||
          event.senderFrame?.url !== trusted.get(event.sender.id)
        )
          throw new Error('请求来源不可信');
        if (initializationError) throw new Error(initializationError);
        if (channel === 'writing:choose') {
          const owner = BrowserWindow.fromWebContents(event.sender);
          if (!owner) throw new Error('未找到写作窗口');
          const result = await dialog.showOpenDialog(owner, {
            title: '打开 Markdown 文件夹',
            properties: ['openDirectory', 'createDirectory'],
          });
          return {
            ok: true,
            value:
              result.canceled || !result.filePaths[0]
                ? null
                : await files.addRoot(result.filePaths[0]),
          };
        }
        const handler = handlers[channel];
        if (!handler) throw new Error('不支持的写作操作');
        return { ok: true, value: await handler(request) };
      } catch (error) {
        return {
          ok: false,
          code: error instanceof WritingConflict ? 'CONFLICT' : 'IO',
          error:
            error instanceof z.ZodError
              ? '写作请求格式不正确'
              : error instanceof Error
                ? error.message
                : '文件操作失败',
        };
      }
    });
  }
}
