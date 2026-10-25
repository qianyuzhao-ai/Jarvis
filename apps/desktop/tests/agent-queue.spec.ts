import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';

test('a replying conversation queues follow-ups while another conversation replies too', async () => {
  const held: { prompt: string; finish: (text: string) => void }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const prompt = JSON.stringify(body.messages.at(-1) ?? {});
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': open\n\n');
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    held.push({
      prompt,
      finish: (text) => res.end(chunk({ content: text }) + chunk({}, 'stop') + 'data: [DONE]\n\n'),
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const app = await electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  const reply = async (prompt: string, text: string) => {
    await expect.poll(() => held.some((h) => h.prompt.includes(prompt))).toBe(true);
    const index = held.findIndex((h) => h.prompt.includes(prompt));
    held.splice(index, 1)[0]?.finish(text);
  };
  try {
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await addRelayModel(page, { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock' });
    const input = page.getByLabel('消息', { exact: true });
    const messages = page.locator('[data-testid="chat-message"]');

    await input.fill('甲的问题');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.getByRole('button', { name: '停止回复' })).toBeVisible();
    await input.fill('甲的追问');
    await page.getByRole('button', { name: '排队发送' }).click();
    await expect(messages.last()).toHaveAttribute('data-status', 'queued');
    await expect(messages.last()).toContainText('排队中，当前回复结束后发送');
    await expect(page.getByRole('button', { name: '停止回复' })).toBeVisible();

    // A second conversation is not blocked by the first one replying.
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await input.fill('乙的问题');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect.poll(() => held.length).toBe(2);
    await reply('乙的问题', '乙的回答');
    await expect(messages.last()).toContainText('乙的回答');

    await page.getByRole('button', { name: '打开对话：甲的问题' }).click();
    await reply('甲的问题', '甲的回答');
    await reply('甲的追问', '追问的回答');
    await expect(messages).toHaveCount(4);
    await expect(messages.nth(1)).toContainText('甲的回答');
    await expect(messages.nth(2)).toHaveAttribute('data-status', 'succeeded');
    await expect(messages.nth(3)).toContainText('追问的回答');
    await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible();
  } finally {
    for (const h of held.splice(0)) h.finish('');
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
