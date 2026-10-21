import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopInfo } from '../shared/desktop-info';
import type { AgentEvent } from '../shared/agent';
import type { CanvasCommand } from '../shared/canvas-agent';

const desktop: DesktopInfo = {
  platform: process.platform,
  agent: {
    getConfiguration: () => ipcRenderer.invoke('agent:configuration'),
    saveConfiguration: (input) => ipcRenderer.invoke('agent:save', input),
    testConnection: (input) => ipcRenderer.invoke('agent:test', input),
    listModels: (input) => ipcRenderer.invoke('agent:models', input),
    getSnapshot: () => ipcRenderer.invoke('agent:snapshot'),
    createSession: () => ipcRenderer.invoke('agent:create'),
    createCanvasSession: (projectId) => ipcRenderer.invoke('agent:create-canvas', projectId),
    claimCanvasCommand: (id) => ipcRenderer.invoke('agent:claim-canvas', id),
    completeCanvasCommand: (reply) => ipcRenderer.invoke('agent:complete-canvas', reply),
    onCanvasCommand: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, command: CanvasCommand) =>
        listener(command);
      ipcRenderer.on('agent:canvas-command', handle);
      return () => ipcRenderer.removeListener('agent:canvas-command', handle);
    },
    renameSession: (input) => ipcRenderer.invoke('agent:rename', input),
    deleteSession: (id) => ipcRenderer.invoke('agent:delete', id),
    setModel: (input) => ipcRenderer.invoke('agent:model', input),
    send: (input) => ipcRenderer.invoke('agent:send', input),
    cancel: (runId) => ipcRenderer.invoke('agent:cancel', runId),
    copyReply: (input) => ipcRenderer.invoke('agent:copy-reply', input),
    onEvent: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, value: AgentEvent) => listener(value);
      ipcRenderer.on('agent:event', handle);
      return () => {
        ipcRenderer.removeListener('agent:event', handle);
      };
    },
  },
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
