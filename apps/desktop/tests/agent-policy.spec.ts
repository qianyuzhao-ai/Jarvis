import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { expect, test } from '@playwright/test';
import { ApprovalQueue } from '../src/main/agent/kernel/approval';
import type { CapabilityPack, PackTool, ToolRisk } from '../src/main/agent/kernel/capability';
import { createPolicy, type Approver } from '../src/main/agent/kernel/policy';
import { openAgent } from '../src/main/agent/runtime';
import type { ApprovalOutcome } from '../src/shared/agent-approval';
import { relayModel } from './helpers/models';

/** A pack with one tool of the given risk; `calls` counts how often the tool actually ran. */
function testPack(risk: ToolRisk) {
  const state = { calls: 0 };
  const tool: PackTool = {
    name: 'remove_note',
    label: '删除便签',
    description: '删除一条便签（测试用工具）',
    risk,
    describe: (input) => `将删除便签 ${String(input.id)}`,
    executionMode: 'sequential',
    parameters: z.toJSONSchema(z.object({ id: z.string() }).strict()) as PackTool['parameters'],
    async execute() {
      state.calls++;
      return { content: [{ type: 'text', text: '已删除' }], details: {} };
    },
  };
  const pack: CapabilityPack = { id: 'notes', prompt: '测试会话。', tools: [tool] };
  return { pack, state };
}

test('approval queue answers per window, expires, and declines stopped or closed rounds', async () => {
  const queue = new ApprovalQueue(50);
  const changes: number[] = [];
  queue.onChange = (owner) => changes.push(owner);
  const input = { sessionId: randomUUID(), toolName: 't', title: '删除便签', detail: 'x' };

  const approved = queue.request(1, input);
  const [request] = queue.list(1);
  if (!request) throw new Error('Missing request');
  expect(queue.list(2)).toEqual([]);
  expect(() => queue.respond(2, request.id, true)).toThrow('失效');
  queue.respond(1, request.id, true);
  await expect(approved).resolves.toBe('approved');
  expect(() => queue.respond(1, request.id, true)).toThrow('失效');

  const denied = queue.request(1, input);
  queue.respond(1, queue.list(1)[0]!.id, false);
  await expect(denied).resolves.toBe('denied');

  await expect(queue.request(1, input)).resolves.toBe('expired');

  const controller = new AbortController();
  const aborted = queue.request(1, input, controller.signal);
  controller.abort();
  await expect(aborted).resolves.toBe('denied');

  const stopped = queue.request(1, input);
  const other = queue.request(1, { ...input, sessionId: randomUUID() });
  queue.cancelSession(input.sessionId);
  await expect(stopped).resolves.toBe('denied');
  expect(queue.list(1)).toHaveLength(1);
  queue.cancelOwner(1);
  await expect(other).resolves.toBe('denied');
  expect(queue.list(1)).toEqual([]);
  expect(changes.every((owner) => owner === 1)).toBe(true);
});

test('policy blocks tools outside the packs and asks before confirm tools', async () => {
  const read = testPack('read').pack;
  const confirm = testPack('confirm').pack;
  expect(await createPolicy([read]).decide('remove_note', {})).toBeUndefined();
  expect(await createPolicy([read]).decide('bash', {})).toMatchObject({ block: true });
  expect(await createPolicy([confirm]).decide('remove_note', {})).toMatchObject({
    block: true,
    reason: expect.stringContaining('无法请求用户确认'),
  });
  const asked: string[] = [];
  const answer =
    (outcome: ApprovalOutcome): Approver =>
    async ({ tool, input }) => {
      asked.push(tool.describe?.(input) ?? '');
      return outcome;
    };
  expect(
    await createPolicy([confirm], answer('approved')).decide('remove_note', { id: 'a' }),
  ).toBeUndefined();
  expect(
    await createPolicy([confirm], answer('denied')).decide('remove_note', { id: 'b' }),
  ).toMatchObject({ block: true, reason: expect.stringContaining('拒绝') });
  expect(
    await createPolicy([confirm], answer('expired')).decide('remove_note', { id: 'c' }),
  ).toMatchObject({ block: true, reason: expect.stringContaining('时限') });
  expect(asked).toEqual(['将删除便签 a', '将删除便签 b', '将删除便签 c']);
});

test('Pi runs a confirm tool only after approval and tells the model when it was declined', async () => {
  const requests: { messages: { role: string; content: unknown }[] }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const answered = body.messages.some((m: { role: string }) => m.role === 'tool');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const write = (delta: unknown, finish: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'policy', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    if (!answered) {
      write({
        tool_calls: [
          {
            index: 0,
            id: 'call-0',
            type: 'function',
            function: { name: 'remove_note', arguments: JSON.stringify({ id: 'n1' }) },
          },
        ],
      });
      write({}, 'tool_calls');
    } else {
      write({ content: '已处理。' });
      write({}, 'stop');
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server');
  const model = relayModel({ baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock' });
  const toolResult = () =>
    JSON.stringify(requests.at(-1)?.messages.filter((m) => m.role === 'tool') ?? []);
  async function round(approve: Approver) {
    const { pack, state } = testPack('confirm');
    requests.length = 0;
    const { session } = await openAgent(test.info().outputPath(randomUUID()), randomUUID(), model, {
      transient: true,
      packs: [pack],
      approve,
    });
    try {
      await session.prompt('删除便签 n1', { expandPromptTemplates: false });
    } finally {
      session.dispose();
    }
    return state.calls;
  }
  try {
    const seen: string[] = [];
    expect(
      await round(async ({ tool, input }) => {
        seen.push(tool.describe?.(input) ?? '');
        return 'approved';
      }),
    ).toBe(1);
    expect(seen).toEqual(['将删除便签 n1']);
    expect(toolResult()).toContain('已删除');

    expect(await round(async () => 'denied')).toBe(0);
    expect(toolResult()).toContain('用户拒绝了此操作');

    const queue = new ApprovalQueue(30);
    expect(
      await round(({ tool, signal }) =>
        queue.request(
          1,
          { sessionId: randomUUID(), toolName: tool.name, title: tool.label, detail: '' },
          signal,
        ),
      ),
    ).toBe(0);
    expect(toolResult()).toContain('未在时限内确认');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
