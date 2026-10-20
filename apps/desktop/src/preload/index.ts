import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopInfo } from '../shared/desktop-info';

const desktop: DesktopInfo = {
  platform: process.platform,
  generation: {
    exportProject: (request) => ipcRenderer.invoke('generation:export-project', request),
    mediaUrl: (url) => ipcRenderer.invoke('generation:media-url', url),
    upload: (request) => ipcRenderer.invoke('generation:upload', request),
    start: (request) => ipcRenderer.invoke('generation:start', request),
    get: (requestId) => ipcRenderer.invoke('generation:get', requestId),
  },
  versions: {
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
  },
};

contextBridge.exposeInMainWorld('desktop', desktop);
