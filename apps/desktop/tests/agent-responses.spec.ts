import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { openAgent } from '../src/main/agent/runtime';
import { relaySchema } from '../src/shared/agent';

test('Responses SSE validates terminal events and rejects redirects without leaking credentials', async () => {
  const hits: string[] = [];
  const server = createServer(async (req, res) => {
    hits.push(req.url ?? '');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(req.headers.authorization).toBeUndefined();
    if (body.model === 'redirect') {
      res.writeHead(302, { Location: '/leak' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const emit = (data: Record<string, unknown>) =>
      res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
    const item = {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      status: 'in_progress',
      content: [],
    };
    emit({
      type: 'response.created',
      response: { id: 'resp_1', status: 'in_progress', output: [] },
    });
    emit({ type: 'response.output_item.added', output_index: 0, item });
    emit({
      type: 'response.content_part.added',
      item_id: 'msg_1',
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    });
    emit({
      type: 'response.output_text.delta',
      item_id: 'msg_1',
      output_index: 0,
      content_index: 0,
      delta: 'Responses 中文🙂',
    });
    if (body.model !== 'incomplete') {
      const full = {
        ...item,
        status: 'completed',
        content: [{ type: 'output_text', text: 'Responses 中文🙂', annotations: [] }],
      };
      emit({ type: 'response.output_item.done', output_index: 0, item: full });
      emit({
        type: 'response.completed',
        response: {
          id: 'resp_1',
          status: 'completed',
          output: [full],
          usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
        },
      });
    }
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const a = server.address();
  if (!a || typeof a === 'string') throw Error('server');
  try {
    for (const model of ['complete', 'incomplete', 'redirect']) {
      const config = relaySchema.parse({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${a.port}/v1`,
        api: 'openai-responses',
        model,
      });
      const { session } = await openAgent(
        test.info().outputPath('runtime'),
        randomUUID(),
        config,
        '',
        true,
      );
      try {
        let text = '';
        session.subscribe((e) => {
          if (e.type === 'message_update' && e.assistantMessageEvent.type === 'text_delta')
            text += e.assistantMessageEvent.delta;
        });
        await session.prompt('仅测试', { expandPromptTemplates: false });
        expect(session.messages.filter((m) => m.role === 'assistant').at(-1)?.stopReason).toBe(
          model === 'complete' ? 'stop' : 'error',
        );
        if (model === 'complete') expect(text).toBe('Responses 中文🙂');
      } finally {
        session.dispose();
      }
    }
    expect(hits).toEqual(['/v1/responses', '/v1/responses', '/v1/responses']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
