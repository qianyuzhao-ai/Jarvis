import type { WritingCommand } from '../shared/writing-agent';
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopInfo } from '../shared/desktop-info';
import type { AgentEvent, NavigationTarget, SessionEvent } from '../shared/agent';
import type { ApprovalRequest } from '../shared/agent-approval';
import type { CanvasCommand } from '../shared/canvas-agent';
import type { UpdateState } from '../shared/updates';
import type { ProjectChange } from '../shared/project';

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
    getSnapshot: () => ipcRenderer.invoke('agent:snapshot'),
    getSettings: () => ipcRenderer.invoke('agent:settings'),
    setConcurrency: (value) => ipcRenderer.invoke('agent:set-concurrency', value),
    setReplyMode: (value) => ipcRenderer.invoke('agent:set-reply-mode', value),
    steer: (input) => ipcRenderer.invoke('agent:steer', input),
    listFolders: () => ipcRenderer.invoke('agent:folders'),
    addMcpServer: (input) => ipcRenderer.invoke('agent:mcp-add', input),
    removeMcpServer: (id) => ipcRenderer.invoke('agent:mcp-remove', id),
    setMcpServerEnabled: (input) => ipcRenderer.invoke('agent:mcp-enable', input),
    reconnectMcpServer: (id) => ipcRenderer.invoke('agent:mcp-reconnect', id),
    signInMcpServer: (id) => ipcRenderer.invoke('agent:mcp-sign-in', id),
    addFolder: () => ipcRenderer.invoke('agent:add-folder'),
    removeFolder: (id) => ipcRenderer.invoke('agent:remove-folder', id),
    getSession: (id) => ipcRenderer.invoke('agent:session', id),
    onSessionEvent: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, value: SessionEvent) => listener(value);
      ipcRenderer.on('agent:session-event', handle);
      return () => ipcRenderer.removeListener('agent:session-event', handle);
    },
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
    undo: (input) => ipcRenderer.invoke('agent:undo', input),
    listApprovals: () => ipcRenderer.invoke('agent:approvals'),
    respondApproval: (input) => ipcRenderer.invoke('agent:respond-approval', input),
    onApprovals: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, requests: ApprovalRequest[]) =>
        listener(requests);
      ipcRenderer.on('agent:approvals', handle);
      return () => ipcRenderer.removeListener('agent:approvals', handle);
    },
    setOpenTargets: (targets) => ipcRenderer.invoke('agent:open-targets', targets),
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
    setThinkingLevel: (input) => ipcRenderer.invoke('agent:thinking', input),
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
    onNavigate: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, value: NavigationTarget) =>
        listener(value);
      ipcRenderer.on('agent:navigate', handle);
      return () => ipcRenderer.removeListener('agent:navigate', handle);
    },
  },
  models: {
    getSettings: () => ipcRenderer.invoke('models:settings'),
    getCatalog: () => ipcRenderer.invoke('models:catalog'),
    saveProvider: (input) => ipcRenderer.invoke('models:save-provider', input),
    testProvider: (input) => ipcRenderer.invoke('models:test-provider', input),
    listCandidates: (input) => ipcRenderer.invoke('models:candidates', input),
    setProviderModels: (input) => ipcRenderer.invoke('models:set-provider-models', input),
    updateModel: (input) => ipcRenderer.invoke('models:update', input),
    removeModel: (id) => ipcRenderer.invoke('models:remove', id),
    removeProvider: (id) => ipcRenderer.invoke('models:remove-provider', id),
    setDefaultModel: (id) => ipcRenderer.invoke('models:default', id),
    probeVision: (id) => ipcRenderer.invoke('models:probe-vision', id),
  },
  projects: {
    migrated: () => ipcRenderer.invoke('projects:migrated'),
    migrate: (input) => ipcRenderer.invoke('projects:migrate', input),
    list: () => ipcRenderer.invoke('projects:list'),
    get: (id) => ipcRenderer.invoke('projects:get', id),
    readBlob: (input) => ipcRenderer.invoke('projects:read-blob', input),
    putBlob: (input) => ipcRenderer.invoke('projects:put-blob', input),
    create: (input) => ipcRenderer.invoke('projects:create', input),
    apply: (input) => ipcRenderer.invoke('projects:apply', input),
    remove: (input) => ipcRenderer.invoke('projects:remove', input),
    onChange: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, change: ProjectChange) => listener(change);
      ipcRenderer.on('projects:changed', handle);
      return () => ipcRenderer.removeListener('projects:changed', handle);
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
    setAgentSettings: (settings) => ipcRenderer.invoke('generation:agent-settings', settings),
  },
  versions: {
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
  },
};

contextBridge.exposeInMainWorld('desktop', desktop);
