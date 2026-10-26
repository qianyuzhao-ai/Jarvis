import type { WritingCommand } from '../shared/writing-agent';
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopInfo } from '../shared/desktop-info';
import type { AgentEvent, NavigationTarget } from '../shared/agent';
import type { OsEvent, OsSessionEvent } from '../shared/agent-os';
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
    getSettings: () => ipcRenderer.invoke('agent:settings'),
    setConcurrency: (value) => ipcRenderer.invoke('agent:set-concurrency', value),
    setReplyMode: (value) => ipcRenderer.invoke('agent:set-reply-mode', value),
    listFolders: () => ipcRenderer.invoke('agent:folders'),
    addFolder: () => ipcRenderer.invoke('agent:add-folder'),
    removeFolder: (id) => ipcRenderer.invoke('agent:remove-folder', id),
    calendarStatus: () => ipcRenderer.invoke('agent:calendar-status'),
    requestCalendarAccess: () => ipcRenderer.invoke('agent:calendar-request'),
    calendarEvents: (range) => ipcRenderer.invoke('agent:calendar-events', range),
    addMcpServer: (input) => ipcRenderer.invoke('agent:mcp-add', input),
    removeMcpServer: (id) => ipcRenderer.invoke('agent:mcp-remove', id),
    setMcpServerEnabled: (input) => ipcRenderer.invoke('agent:mcp-enable', input),
    reconnectMcpServer: (id) => ipcRenderer.invoke('agent:mcp-reconnect', id),
    signInMcpServer: (id) => ipcRenderer.invoke('agent:mcp-sign-in', id),
    claimWritingCommand: (id) => ipcRenderer.invoke('agent:claim-writing', id),
    completeWritingCommand: (reply) => ipcRenderer.invoke('agent:complete-writing', reply),
    onWritingCommand: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, command: WritingCommand) =>
        listener(command);
      ipcRenderer.on('agent:writing-command', handle);
      return () => ipcRenderer.removeListener('agent:writing-command', handle);
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
    onEvent: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, event: AgentEvent) => listener(event);
      ipcRenderer.on('agent:event', handle);
      return () => {
        ipcRenderer.removeListener('agent:event', handle);
      };
    },
  },
  os: {
    getSnapshot: () => ipcRenderer.invoke('os:snapshot'),
    onEvent: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, event: OsEvent) => listener(event);
      ipcRenderer.on('os:event', handle);
      return () => ipcRenderer.removeListener('os:event', handle);
    },
    getSession: (id) => ipcRenderer.invoke('os:session', id),
    onSessionEvent: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, event: OsSessionEvent) => listener(event);
      ipcRenderer.on('os:session-event', handle);
      return () => ipcRenderer.removeListener('os:session-event', handle);
    },
    setViewing: (ids) => ipcRenderer.invoke('os:viewing', ids),
    send: (input) => ipcRenderer.invoke('os:send', input),
    steer: (input) => ipcRenderer.invoke('os:steer', input),
    cancel: (id) => ipcRenderer.invoke('os:cancel', id),
    setModel: (input) => ipcRenderer.invoke('os:set-model', input),
    setThinkingLevel: (input) => ipcRenderer.invoke('os:set-thinking', input),
    copyReply: (input) => ipcRenderer.invoke('os:copy-reply', input),
    undo: (id) => ipcRenderer.invoke('os:undo', id),
    stopThread: (id) => ipcRenderer.invoke('os:stop-thread', id),
    resolveThread: (input) => ipcRenderer.invoke('os:resolve-thread', input),
    renameThread: (input) => ipcRenderer.invoke('os:rename-thread', input),
    answerDecision: (input) => ipcRenderer.invoke('os:answer', input),
    createProject: (title) => ipcRenderer.invoke('os:create-project', title),
    updateProject: (input) => ipcRenderer.invoke('os:update-project', input),
    removeProject: (id) => ipcRenderer.invoke('os:remove-project', id),
    setCurrentProject: (id) => ipcRenderer.invoke('os:current-project', id),
    addFolder: (id) => ipcRenderer.invoke('os:add-folder', id),
    removeFolder: (input) => ipcRenderer.invoke('os:remove-folder', input),
    listMemory: (id) => ipcRenderer.invoke('os:memory', id),
    readMemory: (input) => ipcRenderer.invoke('os:memory-topic', input),
    onNavigate: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, target: NavigationTarget) =>
        listener(target);
      ipcRenderer.on('os:navigate', handle);
      return () => ipcRenderer.removeListener('os:navigate', handle);
    },
    onOpen: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, sessionId: string) => listener(sessionId);
      ipcRenderer.on('os:open', handle);
      return () => ipcRenderer.removeListener('os:open', handle);
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
    graph: (request) => ipcRenderer.invoke('writing:graph', request),
    backlinks: (request) => ipcRenderer.invoke('writing:backlinks', request),
    link: (request) => ipcRenderer.invoke('writing:link', request),
    onGraphChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { rootId: string }) =>
        listener(payload);
      ipcRenderer.on('writing:graph-changed', handler);
      return () => ipcRenderer.removeListener('writing:graph-changed', handler);
    },
    rename: (request) => ipcRenderer.invoke('writing:rename', request),
    move: (request) => ipcRenderer.invoke('writing:move', request),
    duplicate: (request) => ipcRenderer.invoke('writing:duplicate', request),
    trash: (request) => ipcRenderer.invoke('writing:trash', request),
    reveal: (request) => ipcRenderer.invoke('writing:reveal', request),
    saveAsset: (request) => ipcRenderer.invoke('writing:save-asset', request),
    watch: (request) => ipcRenderer.invoke('writing:watch', request),
    unwatch: (request) => ipcRenderer.invoke('writing:unwatch', request),
    onChanged: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: import('../shared/writing').WritingChanged,
      ) => listener(data);
      ipcRenderer.on('writing:changed', handler);
      return () => {
        ipcRenderer.removeListener('writing:changed', handler);
      };
    },
    onRenamed: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: import('../shared/writing').WritingRenamed,
      ) => listener(data);
      ipcRenderer.on('writing:renamed', handler);
      return () => {
        ipcRenderer.removeListener('writing:renamed', handler);
      };
    },
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
