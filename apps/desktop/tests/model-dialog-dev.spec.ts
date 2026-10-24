import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createServer } from 'vite';

test('provider dialog completes validation, model selection and editing in StrictMode development', async () => {
  const server = await createServer({
    configFile: false,
    root: resolve(import.meta.dirname, '../src/renderer'),
    plugins: [react(), tailwindcss()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  const app = await electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
        ),
      ),
      ELECTRON_RENDERER_URL: server.resolvedUrls!.local[0]!,
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await page.getByRole('button', { name: '添加服务商', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^DeepSeek/ }).click();
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '连接 DeepSeek' })).toBeVisible();
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('DeepSeek API Key');
    await expect(dialog.getByRole('button', { name: '下一步', exact: true })).toBeEnabled();
    await dialog.getByLabel('API Key', { exact: true }).fill('development-test-key');
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByTestId('model-option')).toHaveCount(2);
    await dialog.getByRole('checkbox', { name: '启用 deepseek-flash' }).click();
    await expect(dialog.getByRole('button', { name: '添加 1 个模型', exact: true })).toBeEnabled();
    await dialog
      .getByRole('button', { name: '添加 1 个模型', exact: true })
      .click({ timeout: 5000 });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('configured-model')).toHaveCount(1);
    await page.getByRole('button', { name: '服务商菜单：DeepSeek' }).click();
    await page.getByRole('menuitem', { name: '编辑连接', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: '保存', exact: true }).click({ timeout: 5000 });
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(1);
  } finally {
    await app.close();
    await server.close();
  }
});
