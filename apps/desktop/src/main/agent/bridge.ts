import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Notification,
  shell,
  type WebContents,
} from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import { agentId, type AgentResult } from '../../shared/agent';
import {
  decisionAnswerSchema,
  osId,
  osSendSchema,
  projectPatchSchema,
  spaceThreadSchema,
} from '../../shared/agent-os';
import {
  providerInputSchema,
  providerTestSchema,
  setProviderModelsSchema,
  thinkingInputSchema,
  updateModelSchema,
} from '../../shared/models';
import { providerCatalog } from './catalog';
import { JsonFile } from './json-file';
import { systemKeyCipher } from './key-cipher';
import { ModelStore } from './model-store';
import { concurrencySchema, replyModeSchema } from '../../shared/agent-settings';
import { folderId } from '../../shared/agent-files';
import { McpService } from './mcp/service';
import { AppleCalendar } from './calendar/apple';
import { LocalCalendar } from './calendar/local';
import { rangeSchema } from '../../shared/agent-calendar';
import { mcpServerInputSchema } from '../../shared/agent-mcp';
import { memoryName } from './kernel/memory';
import { openTargetsSchema } from '../../shared/agent-targets';
import { canvasReplySchema } from '../../shared/canvas-agent';
import { writingReplySchema } from '../../shared/writing-agent';
import { projectStore } from '../projects/bridge';
import { generationRunner } from '../generation/bridge';
import { writingFiles, writingGraph } from '../writing/bridge';
import { AgentOs } from './os/service';

const trusted = new Map<number, { contents: WebContents; url: string }>();
let os: AgentOs;
/** The Agent OS, for the writing space's link and rename operations. */
export const writingAgentService = () => os;
export const isAgentBusy = () => os?.isBusy ?? false;
export function trustAgentWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, { contents, url: new URL(url).href });
  contents.on('did-start-navigation', (_event, _url, _inPlace, main) => {
    if (main) os?.dropWindow(contents.id);
  });
  contents.once('destroyed', () => {
    trusted.delete(contents.id);
    os?.dropWindow(contents.id);
  });
}
const open = () =>
  [...trusted.values()].filter(
    ({ contents, url }) => !contents.isDestroyed() && contents.getURL() === url,
  );
