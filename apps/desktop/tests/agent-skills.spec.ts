import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('skills import, slash selection, automatic activation, disablement and restart work in real windows', async () => {
  test.setTimeout(60000);
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const lastUser = body.messages.findLastIndex((m: { role: string }) => m.role === 'user');
    const automatic = JSON.stringify(body.messages[lastUser]).includes('自动规划');
    const hasResult = body.messages
      .slice(lastUser + 1)
      .some((m: { role: string }) => m.role === 'tool');
    const tool = automatic && !hasResult;
    const delta = tool
      ? {
          tool_calls: [
            {
              index: 0,
              id: 'activate',
              type: 'function',
              function: { name: 'load_skill', arguments: '{"name":"shot-plan"}' },
            },
          ],
        }
      : { content: '已按技能规划镜头。' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [d, finish] of [
      [delta, null],
      [{}, tool ? 'tool_calls' : 'stop'],
    ])
      res.write(
        `data: ${JSON.stringify({ id: 'skill-ui', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta: d, finish_reason: finish }] })}\n\n`,
      );
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server');
  const profile = test.info().outputPath('profile');
  const directory = test.info().outputPath('shot-plan');
  const manualDirectory = test.info().outputPath('manual-plan');
  for (const [path, name, manual] of [
    [directory, 'shot-plan', false],
    [manualDirectory, 'manual-plan', true],
  ] as const) {
    await mkdir(path, { recursive: true });
    await writeFile(
      join(path, 'SKILL.md'),
      `---\nname: ${name}\ndescription: 用户规划镜头时使用\ndisable-model-invocation: ${manual}\n---\nSKILL_BODY: 保持主体一致，输出镜头表。`,
    );
  }
  const launch = () =>
    electron.launch({
      args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${profile}`],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
        ),
      ),
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('heading', { name: '先连接你的中转站' }).waitFor();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await page.evaluate(async (baseUrl) => {
      const r = await window.desktop?.agent.saveConfiguration({
        config: {
          name: 'mock',
          baseUrl,
          api: 'openai-completions',
          model: 'mock',
          contextWindow: 32768,
          maxTokens: 4096,
        },
        apiKey: '',
        clearKey: false,
      });
      if (!r?.ok) throw new Error('Configuration failed');
    }, `http://127.0.0.1:${address.port}/v1`);
    await page.reload();
    await page.getByRole('button', { name: '管理技能', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '技能', exact: true })).toContainText(
      '还没有技能',
    );
    for (const folder of [directory, manualDirectory]) {
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      }, folder);
      await page.getByRole('button', { name: '导入技能包', exact: true }).click();
      await expect(
        page.getByRole('checkbox', {
          name: `启用 ${folder === directory ? 'shot-plan' : 'manual-plan'}`,
        }),
      ).toBeChecked();
    }
    await page.screenshot({ path: test.info().outputPath('skills-manager.png') });
    await page.getByRole('button', { name: '关闭技能管理' }).click();
    let input = page.getByLabel('消息', { exact: true });
    await input.fill('/');
    await expect(page.getByRole('option')).toHaveCount(2);
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(input).toHaveValue('/skill:manual-plan ');
    expect(requests).toHaveLength(0);
    await input.fill('/manual');
    await page.screenshot({ path: test.info().outputPath('skills-slash-search.png') });
    await input.press('Tab');
    await input.press('End');
    await page.keyboard.insertText('三个镜头');
    await input.press('Enter');
    await expect(page.locator('.chat-message.assistant[data-status="succeeded"]')).toContainText(
      '已按技能',
    );
    expect(JSON.stringify(requests[0])).toContain('SKILL_BODY');
    expect(JSON.stringify(requests[0])).toContain('三个镜头');
    await expect(page.locator('.chat-activities')).toContainText('主动选择');
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    input = page.getByLabel('消息', { exact: true });
    await input.fill('自动规划三个镜头');
    await input.press('Enter');
    await expect(page.locator('.chat-message.assistant[data-status="succeeded"]')).toContainText(
      '已按技能',
    );
    await expect(page.locator('.chat-activities')).toContainText('自动匹配');
    await page.screenshot({ path: test.info().outputPath('skills-auto-loaded.png') });
    await input.fill('保留这份草稿');
    const beforeManager = requests.length;
    await page.getByRole('button', { name: '管理技能', exact: true }).click();
    await page.getByRole('checkbox', { name: '启用 manual-plan' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '技能', exact: true })).toBeVisible();
    expect(requests).toHaveLength(beforeManager);
    await page.getByRole('checkbox', { name: '启用 manual-plan' }).uncheck();
    await expect(page.getByRole('checkbox', { name: '启用 manual-plan' })).not.toBeChecked();
    await page.getByRole('button', { name: '关闭技能管理' }).click();
    await input.fill('/manual');
    await expect(page.getByRole('option')).toHaveCount(0);
    await input.press('Escape');
    await expect(page.locator('.skill-picker')).toHaveCount(0);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '管理技能', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '启用 manual-plan' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: '启用 shot-plan' })).toBeChecked();
    await page.getByRole('button', { name: '关闭技能管理' }).click();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByRole('button', { name: '展开画布助手', exact: true }).click();
    const sidebar = page.getByRole('complementary', { name: '画布助手' });
    const canvasInput = sidebar.getByLabel('消息', { exact: true });
    await canvasInput.fill('/shot');
    await expect(sidebar.getByRole('option')).toHaveCount(1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('.theme-root')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: test.info().outputPath('skills-canvas-dark.png') });
    await canvasInput.press('Enter');
    await canvasInput.press('End');
    await page.keyboard.insertText('为当前画布规划镜头');
    await canvasInput.press('Enter');
    await expect(sidebar.locator('.chat-message.assistant[data-status="succeeded"]')).toContainText(
      '已按技能',
    );
    expect(JSON.stringify(requests.at(-1)?.tools)).toContain('get_canvas_summary');
    expect(JSON.stringify(requests.at(-1)?.tools)).toContain('load_skill');
    await sidebar.getByRole('button', { name: '管理技能', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath('skills-manager-dark.png') });
  } finally {
    await app.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
