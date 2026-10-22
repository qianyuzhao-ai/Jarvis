import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DEEPSEEK_BASE_URL, relaySchema } from '../src/shared/agent';
import { openAgent } from '../src/main/agent/runtime';

test('DeepSeek configuration fixes the official origin and preserves legacy relay configuration', () => {
  const legacy = {
    name: 'relay',
    baseUrl: 'http://localhost:8000/v1',
    api: 'openai-completions',
    model: 'mock',
  };
  expect(relaySchema.parse(legacy).provider).toBeUndefined();
  const official = {
    ...legacy,
    provider: 'deepseek',
    baseUrl: DEEPSEEK_BASE_URL,
    model: 'deepseek-flash',
  };
  expect(relaySchema.safeParse(official).success).toBe(true);
  expect(relaySchema.safeParse({ ...official, baseUrl: 'https://example.invalid' }).success).toBe(
    false,
  );
  expect(relaySchema.safeParse({ ...official, api: 'openai-responses' }).success).toBe(false);
});

test('Pi native DeepSeek streams both official models with the expected protocol and history', async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; body: Record<string, unknown>; authorization: string | null }[] =
    [];
  globalThis.fetch = async (url, init) => {
    const request = new Request(url, init);
    requests.push({
      url: request.url,
      body: (await request.json()) as Record<string, unknown>,
      authorization: request.headers.get('authorization'),
    });
    const body = requests.at(-1)!.body;
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'ds-mock', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    return new Response(
      chunk({ content: '官方协议模拟🙂' }) + chunk({}, 'stop') + 'data: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  };
  try {
    for (const model of ['deepseek-flash', 'deepseek-v4-pro']) {
      const config = relaySchema.parse({
        provider: 'deepseek',
        name: 'DeepSeek',
        baseUrl: DEEPSEEK_BASE_URL,
        api: 'openai-completions',
        model,
      });
      const id = randomUUID();
      for (const prompt of ['第一轮', '第二轮']) {
        const { session } = await openAgent(
          test.info().outputPath(model),
          id,
          config,
          'mock-deepseek-key',
        );
        try {
          await session.prompt(prompt, { expandPromptTemplates: false });
          const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
          expect(last?.provider).toBe('deepseek');
          expect(
            last?.stopReason,
            last?.errorMessage?.replaceAll('mock-deepseek-key', '[redacted]'),
          ).toBe('stop');
          expect(last?.content).toContainEqual({ type: 'text', text: '官方协议模拟🙂' });
          expect(session.getActiveToolNames()).toEqual([]);
        } finally {
          session.dispose();
        }
      }
    }
    expect(requests).toHaveLength(4);
    expect(requests.every((r) => r.url === `${DEEPSEEK_BASE_URL}/chat/completions`)).toBe(true);
    expect(requests.every((r) => r.authorization === 'Bearer mock-deepseek-key')).toBe(true);
    expect(requests.every((r) => r.body.max_tokens === 4096 && r.body.stream === true)).toBe(true);
    expect(requests.every((r) => JSON.stringify(r.body.thinking) === '{"type":"disabled"}')).toBe(
      true,
    );
    const history = requests[1]?.body.messages as { role: string; reasoning_content?: string }[];
    expect(history.find((m) => m.role === 'assistant')).toHaveProperty('reasoning_content');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
