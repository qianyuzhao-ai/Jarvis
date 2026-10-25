import { writingScopeSchema, writingReplySchema } from '../../shared/writing-agent';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type WebContents } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import { agentId, agentSendSchema, type AgentResult } from '../../shared/agent';
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
import { AgentService } from './service';
import { AgentStore } from './store';
import { canvasReplySchema } from '../../shared/canvas-agent';
import { approvalResponseSchema } from '../../shared/agent-approval';
import { undoRequestSchema } from '../../shared/agent-ledger';
import { concurrencySchema, replyModeSchema } from '../../shared/agent-settings';
import { openTargetsSchema } from '../../shared/agent-targets';
import { folderId } from '../../shared/agent-files';
import { LocalFiles } from './local-files';
import { McpService } from './mcp/service';
import { AppleCalendar } from './calendar/apple';
import { LocalCalendar } from './calendar/local';
import { rangeSchema } from '../../shared/agent-calendar';
import { mcpServerInputSchema } from '../../shared/agent-mcp';
import { projectStore } from '../projects/bridge';
import { generationRunner } from '../generation/bridge';
import { writingFiles } from '../writing/bridge';

const trusted = new Map<number, { contents: WebContents; url: string }>();
let service: AgentService;
export const isAgentBusy = () => service?.isBusy ?? false;
export function trustAgentWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, { contents, url: new URL(url).href });
  contents.on('did-start-navigation', (_event, _url, _inPlace, main) => {
    if (!main) return;
    service.dropTargets(contents.id);
    void service.cancelOwner(contents.id);
  });
  contents.once('destroyed', () => {
    trusted.delete(contents.id);
    service.dropTargets(contents.id);
    void service.cancelOwner(contents.id);
  });
}
export async function registerAgent() {
  const root = join(app.getPath('userData'), 'agent');
  const config = new ModelStore(new JsonFile(join(root, 'connection.json')), systemKeyCipher);
  const store = new AgentStore(new JsonFile(join(root, 'index.json')));
  const folders = new LocalFiles(join(root, 'folders.json'), join(root, 'file-snapshots'));
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
  service = new AgentService(config, store, root, {
    calendar,
    folders,
    mcp,
    projects: projectStore(),
    generation: generationRunner(),
    files: writingFiles(),
  });
  let initializationError = '';
  try {
    await config.initialize();
    await store.initialize();
    await service.ledger.initialize(store.records.map((r) => r.view.id));
    await service.skills.initialize();
    await service.loadSettings();
    await folders.initialize();
    await mcp.initialize();
  } catch {
    initializationError = 'Agent 本地记录无法读取，原文件已保留';
  }
  service.onChange = (event) => {
    for (const { contents, url } of trusted.values())
      if (!contents.isDestroyed() && contents.getURL() === url) contents.send('agent:event', event);
  };
  service.onSessionChange = (event) => {
    for (const { contents, url } of trusted.values())
      if (!contents.isDestroyed() && contents.getURL() === url)
        contents.send('agent:session-event', event);
  };
  service.canvas.dispatch = (owner, command) => {
    const target = trusted.get(owner);
    if (!target || target.contents.isDestroyed() || target.contents.getURL() !== target.url)
      throw new Error('画布窗口已关闭');
    target.contents.send('agent:canvas-command', command);
  };
  // The window the round came from if it is still open, else any open window.
  service.onNavigate = (owner, target) => {
    const open = [...trusted.values()].filter(
      ({ contents, url }) => !contents.isDestroyed() && contents.getURL() === url,
    );
    const chosen = open.find((w) => w === trusted.get(owner)) ?? open[0];
    chosen?.contents.send('agent:navigate', target);
  };
  service.approvals.onChange = (owner) => {
    const target = trusted.get(owner);
    if (target && !target.contents.isDestroyed() && target.contents.getURL() === target.url)
      target.contents.send('agent:approvals', service.approvals.list(owner));
  };
  service.writing.dispatch = (owner, command) => {
    const target = trusted.get(owner);
    if (!target || target.contents.isDestroyed() || target.contents.getURL() !== target.url)
      throw new Error('写作窗口已关闭');
    target.contents.send('agent:writing-command', command);
  };
  const handlers: Record<string, (request: unknown, owner: number) => unknown> = {
    'agent:skills': () => service.skills.list(),
    'agent:import-skill': async (_r, owner) => {
      if (service.isBusy) throw new Error('请先停止或等待当前请求完成');
      const contents = trusted.get(owner)?.contents;
      const window = contents && BrowserWindow.fromWebContents(contents);
      if (!window) throw new Error('当前窗口不可用');
      const result = await dialog.showOpenDialog(window, {
        title: '导入技能包（选择包含 SKILL.md 的文件夹）',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return service.importSkill(result.filePaths[0]);
    },
    'agent:enable-skill': (r) => {
      const v = z.object({ id: agentId, enabled: z.boolean() }).strict().parse(r);
      return service.setSkillEnabled(v.id, v.enabled);
    },
    'models:settings': () => config.view(),
    'models:catalog': () => providerCatalog(),
    'models:save-provider': (r) => service.saveProvider(providerInputSchema.parse(r)),
    'models:test-provider': (r, owner) => {
      const v = providerTestSchema.parse(r);
      return service.testProvider(v.provider, owner, v.modelId);
    },
    'models:candidates': (r) => service.fetchProviderModels(providerInputSchema.parse(r)),
    'models:set-provider-models': (r) => {
      const v = setProviderModelsSchema.parse(r);
      return service.setProviderModels(v.providerId, v.models);
    },
    'models:update': (r) => service.updateModel(updateModelSchema.parse(r)),
    'models:remove': (id) => service.removeModel(agentId.parse(id)),
    'models:remove-provider': (id) => service.removeProvider(agentId.parse(id)),
    'models:default': (id) => service.setDefaultModel(agentId.parse(id)),
    'models:probe-vision': (id, owner) => service.probeVision(agentId.parse(id), owner),
    'agent:thinking': (r) => {
      const v = thinkingInputSchema.parse(r);
      return service.setThinkingLevel(v.sessionId, v.level);
    },
    'agent:snapshot': () => service.snapshot(),
    'agent:settings': () => service.settings.get(),
    'agent:set-concurrency': (r) => service.setConcurrency(concurrencySchema.parse(r)),
    'agent:set-reply-mode': (r) => service.setReplyMode(replyModeSchema.parse(r)),
    'agent:folders': () => folders.list(),
    'agent:add-folder': async (_r, owner) => {
      const contents = trusted.get(owner)?.contents;
      const window = contents && BrowserWindow.fromWebContents(contents);
      if (!window) throw new Error('当前窗口不可用');
      const result = await dialog.showOpenDialog(window, {
        title: '授权 Jarvis 访问的文件夹',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return folders.add(result.filePaths[0]);
    },
    'agent:remove-folder': (r) => folders.remove(folderId.parse(r)),
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
    'agent:steer': (r, owner) => {
      const v = z.object({ sessionId: agentId, messageId: agentId }).strict().parse(r);
      return service.steer(v.sessionId, v.messageId, owner);
    },
    'agent:session': (r) => service.session(agentId.parse(r)),
    'agent:create': () => service.create(),
    'agent:create-canvas': (r) => service.create(agentId.parse(r)),
    'agent:create-writing': (r) => service.create(undefined, writingScopeSchema.parse(r)),
    'agent:claim-writing': (r, owner) => service.writing.claim(owner, agentId.parse(r)),
    'agent:complete-writing': (r, owner) =>
      service.writing.complete(owner, writingReplySchema.parse(r)),
    'agent:undo': (r, owner) => service.undo(owner, undoRequestSchema.parse(r)),
    'agent:approvals': (_r, owner) => service.approvals.list(owner),
    'agent:respond-approval': (r, owner) => {
      const v = approvalResponseSchema.parse(r);
      service.approvals.respond(owner, v.id, v.approved);
    },
    'agent:open-targets': (r, owner) => service.setTargets(owner, openTargetsSchema.parse(r)),
    'agent:claim-canvas': (r, owner) => service.canvas.claim(owner, agentId.parse(r)),
    'agent:complete-canvas': (r, owner) =>
      service.canvas.complete(owner, canvasReplySchema.parse(r)),
    'agent:rename': (r) => {
      const v = z.object({ sessionId: agentId, title: z.string().trim().min(1).max(100) }).parse(r);
      return service.rename(v.sessionId, v.title);
    },
    'agent:delete': (r) => service.deleteSession(agentId.parse(r)),
    'agent:model': (r) => {
      const v = z.object({ sessionId: agentId, model: z.string().trim().min(1).max(200) }).parse(r);
      return service.setModel(v.sessionId, v.model);
    },
    'agent:send': (r, owner) => {
      const v = agentSendSchema.parse(r);
      return service.send(v.sessionId, v.requestId, v.text, owner, v.canvas, v.images, v.writing);
    },
    'agent:cancel': (r, owner) => service.cancel(agentId.parse(r), owner),
    'agent:copy-reply': (r) => {
      const v = z.object({ sessionId: agentId, messageId: agentId }).strict().parse(r);
      const message = store.record(v.sessionId).view.messages.find((m) => m.id === v.messageId);
      if (!message || message.role !== 'assistant' || message.status === 'running' || !message.text)
        throw new Error('没有可复制的回复');
      clipboard.writeText(message.text);
    },
  };
  let quitting = false;
  // Local MCP servers are child processes; stop them with the app.
  app.on('will-quit', () => void mcp.dispose());
  app.on('before-quit', (event) => {
    if (quitting || !service.isBusy) return;
    event.preventDefault();
    quitting = true;
    void Promise.all([service.shutdown(), mcp.dispose()]).finally(() => app.quit());
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
                : 'Agent 操作失败，请检查本地存储或中转站连接',
        };
      }
    });
}
