import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { expect, test } from '@playwright/test';
import type { CapabilityPack, PackTool, ToolRisk } from '../src/main/agent/kernel/capability';
import type { Confirmer } from '../src/main/agent/kernel/policy';
import { openAgent } from '../src/main/agent/runtime';
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

test('Pi runs an irreversible tool only when the confirmer lets it through and tells the model why not', async () => {
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
  async function round(confirm: Confirmer) {
    const { pack, state } = testPack('confirm');
    requests.length = 0;
    const { session } = await openAgent(test.info().outputPath(randomUUID()), randomUUID(), model, {
      transient: true,
      packs: [pack],
      policy: { confirm },
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
        return undefined;
      }),
    ).toBe(1);
    expect(seen).toEqual(['将删除便签 n1']);
    expect(toolResult()).toContain('已删除');

    expect(await round(async () => ({ block: true, reason: '已生成决策卡，等待用户批准' }))).toBe(
      0,
    );
    expect(toolResult()).toContain('等待用户批准');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
