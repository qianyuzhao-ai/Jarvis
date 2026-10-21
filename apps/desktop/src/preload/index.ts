import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopInfo } from '../shared/desktop-info';

const desktop: DesktopInfo = {
  platform: process.platform,
  writing: {
    getRoots: () => ipcRenderer.invoke('writing:roots'),
    chooseDirectory: () => ipcRenderer.invoke('writing:choose'),
    listDirectory: (request) => ipcRenderer.invoke('writing:list', request),
    searchFiles: (request) => ipcRenderer.invoke('writing:search', request),
    readFile: (request) => ipcRenderer.invoke('writing:read', request),
    saveFile: (request) => ipcRenderer.invoke('writing:save', request),
    createEntry: (request) => ipcRenderer.invoke('writing:create', request),
  },
  generation: {
    getDownloadPreferences: () => ipcRenderer.invoke('downloads:get-preferences'),
    chooseDownloadDirectory: () => ipcRenderer.invoke('downloads:choose-directory'),
    setDownloadDontAsk: (value) => ipcRenderer.invoke('downloads:set-dont-ask', value),
    downloadMedia: (request) => ipcRenderer.invoke('generation:download-media', request),
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
