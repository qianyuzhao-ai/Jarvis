import { writingScopeSchema, writingReplySchema } from '../../shared/writing-agent';
import { app, BrowserWindow, clipboard, dialog, ipcMain, type WebContents } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import {
  agentId,
  agentSendSchema,
  relayInputSchema,
  relayModelsInputSchema,
  type AgentResult,
} from '../../shared/agent';
import { RelayConfiguration } from './configuration';
import { JsonFile } from './json-file';
import { AgentService } from './service';
import { AgentStore } from './store';
import { canvasReplySchema } from '../../shared/canvas-agent';

const trusted = new Map<number, { contents: WebContents; url: string }>();
let service: AgentService;
export const isAgentBusy = () => service?.isBusy ?? false;
export function trustAgentWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, { contents, url: new URL(url).href });
  contents.on('did-start-navigation', (_event, _url, _inPlace, main) => {
    if (main) void service.cancelOwner(contents.id);
  });
  contents.once('destroyed', () => {
    trusted.delete(contents.id);
    void service.cancelOwner(contents.id);
  });
}
export async function registerAgent() {
  const root = join(app.getPath('userData'), 'agent');
  const config = new RelayConfiguration(new JsonFile(join(root, 'connection.json')));
  const store = new AgentStore(new JsonFile(join(root, 'index.json')));
  service = new AgentService(config, store, root);
  let initializationError = '';
  try {
    await config.initialize();
    await store.initialize();
    await service.skills.initialize();
  } catch {
    initializationError = 'Agent 本地记录无法读取，原文件已保留';
  }
  service.onChange = (event) => {
    for (const { contents, url } of trusted.values())
      if (!contents.isDestroyed() && contents.getURL() === url) contents.send('agent:event', event);
  };
  service.canvas.dispatch = (owner, command) => {
    const target = trusted.get(owner);
    if (!target || target.contents.isDestroyed() || target.contents.getURL() !== target.url)
      throw new Error('画布窗口已关闭');
    target.contents.send('agent:canvas-command', command);
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
    'agent:configuration': () => config.view(),
    'agent:save': (r) => service.saveConfiguration(relayInputSchema.parse(r)),
    'agent:remove-model': (id) => service.removeModel(agentId.parse(id)),
    'agent:default-model': (id) => service.setDefaultModel(agentId.parse(id)),
    'agent:test': (r, owner) => service.test(relayInputSchema.parse(r), owner),
    'agent:models': (r) => config.models(relayModelsInputSchema.parse(r)),
    'agent:snapshot': () => service.snapshot(),
    'agent:create': () => service.create(),
    'agent:create-canvas': (r) => service.create(agentId.parse(r)),
    'agent:create-writing': (r) => service.create(undefined, writingScopeSchema.parse(r)),
    'agent:claim-writing': (r, owner) => service.writing.claim(owner, agentId.parse(r)),
    'agent:complete-writing': (r, owner) =>
      service.writing.complete(owner, writingReplySchema.parse(r)),
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
  app.on('before-quit', (event) => {
    if (quitting || !service.isBusy) return;
    event.preventDefault();
    quitting = true;
    void service.shutdown().finally(() => app.quit());
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
