import type { WritingCommand } from '../shared/writing-agent';
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopInfo } from '../shared/desktop-info';
import type { AgentEvent } from '../shared/agent';
import type { CanvasCommand } from '../shared/canvas-agent';
import type { UpdateState } from '../shared/updates';

const desktop: DesktopInfo = {
  platform: process.platform,
  appearance: {
    getAccentColor: () => ipcRenderer.invoke('appearance:accent'),
    onAccentColor: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, color: string | null) => listener(color);
      ipcRenderer.on('appearance:accent-changed', handle);
      return () => {
        ipcRenderer.removeListener('appearance:accent-changed', handle);
      };
    },
  },
  updates: {
    getState: () => ipcRenderer.invoke('updates:state'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    completePreparation: (input) => ipcRenderer.invoke('updates:prepared', input),
    onState: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, value: UpdateState) => listener(value);
      ipcRenderer.on('updates:state', handle);
      return () => ipcRenderer.removeListener('updates:state', handle);
    },
    onPrepareInstall: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, id: string) => listener(id);
      ipcRenderer.on('updates:prepare', handle);
      return () => ipcRenderer.removeListener('updates:prepare', handle);
    },
  },
  agent: {
    listSkills: () => ipcRenderer.invoke('agent:skills'),
    importSkill: () => ipcRenderer.invoke('agent:import-skill'),
    setSkillEnabled: (input) => ipcRenderer.invoke('agent:enable-skill', input),
    getConfiguration: () => ipcRenderer.invoke('agent:configuration'),
    saveConfiguration: (input) => ipcRenderer.invoke('agent:save', input),
    removeModel: (id) => ipcRenderer.invoke('agent:remove-model', id),
    setDefaultModel: (id) => ipcRenderer.invoke('agent:default-model', id),
    testConnection: (input) => ipcRenderer.invoke('agent:test', input),
    listModels: (input) => ipcRenderer.invoke('agent:models', input),
    getSnapshot: () => ipcRenderer.invoke('agent:snapshot'),
    createSession: () => ipcRenderer.invoke('agent:create'),
    createCanvasSession: (projectId) => ipcRenderer.invoke('agent:create-canvas', projectId),
    createWritingSession: (scope) => ipcRenderer.invoke('agent:create-writing', scope),
    claimWritingCommand: (id) => ipcRenderer.invoke('agent:claim-writing', id),
    completeWritingCommand: (reply) => ipcRenderer.invoke('agent:complete-writing', reply),
    onWritingCommand: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, command: WritingCommand) =>
        listener(command);
      ipcRenderer.on('agent:writing-command', handle);
      return () => ipcRenderer.removeListener('agent:writing-command', handle);
    },
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
    getPlatformLogin: (endpoint) => ipcRenderer.invoke('generation:login-status', endpoint),
    openPlatformLogin: (config) => ipcRenderer.invoke('generation:login-open', config),
    verifyPlatformLogin: (endpoint) => ipcRenderer.invoke('generation:login-verify', endpoint),
    logoutPlatform: (endpoint) => ipcRenderer.invoke('generation:login-logout', endpoint),
    copyResultUrl: (requestId) => ipcRenderer.invoke('generation:copy-result-url', requestId),
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
