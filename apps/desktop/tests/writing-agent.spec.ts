import { z } from 'zod';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';
import { ledgerStatuses } from './helpers/ledger';

test('writing Agent edits only its document buffer, groups undo, survives tab switches and rejects stale versions', async () => {
  test.setTimeout(90000);
  const requests: Record<string, unknown>[] = [];
  let release: () => void = () => {},
    waiting = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const messages = body.messages as { role: string; content: string }[];
    const start = messages.findLastIndex((m) => m.role === 'user'),
      prompt = JSON.stringify(messages[start]?.content ?? '');
    const results = messages.slice(start + 1).filter((m) => m.role === 'tool');
    const step = results.length;
    if ((prompt.includes('后台') || prompt.includes('冲突')) && step === 1) {
      waiting = true;
      await new Promise<void>((r) => {
        release = r;
      });
      waiting = false;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const write = (delta: unknown, reason: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'writing', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`,
      );
    const read = results[0] ? JSON.parse(results[0].content) : null;
    let name = '',
      args: unknown = {};
    if (step === 0) {
      name = prompt.includes('总结') ? 'read_document' : 'read_selection';
      args = {};
    } else if (step === 1 && !prompt.includes('总结')) {
      name = 'replace_range';
      args = {
        from: read.selection.from,
        to: read.selection.to,
        text: prompt.includes('后台')
          ? '后台修改完成'
          : prompt.includes('冲突')
            ? '不应写入'
            : '口语化段落。',
        version: read.version,
      };
    } else if (step === 2 && prompt.includes('两处')) {
      const applied = JSON.parse(results[1]!.content);
      name = 'insert_text';
      args = { at: applied.length, text: '\n\n补充结尾。', version: applied.version };
    }
    if (name) {
      write({
        tool_calls: [
          {
            index: 0,
            id: `write-${step}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      write({}, 'tool_calls');
    } else {
      write({
        content: prompt.includes('冲突')
          ? '版本冲突，未覆盖你的修改。'
          : prompt.includes('总结')
            ? '已读取当前文档。'
            : '已修改编辑器缓冲区，尚未保存。',
      });
      write({}, 'stop');
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server');
  const directory = test.info().outputPath('notes'),
    original = '# 甲🙂\n\n原始段落。\n';
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '甲.md'), original);
  await writeFile(join(directory, '乙.md'), '# 乙\n\n独立文档。');
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
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    const untrusted = await app.evaluate(async ({ app, BrowserWindow }) => {
      const window = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: app.getAppPath() + '/out/preload/index.cjs',
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      try {
        await window.loadURL('data:text/html,<title>untrusted</title>');
        return await window.webContents.executeJavaScript(
          'window.desktop.agent.createWritingSession({rootId:"outside",path:"other.md"})',
        );
      } finally {
        window.destroy();
      }
    });
    expect(untrusted).toMatchObject({ ok: false, error: '请求来源不可信' });

    await addRelayModel(page, {
      name: 'Writing mock',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: 'mock',
      contextWindow: 32768,
    });
    await page.reload();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, directory);
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await page.getByRole('button', { name: '打开本地文件夹' }).click();
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '甲.md', exact: true })
      .click();
    const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' });
    await editor.focus();
    await editor.press('ControlOrMeta+Home');
    await editor.press('ArrowDown');
    await editor.press('ArrowDown');
    await editor.press('Home');
    await editor.press('Shift+End');
    await page.getByRole('button', { name: '展开右侧栏', exact: true }).click();
    const panel = page.getByRole('complementary', { name: '写作助手' });
    await panel.getByLabel('消息', { exact: true }).fill('改写选中段落并修改两处');
    await panel.getByRole('button', { name: '发送消息' }).click();
    await expect(editor).toContainText('口语化段落。');
    await expect(editor).toContainText('补充结尾。');
    await expect(editor).not.toContainText('原始段落。');
    await expect(panel.getByRole('button', { name: '撤销本次修改' })).toBeEnabled();
    await expect(
      page.getByTestId('writing-main').getByRole('status').filter({ hasText: '尚未保存' }),
    ).toBeVisible();
    await page.waitForTimeout(1100);
    expect(await readFile(join(directory, '甲.md'), 'utf8')).toBe(original);
    const screenshotDir = resolve(import.meta.dirname, '../test-results/ui-v1/phase-n');
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: join(screenshotDir, 'writing-agent-light.png') });
    await editor.press('ControlOrMeta+z');
    await expect(editor).toContainText('原始段落。');
    await expect(editor).not.toContainText('补充结尾。');
    await editor.press('ControlOrMeta+Shift+z');
    await expect(editor).toContainText('补充结尾。');
    await expect.poll(() => ledgerStatuses(test.info().outputPath('profile'))).toEqual(['applied']);
    await panel.getByRole('button', { name: '撤销本次修改' }).click();
    await expect(editor).toContainText('原始段落。');
    await expect.poll(() => ledgerStatuses(test.info().outputPath('profile'))).toEqual(['undone']);
    await editor.press('ControlOrMeta+a');
    await panel.getByLabel('消息', { exact: true }).fill('后台修改');
    await panel.getByRole('button', { name: '发送消息' }).click();
    await expect.poll(() => waiting).toBe(true);
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '乙.md', exact: true })
      .click({ modifiers: ['ControlOrMeta'] });
    await expect(editor).toContainText('独立文档。');
    release();
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const r = await window.desktop!.agent.getSnapshot();
          return r.ok ? Object.keys(r.value.snapshot.runs).length : 'error';
        }),
      )
      .toBe(0);
    await expect(editor).toContainText('独立文档。');
    expect(await readFile(join(directory, '甲.md'), 'utf8')).toBe(original);
    await page
      .getByRole('tablist', { name: '窗口标签' })
      .getByRole('tab', { name: /^甲\.md/ })
      .click();
    await expect(editor).toContainText('后台修改完成');
    await editor.press('ControlOrMeta+a');
    await panel.getByLabel('消息', { exact: true }).fill('冲突验证');
    await panel.getByRole('button', { name: '发送消息' }).click();
    await expect.poll(() => waiting).toBe(true);
    await editor.press('ControlOrMeta+a');
    await page.keyboard.insertText('人工修改保留');
    release();
    await expect(panel.getByRole('log', { name: '写作对话消息' })).toContainText('版本冲突');
    await expect(editor).toHaveText('人工修改保留');
    expect(JSON.stringify(requests)).toContain('文档版本已变化');
    await editor.press('ControlOrMeta+s');
    await expect.poll(() => readFile(join(directory, '甲.md'), 'utf8')).toBe('人工修改保留');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: join(screenshotDir, 'writing-agent-dark.png') });
    const snapshot = await page.evaluate(async () => window.desktop!.agent.getSnapshot());
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.value.snapshot.sessions.every((s) => s.writingScope?.path === '甲.md')).toBe(
      true,
    );
    const session = snapshot.value.snapshot.sessions[0];
    if (!session?.writingScope) throw new Error('Missing document session');
    const mismatch = await page.evaluate(
      async (session) =>
        window.desktop!.agent.send({
          sessionId: session.id,
          requestId: crypto.randomUUID(),
          text: 'scope mismatch probe',
          writing: { ...session.writingScope!, path: '乙.md' },
        }),
      session,
    );
    expect(mismatch).toMatchObject({ ok: false, error: '写作会话与当前文档不匹配' });

    const toolNames = z
      .array(z.object({ function: z.object({ name: z.string() }) }))
      .parse(requests[0]?.tools)
      .map((t) => t.function.name)
      .sort();
    expect(toolNames).toEqual([
      'handoff_to_main',
      'insert_text',
      'read_document',
      'read_selection',
      'replace_range',
      'report_result',
    ]);
  } catch (error) {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.destroy());
    throw error;
  } finally {
    release();
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
