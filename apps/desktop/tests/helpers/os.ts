import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { JsonFile } from '../../src/main/agent/json-file';
import type { KeyCipher } from '../../src/main/agent/key-cipher';
import { ModelStore } from '../../src/main/agent/model-store';
import { AgentOs, type OsDeps } from '../../src/main/agent/os/service';

export type MockMessage = {
  role: string;
  content: unknown;
  tool_calls?: { function: { name: string; arguments: string } }[];
};
export type MockBody = { messages: MockMessage[]; tools?: { function: { name: string } }[] };
/** What the mock model sends back: text, tool calls, or a hold until `release` is called. */
export type MockReply =
  | { text: string }
  | { calls: { name: string; args: unknown }[] }
  | { hold: Promise<MockReply> };

export const call = (name: string, args: unknown) => ({ calls: [{ name, args }] });
/** Text of the system prompt and of the last user turn of a request. */
export function promptOf(body: MockBody) {
  const text = (m?: MockMessage) =>
    typeof m?.content === 'string'
      ? m.content
      : Array.isArray(m?.content)
        ? (m.content as { type: string; text?: string }[]).map((p) => p.text ?? '').join('')
        : '';
  const system = text(body.messages.find((m) => m.role === 'system'));
  const last = text(body.messages.findLast((m) => m.role === 'user'));
  // The Coordinator's prompt starts with recent conversation; the wake itself comes last.
  const user = last.slice(Math.max(0, last.lastIndexOf('[唤醒')));
  return { system, user, full: last };
}
/** Tool results the model received after the last user turn. */
export function toolResults(body: MockBody) {
  const at = body.messages.findLastIndex((m) => m.role === 'user');
  return body.messages
    .slice(at + 1)
    .filter((m) => m.role === 'tool')
    .map((m) => String(m.content));
}

/** An OpenAI-compatible streaming server that answers by `script`. */
export async function mockModel(script: (body: MockBody, step: number) => MockReply) {
  const bodies: MockBody[] = [];
  const server: Server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: MockBody = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const step = toolResults(body).length;
    let reply = script(body, step);
    while ('hold' in reply) reply = await reply.hold;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null, usage?: unknown) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
    const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 };
    if ('text' in reply)
      res.end(chunk({ content: reply.text }) + chunk({}, 'stop', usage) + 'data: [DONE]\n\n');
    else
      res.end(
        chunk({
          tool_calls: reply.calls.map((c, index) => ({
            index,
            id: randomUUID(),
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        }) +
          chunk({}, 'tool_calls', usage) +
          'data: [DONE]\n\n',
      );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  return {
    bodies,
    url: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };

/** A fresh Agent OS under `root` using one mock model as the default. */
export async function startOs(root: string, url: string, deps: OsDeps = {}) {
  const models = new ModelStore(new JsonFile(join(root, 'connection.json')), cipher);
  await models.initialize();
  if (!models.view().defaultModelId) {
    const provider = await models.saveProvider({
      kind: 'custom',
      name: 'Relay',
      baseUrl: url,
      api: 'openai-completions',
      apiKey: '',
      clearKey: false,
    });
    await models.setProviderModels(provider, [{ modelId: 'mock' }]);
  }
  const os = new AgentOs(models, root, deps);
  await os.initialize();
  if (!os.registry.list().length) await os.createProject('测试项目');
  const project = os.registry.list()[0];
  if (!project) throw new Error('no project');
  const idle = (timeout = 15000) => expect.poll(() => os.settledDown, { timeout }).toBe(true);
  return { os, models, project, coordinator: project.project.coordinatorId, idle };
}