const broadcast = (channel: string, payload: unknown) => {
  for (const { contents } of open()) contents.send(channel, payload);
};
async function pickFolder(owner: number, title: string) {
  const contents = trusted.get(owner)?.contents;
  const window = contents && BrowserWindow.fromWebContents(contents);
  if (!window) throw new Error('当前窗口不可用');
  const result = await dialog.showOpenDialog(window, {
    title,
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

/**
 * The Agent OS in the main process and its IPC. Rounds belong to no window: any trusted window
 * may watch, steer or stop them, and they go on when windows close. Decision cards are answered
 * by `os:answer` (a click in a trusted window) or, for questions that are not irreversible, by a
 * button on their macOS notification.
 */
export async function registerAgent() {
  const root = join(app.getPath('userData'), 'agent');
  const config = new ModelStore(new JsonFile(join(root, 'connection.json')), systemKeyCipher);
  const mcp = new McpService(join(root, 'mcp.json'), join(root, 'mcp-oauth'), systemKeyCipher, {
    openExternal: (url) => void shell.openExternal(url),
    // A local command runs only after the user agrees in a native dialog, not in the renderer.
    confirmCommand: async ({ name, commandLine }) => {
      const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const options = {
        type: 'warning' as const,
        buttons: ['允许运行', '取消'],
        defaultId: 1,
        cancelId: 1,
        title: '添加本地 MCP 服务',
        message: `允许 Jarvis 运行 MCP 服务“${name}”吗？`,
        detail: `将以你的账户权限运行以下命令：\n${commandLine.slice(0, 1000)}\n只添加你信任的服务。`,
      };
      const result = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options);
      return result.response === 0;
    },
  });
  // The macOS system calendar through EventKit; Jarvis's own calendar on other systems.
  const calendar =
    process.platform === 'darwin'
      ? new AppleCalendar()
      : new LocalCalendar(join(root, 'calendar.json'));
  os = new AgentOs(config, root, {
    calendar,
    mcp,
    projects: projectStore(),
    generation: generationRunner(),
    files: writingFiles(),
    graph: writingGraph(),
  });
  let initializationError = '';
  try {
    await config.initialize();
    await mcp.initialize();
    await os.initialize();
  } catch {
    initializationError = 'Agent 本地记录无法读取，原文件已保留';
  }
  os.onChange = (event) => broadcast('os:event', event);
  os.onSessionChange = (event) => broadcast('os:session-event', event);
  // The focused window if there is one, else any open window.
  // Tool commands for a canvas or document go to the window that has it open.
  const host = (owner: number, closed: string) => {
    const target = trusted.get(owner);
    if (!target || target.contents.isDestroyed() || target.contents.getURL() !== target.url)
      throw new Error(closed);
    return target.contents;
  };
  os.spaces.canvas.dispatch = (owner, command) =>
    host(owner, '画布窗口已关闭').send('agent:canvas-command', command);
  os.spaces.writing.dispatch = (owner, command) =>
    host(owner, '写作窗口已关闭').send('agent:writing-command', command);
  os.onNavigate = (target) => {
    const windows = open();
    const focused = windows.find(({ contents }) => contents.isFocused());
    (focused ?? windows[0])?.contents.send('os:navigate', target);
  };
  // A notification click shows the conversation, in the window already showing it if any.
  const reveal = (sessionId: string) => {
    const windows = open();
    const target =
      windows.find(({ contents }) => os.viewedBy(contents.id, sessionId)) ??
      windows.find(({ contents }) => contents.isFocused()) ??
      windows[0];
    const window = target && BrowserWindow.fromWebContents(target.contents);
    if (!target || !window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    target.contents.send('os:open', sessionId);
  };
  // Kept until closed: a collected notification loses its click and button handlers.
  const shown = new Set<Notification>();
  os.onNotify = (notice) => {
    if (!Notification.isSupported()) return;
    // Nothing to announce for a conversation the user is looking at.
    if (
      open().some(
        ({ contents }) => contents.isFocused() && os.viewedBy(contents.id, notice.sessionId),
      )
    )
      return;
    // Notification buttons exist only on macOS. A question may be answered there; approvals and
    // other irreversible steps only offer “查看”, and the user approves on the card itself.
    const buttons = process.platform === 'darwin' ? (notice.answer?.options ?? ['查看']) : [];
    const notification = new Notification({
      title: notice.title,
      body: notice.body,
      silent: false,
      actions: buttons.map((text) => ({ type: 'button' as const, text })),
    });
    const done = () => shown.delete(notification);
    notification.on('close', done);
    notification.on('click', () => {
      done();
      reveal(notice.sessionId);
    });
    notification.on('action', (_event, index) => {
      done();
      if (!notice.answer) return reveal(notice.sessionId);
      // An answer that no longer applies (answered in a window, thread stopped) shows the thread.
      os.answerDecision(notice.answer.decisionId, index).catch(() => reveal(notice.sessionId));
    });
    shown.add(notification);
    notification.show();
  };
  // Settings pages act on the current project; adding a folder before any chat creates one.
  const current = async () => os.registry.currentId ?? (await os.createProject('我的项目'));
  const sent = new Map<string, string>();
  const handlers: Record<string, (request: unknown, owner: number) => unknown> = {
    // Agent OS
    'os:snapshot': () => os.snapshot(),
    'os:session': (r) => os.session(osId.parse(r)),
    'os:viewing': (r, owner) => os.setViewing(owner, z.array(osId).max(20).parse(r)),
    'os:send': async (r) => {
      const v = osSendSchema.parse(r);
      const prior = sent.get(v.requestId);
      if (prior) return prior;
      const id = await os.send(v.sessionId, v.text, v.canvas);
      sent.set(v.requestId, id);
      if (sent.size > 500) sent.delete(sent.keys().next().value as string);
      return id;
    },
    'os:start-space-thread': (r) => os.startSpaceThread(spaceThreadSchema.parse(r)),
    'os:steer': (r) => {
      const v = z.object({ sessionId: osId, messageId: osId }).strict().parse(r);
      return os.steer(v.sessionId, v.messageId);
    },
    'os:cancel': (r) => os.cancel(osId.parse(r)),
    'os:set-model': (r) => {
      const v = z
        .object({ sessionId: osId, model: z.string().trim().min(1).max(200) })
        .strict()
        .parse(r);
      return os.setModel(v.sessionId, v.model);
    },
    'os:set-thinking': (r) => {
      const v = thinkingInputSchema.parse(r);
      return os.setThinkingLevel(v.sessionId, v.level);
    },
    'os:copy-reply': (r) => {
      const v = z.object({ sessionId: osId, messageId: osId }).strict().parse(r);
      const message = os.session(v.sessionId).session.messages.find((m) => m.id === v.messageId);
      if (!message || message.role !== 'assistant' || message.status === 'running' || !message.text)
        throw new Error('没有可复制的回复');
      clipboard.writeText(message.text);
    },
    'os:undo': (r) => os.undo(osId.parse(r)),
    'os:stop-thread': (r) => os.stopThread(osId.parse(r)),
    'os:resolve-thread': (r) => {
      const v = z.object({ threadId: osId, resolved: z.boolean() }).strict().parse(r);
      return os.resolveThread(v.threadId, v.resolved);
    },
    'os:rename-thread': (r) => {
      const v = z
        .object({ threadId: osId, title: z.string().trim().min(1).max(100) })
        .strict()
        .parse(r);
      return os.renameThread(v.threadId, v.title);
    },
    'os:answer': (r) => {
      const v = decisionAnswerSchema.parse(r);
      return os.answerDecision(v.decisionId, v.option);
    },
    'os:create-project': (r) => os.createProject(z.string().trim().min(1).max(100).parse(r)),
    'os:update-project': (r) => {
      const v = z.object({ id: osId, patch: projectPatchSchema }).strict().parse(r);
      return os.updateProject(v.id, v.patch);
    },
    'os:remove-project': (r) => os.removeProject(osId.parse(r)),
    'os:current-project': (r) => os.setCurrentProject(osId.parse(r)),
    'os:add-folder': async (r, owner) => {
      const projectId = osId.parse(r);
      const directory = await pickFolder(owner, '选择这个项目可以访问的文件夹');
      return directory ? os.addFolder(projectId, directory) : null;
    },
    'os:remove-folder': (r) => {
      const v = z.object({ projectId: osId, folderId }).strict().parse(r);
      return os.removeFolder(v.projectId, v.folderId);
    },
    'os:memory': (r) => os.listMemory(osId.parse(r)),
    'os:memory-topic': (r) => {
      const v = z.object({ projectId: osId, name: memoryName }).strict().parse(r);
      return os.readMemory(v.projectId, v.name);
    },
    // Canvas and writing hosts: what each window has open, and its replies to tool commands.
    'agent:open-targets': (r, owner) => os.spaces.setTargets(owner, openTargetsSchema.parse(r)),
    'agent:claim-canvas': (r, owner) => os.spaces.canvas.claim(owner, agentId.parse(r)),
    'agent:complete-canvas': (r, owner) =>
      os.spaces.canvas.complete(owner, canvasReplySchema.parse(r)),
    'agent:claim-writing': (r, owner) => os.spaces.writing.claim(owner, agentId.parse(r)),
    'agent:complete-writing': (r, owner) =>
      os.spaces.writing.complete(owner, writingReplySchema.parse(r)),
    // Settings shared by every project
    'agent:skills': () => os.skills.list(),
    'agent:import-skill': async (_r, owner) => {
      if (os.isBusy) throw new Error('请先停止或等待当前请求完成');
      const contents = trusted.get(owner)?.contents;
      const window = contents && BrowserWindow.fromWebContents(contents);
      if (!window) throw new Error('当前窗口不可用');
      const result = await dialog.showOpenDialog(window, {
        title: '导入技能包（选择包含 SKILL.md 的文件夹）',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return os.importSkill(result.filePaths[0]);
    },
    'agent:enable-skill': (r) => {
      const v = z.object({ id: agentId, enabled: z.boolean() }).strict().parse(r);
      return os.setSkillEnabled(v.id, v.enabled);
    },
    'agent:settings': () => os.settings.get(),
    'agent:set-concurrency': (r) => os.setConcurrency(concurrencySchema.parse(r)),
    'agent:set-reply-mode': (r) => os.setReplyMode(replyModeSchema.parse(r)),
    // The current project's folders, for the settings page until projects get their own UI.
    'agent:folders': () => {
      const id = os.registry.currentId;
      return id ? os.registry.get(id).files.list() : [];
    },
    'agent:add-folder': async (_r, owner) => {
      const directory = await pickFolder(owner, '授权 Jarvis 访问的文件夹');
      return directory ? os.addFolder(await current(), directory) : null;
    },
    'agent:remove-folder': async (r) => os.removeFolder(await current(), folderId.parse(r)),
    'agent:calendar-status': () => calendar.status(),
    'agent:calendar-request': () => calendar.requestAccess(),
    'agent:calendar-events': async (r) => {
      const v = rangeSchema.parse(r);
      const status = await calendar.status();
      if (status.access !== 'granted') throw new Error(status.message ?? '没有日历访问权限');
      return calendar.events(v.from, v.to);
    },
    'agent:mcp-add': (r) => mcp.add(mcpServerInputSchema.parse(r)),
    'agent:mcp-remove': (r) => mcp.remove(agentId.parse(r)),
    'agent:mcp-enable': (r) => {
      const v = z.object({ id: agentId, enabled: z.boolean() }).strict().parse(r);
      return mcp.setEnabled(v.id, v.enabled);
    },
    'agent:mcp-reconnect': (r) => mcp.reconnect(agentId.parse(r)),
    'agent:mcp-sign-in': (r) => mcp.signIn(agentId.parse(r)),
    'models:settings': () => config.view(),
    'models:catalog': () => providerCatalog(),
    'models:save-provider': (r) => os.models.saveProvider(providerInputSchema.parse(r)),
    'models:test-provider': (r) => {
      const v = providerTestSchema.parse(r);
      return os.models.testProvider(v.provider, v.modelId);
    },
    'models:candidates': (r) => os.models.fetchProviderModels(providerInputSchema.parse(r)),
    'models:set-provider-models': (r) => {
      const v = setProviderModelsSchema.parse(r);
      return os.models.setProviderModels(v.providerId, v.models);
    },
    'models:update': (r) => os.models.updateModel(updateModelSchema.parse(r)),
    'models:remove': (id) => os.models.removeModel(agentId.parse(id)),
    'models:remove-provider': (id) => os.models.removeProvider(agentId.parse(id)),
    'models:default': (id) => os.models.setDefaultModel(agentId.parse(id)),
    'models:probe-vision': (id) => os.models.probeVision(agentId.parse(id)),
  };
  let quitting = false;
  // Local MCP servers are child processes; stop them with the app.
  app.on('will-quit', () => void mcp.dispose());
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void Promise.all([os.shutdown(), mcp.dispose()]).finally(() => app.quit());
  });
  for (const [channel, handler] of Object.entries(handlers))
    ipcMain.handle(channel, async (event, request): Promise<AgentResult<unknown>> => {
      try {
        if (
          event.senderFrame !== event.sender.mainFrame ||
          event.senderFrame?.url !== trusted.get(event.sender.id)?.url
        )
          throw new Error('请求来源不可信');
        if (initializationError) throw new Error(initializationError);
        return { ok: true, value: await handler(request, event.sender.id) };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof z.ZodError
              ? 'Agent 请求格式不正确，请检查输入'
              : error instanceof Error && !('code' in error)
                ? error.message
                : 'Agent 操作失败，请检查本地存储或模型服务连接',
        };
      }
    });
}
