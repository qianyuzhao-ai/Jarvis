import { app, BrowserWindow, dialog, ipcMain, shell, protocol, type WebContents } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import {
  writingCreateSchema,
  writingRenameSchema,
  writingMoveSchema,
  writingAssetSchema,
  writingPathSchema,
  writingSaveSchema,
  type WritingResult,
} from '../../shared/writing';
import { WritingConflict, WritingFiles } from './files';
import { WritingWatcher } from './watcher';
import { writingAssetResponse } from './asset-protocol';
import { writingAgentService } from '../agent/bridge';

const trusted = new Map<number, string>();
let registered: WritingFiles | undefined;
/** The writing folders, for the main Agent's document tools once registered. */
export const writingFiles = () => registered;
let watcher: WritingWatcher | undefined;
let activeWrites = 0;
export const isWritingBusy = () => activeWrites > 0;
export function trustWritingWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, new URL(url).href);
  contents.once('destroyed', () => {
    trusted.delete(contents.id);
    watcher?.removeOwner(contents.id);
  });
}
export async function registerWriting() {
  const files = new WritingFiles(join(app.getPath('userData'), 'writing-roots.json'), {
    trash: (path) => shell.trashItem(path),
    reveal: (path) => shell.showItemInFolder(path),
  });
  let initializationError = '';
  try {
    await files.initialize();
  } catch {
    initializationError = '写作目录记录无法读取，原记录已保留';
  }
  if (!initializationError) registered = files;
  function push(channel: string, payload: unknown, owners?: Set<number>) {
    for (const window of BrowserWindow.getAllWindows()) {
      const contents = window.webContents;
      if (trusted.get(contents.id) === contents.getURL() && (!owners || owners.has(contents.id)))
        contents.send(channel, payload);
    }
  }
  watcher = new WritingWatcher(files, (rootId, paths, owners) =>
    push('writing:changed', { rootId, paths }, owners),
  );
  protocol.handle('jarvis-writing', (request) => writingAssetResponse(files, request));
  async function relocate(
    rootId: string,
    path: string,
    operation: () => Promise<import('../../shared/writing').WritingEntry>,
  ) {
    const agent = writingAgentService();
    const entry = agent ? await agent.relocateWriting(rootId, path, operation) : await operation();
    push('writing:renamed', { rootId, from: path, to: entry.path });
    push('writing:changed', { rootId, paths: [path, entry.path] });
    return entry;
  }
  const handlers: Record<string, (request: unknown) => unknown> = {
    'writing:rename': (request) => {
      const r = writingRenameSchema.parse(request);
      return relocate(r.rootId, r.path, () => files.rename(r.rootId, r.path, r.name));
    },
    'writing:move': (request) => {
      const r = writingMoveSchema.parse(request);
      return relocate(r.rootId, r.path, () => files.move(r.rootId, r.path, r.targetDir));
    },
    'writing:duplicate': (request) => {
      const r = writingPathSchema.parse(request);
      return files.duplicate(r.rootId, r.path);
    },
    'writing:trash': (request) => {
      const r = writingPathSchema.parse(request);
      return files.trash(r.rootId, r.path);
    },
    'writing:reveal': (request) => {
      const r = writingPathSchema.parse(request);
      return files.reveal(r.rootId, r.path);
    },
    'writing:save-asset': (request) => {
      const r = writingAssetSchema.parse(request);
      return files.saveAsset(r.rootId, r.documentPath, r.mime, r.bytes);
    },
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
  for (const channel of [
    ...Object.keys(handlers),
    'writing:choose',
    'writing:watch',
    'writing:unwatch',
  ]) {
    ipcMain.handle(channel, async (event, request): Promise<WritingResult<unknown>> => {
      const writing = [
        'writing:save',
        'writing:create',
        'writing:choose',
        'writing:rename',
        'writing:move',
        'writing:duplicate',
        'writing:trash',
        'writing:save-asset',
      ].includes(channel);
      if (writing) activeWrites++;
      try {
        if (
          event.senderFrame !== event.sender.mainFrame ||
          event.senderFrame?.url !== trusted.get(event.sender.id)
        )
          throw new Error('请求来源不可信');
        if (initializationError) throw new Error(initializationError);
        if (channel === 'writing:watch' || channel === 'writing:unwatch') {
          const r = z.object({ rootId: z.string().min(1).max(64) }).parse(request);
          return {
            ok: true,
            value:
              channel === 'writing:watch'
                ? watcher?.subscribe(r.rootId, event.sender.id)
                : watcher?.unsubscribe(r.rootId, event.sender.id),
          };
        }
        if (channel === 'writing:choose') {
          const owner = BrowserWindow.fromWebContents(event.sender);
          if (!owner) throw new Error('未找到写作窗口');
          const result = await dialog.showOpenDialog(owner, {
            title: '打开写作文件夹',
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
              : (error as NodeJS.ErrnoException)?.code
                ? '文件操作失败，请检查文件是否存在及访问权限'
                : error instanceof Error
                  ? error.message
                  : '文件操作失败',
        };
      } finally {
        if (writing) activeWrites--;
      }
    });
  }
}
