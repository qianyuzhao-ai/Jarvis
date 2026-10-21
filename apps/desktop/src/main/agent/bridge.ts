import { app, ipcMain, type WebContents } from 'electron';
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

const trusted = new Map<number, { contents: WebContents; url: string }>();
let service: AgentService;
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
  } catch {
    initializationError = 'Agent 本地记录无法读取，原文件已保留';
  }
  service.onChange = (event) => {
    for (const { contents, url } of trusted.values())
      if (!contents.isDestroyed() && contents.getURL() === url) contents.send('agent:event', event);
  };
  const handlers: Record<string, (request: unknown, owner: number) => unknown> = {
    'agent:configuration': () => config.view(),
    'agent:save': (r) => service.saveConfiguration(relayInputSchema.parse(r)),
    'agent:test': (r, owner) => service.test(relayInputSchema.parse(r), owner),
    'agent:models': (r) => config.models(relayModelsInputSchema.parse(r)),
    'agent:snapshot': () => service.snapshot(),
    'agent:create': () => service.create(),
    'agent:rename': (r) => {
      const v = z.object({ sessionId: agentId, title: z.string().trim().min(1).max(100) }).parse(r);
      return service.rename(v.sessionId, v.title);
    },
    'agent:model': (r) => {
      const v = z.object({ sessionId: agentId, model: z.string().trim().min(1).max(200) }).parse(r);
      return service.setModel(v.sessionId, v.model);
    },
    'agent:send': (r, owner) => {
      const v = agentSendSchema.parse(r);
      return service.send(v.sessionId, v.requestId, v.text, owner);
    },
    'agent:cancel': (r, owner) => service.cancel(agentId.parse(r), owner),
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
