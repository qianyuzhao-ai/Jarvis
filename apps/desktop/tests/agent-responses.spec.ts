import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { openAgent } from '../src/main/agent/runtime';
import { relayModel } from './helpers/models';

test('Responses SSE validates terminal events and rejects redirects without leaking credentials', async () => {
  const hits: string[] = [];
  const visionImage = (
    await readFile(resolve(import.meta.dirname, 'fixtures/vision-sample.jpg'))
  ).toString('base64');
  const server = createServer(async (req, res) => {
    hits.push(req.url ?? '');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(req.headers.authorization).toBeUndefined();
    if (body.model === 'vision') {
      expect(JSON.stringify(body.input)).toContain('input_image');
      expect(JSON.stringify(body.input)).toContain('data:image/jpeg;base64,');
    }
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
    for (const model of ['complete', 'incomplete', 'redirect', 'vision']) {
      const config = relayModel({
        baseUrl: `http://127.0.0.1:${a.port}/v1`,
        api: 'openai-responses',
        model,
        vision: model === 'vision' ? 'supported' : 'unknown',
      });
      const { session } = await openAgent(
        test.info().outputPath('runtime'),
        randomUUID(),
        config,
        true,
        model === 'vision' ? { tools: [], context: 'Vision input test.' } : undefined,
      );
      try {
        let text = '';
        session.subscribe((e) => {
          if (e.type === 'message_update' && e.assistantMessageEvent.type === 'text_delta')
            text += e.assistantMessageEvent.delta;
        });
        await session.prompt('仅测试', {
          expandPromptTemplates: false,
          ...(model === 'vision'
            ? {
                images: [
                  {
                    type: 'image' as const,
                    mimeType: 'image/jpeg',
                    data: visionImage,
                  },
                ],
              }
            : {}),
        });
        expect(session.messages.filter((m) => m.role === 'assistant').at(-1)?.stopReason).toBe(
          ['complete', 'vision'].includes(model) ? 'stop' : 'error',
        );
        if (['complete', 'vision'].includes(model)) expect(text).toBe('Responses 中文🙂');
      } finally {
        session.dispose();
      }
    }
    expect(hits).toEqual(Array(4).fill('/v1/responses'));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
