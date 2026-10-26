import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';
import { osRelay } from './helpers/os-relay';

test('settings show the usage of the main agent and its threads, and open a thread from the list', async () => {
  test.setTimeout(90000);
  const { server, url } = await osRelay({
    title: '整理周报',
    capabilities: [],
    steps: [],
    done: '周报草稿已写好。',
    usage: { prompt_tokens: 1000, completion_tokens: 200 },
  });
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
    await addRelayModel(page, { baseUrl: url, model: 'mock' });
    await page.reload();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 900));

    // Nothing recorded yet.
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '用量与统计', exact: true }).click();
    await expect(page.getByRole('heading', { name: '用量与统计' })).toBeVisible();
    await expect(page.getByText('还没有用量记录。')).toBeVisible();

    // A Coordinator round that opens a thread, which reports back.
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByLabel('消息', { exact: true }).fill('帮我写本周周报');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.getByText('周报草稿已写好。').last()).toBeVisible();
    await expect(page.getByTestId('thread-notice')).toContainText('整理周报');

    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '用量与统计', exact: true }).click();
    const stat = (name: string) => page.getByTestId('usage-stat').and(page.getByLabel(name));
    // Every reply of the mock counts 1,200 tokens; a relay has no price.
    await expect(stat('主 Agent · 协调者')).toContainText(/\d\.\dK/);
    await expect(stat('子 Agent · 线程')).toContainText(/\d\.\dK/);
    await expect(stat('总消耗')).toHaveText(/总消耗\d\.\dK1 个模型无价格/);
    const models = page.getByRole('table', { name: '按模型' });
    await expect(models).toContainText('mock');
    await expect(models).toContainText('—');
    await expect(page.getByRole('list', { name: '主 Agent 按项目' })).toContainText(
      '帮我写本周周报',
    );
    await expect(page.getByTestId('usage-bar')).toHaveCount(7);
    await page.screenshot({ path: test.info().outputPath('usage.png'), fullPage: true });

    // The range and project filters ask again.
    await page.getByRole('radio', { name: '今天' }).click();
    await expect(page.getByTestId('usage-bar')).toHaveCount(1);
    await page.getByRole('combobox', { name: '项目' }).selectOption({ label: '帮我写本周周报' });
    await expect(stat('总消耗')).toContainText('1 个模型无价格');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: test.info().outputPath('usage-dark.png'), fullPage: true });
    await page.emulateMedia({ colorScheme: 'light' });

    // A thread in the list opens in a home tab.
    const thread = page.getByTestId('usage-thread').filter({ hasText: '整理周报' });
    await expect(thread).toContainText('帮我写本周周报 · ');
    await thread.click();
    await expect(page.getByTestId('thread-header')).toContainText('整理周报');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    server.close();
  }
});
