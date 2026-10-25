import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';

test('an MCP server added in Plugins gives Jarvis its tools; drafting asks first; it can be paused and removed', async () => {
  test.setTimeout(60000);
  const log = test.info().outputPath('mcp-calls.log');
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const userIndex = body.messages.findLastIndex((m: { role: string }) => m.role === 'user');
    const step = body.messages
      .slice(userIndex + 1)
      .filter((m: { role: string }) => m.role === 'tool').length;
    const steps: [string, unknown][] = [
      ['mcp_mail__search_mail', { query: '报价' }],
      ['mcp_mail__create_draft', { to: 'boss@example.com', body: '报价已收到' }],
    ];
    const next = steps[step];
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(
      (next
        ? chunk({
            tool_calls: [
              {
                index: 0,
                id: randomUUID(),
                type: 'function',
                function: { name: next[0], arguments: JSON.stringify(next[1]) },
              },
            ],
          }) + chunk({}, 'tool_calls')
        : chunk({ content: '草稿已建好，未发送。' }) + chunk({}, 'stop')) + 'data: [DONE]\n\n',
    );
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
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await addRelayModel(page, { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock' });
    await page.reload();
    // The native "allow this command" dialog: the user allows it.
    const electronPath = await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({
        response: 0,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox;
      return process.execPath;
    });

    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '插件', exact: true }).click();
    await page.getByRole('tab', { name: 'MCP', exact: true }).click();
    await expect(page.getByTestId('mcp-empty')).toBeVisible();
    await page.getByRole('button', { name: '添加 MCP', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '添加 MCP 服务' });
    await dialog.getByLabel('连接方式').selectOption('stdio');
    await dialog.getByLabel('名称').fill('mail');
    await dialog.getByLabel('命令').fill(electronPath);
    await dialog
      .getByLabel('参数')
      .fill(resolve(import.meta.dirname, 'fixtures', 'mcp-server.mjs'));
    await dialog.getByLabel('环境变量（可选）').fill(`ELECTRON_RUN_AS_NODE=1\nMCP_LOG=${log}`);
    await dialog.getByRole('button', { name: '添加', exact: true }).click();
    const row = page.getByRole('listitem', { name: 'MCP 服务：mail' });
    await expect(row.getByTestId('mcp-status')).toHaveText('已连接', { timeout: 15000 });
    await expect(row.getByTestId('mcp-tools')).toContainText('搜索邮件');
    await expect(row.getByTestId('mcp-tools')).toContainText('send_mail · 需确认');
    await expect(row).toContainText('凭据：ELECTRON_RUN_AS_NODE、MCP_LOG');
    await page.screenshot({ path: test.info().outputPath('mcp-settings.png') });

    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await page.getByLabel('消息', { exact: true }).fill('回复报价邮件');
    await page.getByRole('button', { name: '发送消息' }).click();
    const approval = page.getByRole('alertdialog');
    await expect(approval).toContainText('boss@example.com');
    await expect(approval).toContainText('mail');
    await approval.getByRole('button', { name: '允许' }).click();
    await expect(page.getByText('草稿已建好，未发送。')).toBeVisible();
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).name);
    expect(calls).toEqual(['search_mail', 'create_draft']);

    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '插件', exact: true }).click();
    await page.getByRole('tab', { name: 'MCP', exact: true }).click();
    await row.getByRole('button', { name: '停用' }).click();
    await expect(row.getByTestId('mcp-status')).toHaveText('已停用');
    await row.getByRole('button', { name: '移除 MCP：mail' }).click();
    await expect(page.getByTestId('mcp-empty')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
