import electronUpdater from 'electron-updater';
import type { UpdateBackend, UpdateEvent } from './service';

export function createElectronBackend(updater = electronUpdater.autoUpdater): UpdateBackend {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.autoRunAppAfterInstall = true;
  updater.allowPrerelease = true;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  return {
    async check() {
      await updater.checkForUpdates();
    },
    async download() {
      await updater.downloadUpdate();
    },
    quitAndInstall() {
      updater.quitAndInstall(false, true);
    },
    subscribe(listener) {
      const available = (info: { version: string }) =>
        listener({ type: 'available', version: info.version });
      const current = () => listener({ type: 'current' });
      const progress = (value: Extract<UpdateEvent, { type: 'progress' }>['progress']) =>
        listener({ type: 'progress', progress: value });
      const downloaded = () => listener({ type: 'downloaded' });
      const error = (failure: Error) => {
        console.error('Application update failed:', failure);
        const message = /signature|sha512|checksum/i.test(failure.message)
          ? '更新包完整性或签名校验失败，已停止更新，请重试下载。'
          : '无法读取或下载更新，请检查网络后重试。';
        listener({ type: 'error', message });
      };
      updater.on('update-available', available);
      updater.on('update-not-available', current);
      updater.on('download-progress', progress);
      updater.on('update-downloaded', downloaded);
      updater.on('error', error);
      return () => {
        updater.removeListener('update-available', available);
        updater.removeListener('update-not-available', current);
        updater.removeListener('download-progress', progress);
        updater.removeListener('update-downloaded', downloaded);
        updater.removeListener('error', error);
      };
    },
  };
}
