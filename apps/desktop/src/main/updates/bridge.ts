import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { UpdateResult, UpdateState } from '../../shared/updates';
import { isAgentBusy } from '../agent/bridge';
import { isGenerationBusy } from '../generation/bridge';
import { isWritingBusy } from '../writing/bridge';
import { createElectronBackend } from './backend';
import { InstallPreparation } from './preparation';
import { UpdateService, type UpdateBackend } from './service';

const trusted = new Map<number, { contents: WebContents; url: string }>();
const preparation = new InstallPreparation();
let service: UpdateService;
let backend: UpdateBackend;
let restoreWindow: () => Promise<void>;
let installationWindowClosed = false;

export function trustUpdateWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, { contents, url: new URL(url).href });
  contents.once('destroyed', () => {
    trusted.delete(contents.id);
    preparation.cancel(contents.id);
  });
}
export function isUpdateInstalling() {
  return service?.snapshot().phase === 'installing';
}

export function configureUpdates(adapter: UpdateBackend, disabledReason?: string) {
  service?.dispose();
  backend = adapter;
  service = new UpdateService(adapter, app.getVersion(), disabledReason);
  service.onChange = (state) => {
    for (const { contents, url } of trusted.values())
      if (!contents.isDestroyed() && contents.getURL() === url)
        contents.send('updates:state', state);
    if (
      installationWindowClosed &&
      state.error &&
      ['available', 'downloaded'].includes(state.phase)
    ) {
      installationWindowClosed = false;
      if (BrowserWindow.getAllWindows().length === 0)
        void restoreWindow().catch(() =>
          dialog.showErrorBox('更新安装未能启动', state.error || '请重新打开 Jarvis。'),
        );
    }
  };
  return service;
}

function assertSender(event: IpcMainInvokeEvent) {
  if (
    event.senderFrame !== event.sender.mainFrame ||
    event.senderFrame?.url !== trusted.get(event.sender.id)?.url
  )
    throw new Error('更新请求来源不可信。');
}
function assertIdle() {
  if (isAgentBusy() || isGenerationBusy() || isWritingBusy())
    throw new Error('请先等待生成、上传、下载或 Agent 请求完成，再重启安装。');
}
async function install(window: BrowserWindow) {
  assertIdle();
  const confirmation = await dialog.showMessageBox(window, {
    type: 'question',
    title: '重启并安装更新',
    message: `安装 Jarvis ${service.snapshot().nextVersion}？`,
    detail:
      '安装前会保存项目和写作文档，随后关闭并重新打开 Jarvis。未保存的设置或保存失败会阻止安装。',
    buttons: ['稍后', '重启并安装'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (confirmation.response !== 1) return false;
  assertIdle();
  if (window.isDestroyed()) throw new Error('窗口已关闭，未启动安装。');
  await preparation.request(window.webContents.id, (id) =>
    window.webContents.send('updates:prepare', id),
  );
  assertIdle();
  await new Promise<void>((resolve, reject) => {
    const closed = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      window.removeListener('closed', closed);
      reject(new Error('窗口未能关闭，未启动安装，请处理未保存内容后重试。'));
    }, 5000);
    window.once('closed', closed);
    window.close();
  });
  installationWindowClosed = true;
  backend.quitAndInstall();
  return true;
}

export function registerUpdates(onRestoreWindow: () => Promise<void>) {
  restoreWindow = onRestoreWindow;
  const reason = !app.isPackaged
    ? '开发模式不检查更新，请安装发布版本。'
    : !['darwin', 'win32'].includes(process.platform)
      ? '当前平台暂不支持应用内更新。'
      : !existsSync(join(process.resourcesPath, 'app-update.yml'))
        ? '此安装包没有更新源，请安装 GitHub Releases 的发布版本。'
        : undefined;
  configureUpdates(createElectronBackend(), reason);
  const handlers: Record<
    string,
    (event: IpcMainInvokeEvent, input: unknown) => UpdateState | Promise<UpdateState>
  > = {
    'updates:state': () => service.snapshot(),
    'updates:check': () => service.check(),
    'updates:download': () => service.download(),
    'updates:install': (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error('当前窗口不可用。');
      return service.install(() => install(window));
    },
    'updates:prepared': (event, input) => {
      const reply = z
        .object({ id: z.uuid(), ready: z.boolean(), error: z.string().max(500).optional() })
        .strict()
        .parse(input);
      preparation.complete(event.sender.id, reply);
      return service.snapshot();
    },
  };
  for (const [channel, handler] of Object.entries(handlers))
    ipcMain.handle(channel, async (event, input): Promise<UpdateResult> => {
      try {
        assertSender(event);
        return { ok: true, value: await handler(event, input) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '更新操作失败，请重试。',
        };
      }
    });
  service.startAutomaticChecks();
  app.once('will-quit', () => service.dispose());
}
