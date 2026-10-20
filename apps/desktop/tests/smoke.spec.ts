import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

async function launch() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  return electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: environment,
  });
}

test('desktop navigation and isolation', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '我的项目' })).toBeVisible();
    const renderer = await page.evaluate(() => ({
      bridge: window.desktop,
      require: 'require' in window,
      process: 'process' in window,
    }));
    expect(renderer.bridge?.versions.electron).toBeTruthy();
    expect(renderer.require).toBe(false);
    expect(renderer.process).toBe(false);
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect(page.getByRole('complementary', { name: '主导航' })).toBeHidden();
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await expect(page.getByRole('complementary', { name: '主导航' })).toBeVisible();
    await page.evaluate(() => window.open('https://example.invalid'));
    expect(app.windows()).toHaveLength(1);
    await page.screenshot({ path: test.info().outputPath('projects.png') });
  } finally {
    await app.close();
  }
});

test('canvas editing, model constraints, references, toggles and persistence', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.text().includes('[React Flow]')) errors.push(message.text());
    });
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('画布交互测试');
    await expect(page.locator('.react-flow__attribution')).toHaveCount(0);
    await page.getByRole('button', { name: '图像', exact: true }).click();
    const nodes = page.locator('.react-flow__node-media');
    await expect(nodes).toHaveCount(1);
    await nodes.first().click();
    await expect(page.getByRole('region', { name: '图像编辑面板' })).toBeVisible();
    await page.getByLabel('图像提示词').fill('窗边的橘猫，温暖自然光');
    await expect(page.getByLabel('图像提示词')).toHaveCSS('resize', 'none');
    await page.getByRole('button', { name: '放大编辑', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '图像编辑面板' })).toBeVisible();
    const expandedBounds = await page.getByRole('dialog', { name: '图像编辑面板' }).boundingBox();
    expect(expandedBounds?.width).toBe(960);
    expect(expandedBounds?.height).toBe(600);
    await expect(page.getByLabel('图像提示词')).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('image-editor-expanded.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: '图像编辑面板' })).toBeVisible();
    await expect(page.getByLabel('图像提示词')).toHaveValue('窗边的橘猫，温暖自然光');
    await page.getByLabel('选择模型', { exact: true }).selectOption('nano-banana-pro');
    await page.getByRole('button', { name: /1:1.*2K/ }).click();
    await page.getByLabel('尺寸 / 比例').selectOption('16:9');
    await page.getByLabel('分辨率', { exact: true }).selectOption('4K');
    await page.getByLabel('选择参考素材').setInputFiles({
      name: 'reference.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await expect(page.getByAltText('reference.png')).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    await expect
      .poll(async () => {
        const panel = await page.getByRole('region', { name: '图像编辑面板' }).boundingBox();
        const windowSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        return Boolean(
          panel &&
          panel.x >= 0 &&
          panel.y >= 60 &&
          panel.x + panel.width <= windowSize.width &&
          panel.y + panel.height <= windowSize.height - 60,
        );
      })
      .toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 820));
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect(page.getByText('生成失败')).toBeVisible();
    await page.getByRole('button', { name: '视频', exact: true }).click();
    await expect(nodes).toHaveCount(2);
    await nodes.last().click();
    await expect(page.getByRole('region', { name: '视频编辑面板' })).toBeVisible();
    await expect(page.getByRole('region', { name: '图像编辑面板' })).toBeHidden();
    await page.getByLabel('视频提示词').fill('镜头缓慢推进');
    await page.getByRole('button', { name: '放大编辑', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '视频编辑面板' })).toBeVisible();
    await page.getByRole('button', { name: '还原面板', exact: true }).click();
    await expect(page.getByLabel('视频提示词')).toHaveValue('镜头缓慢推进');
    await page.getByLabel('选择模型', { exact: true }).selectOption('seedance-2.5');
    await page.getByLabel('视频时长').selectOption('30');
    await page.getByLabel('选择模型', { exact: true }).selectOption('seedance-2.0');
    await expect(page.getByLabel('视频时长')).toHaveValue('15');
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    await expect(nodes).toHaveCount(2);
    await expect(page.getByRole('button', { name: '磁力吸附', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: '磁力吸附', exact: true }).click();
    await page.getByRole('button', { name: '磁力吸附', exact: true }).click();
    await expect(page.getByRole('button', { name: '磁力吸附', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const bounds = await nodes.last().boundingBox();
    if (!bounds) throw new Error('Missing node');
    await page.mouse.move(bounds.x + 100, bounds.y + 60);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 373, bounds.y + 101, { steps: 12 });
    await page.mouse.up();
    const transform = await nodes.last().evaluate((n) => n.getAttribute('style'));
    const position = transform?.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    expect(position).toBeTruthy();
    expect(Number(position?.[1]) % 24).toBe(0);
    expect(Number(position?.[2]) % 24).toBe(0);
    await page.getByRole('button', { name: '缩略图显示' }).click();
    await expect(page.locator('.react-flow__minimap')).toBeVisible();
    await page.getByRole('button', { name: '背景点阵显示' }).click();
    await expect(page.locator('.react-flow__background')).toHaveCount(0);
    await page.getByRole('button', { name: '背景点阵显示' }).click();
    await page.getByRole('button', { name: '适应视图' }).click();
    await nodes.last().click();
    await page.screenshot({ path: test.info().outputPath('canvas-light.png') });
    await page.getByRole('button', { name: '返回项目列表' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: 'Dark Mode', exact: true }).click();
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByRole('button', { name: /画布交互测试/ }).click();
    await nodes.last().click();
    await page.screenshot({ path: test.info().outputPath('canvas-dark.png') });
    await expect(page.locator('.canvas-status')).toContainText('已保存到本机');
    await page.reload();
    await page.getByRole('button', { name: /画布交互测试/ }).click();
    await expect(nodes).toHaveCount(2);
    await expect(page.getByRole('button', { name: '磁力吸附' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await nodes.first().click();
    await expect(page.getByLabel('图像提示词')).toHaveValue('窗边的橘猫，温暖自然光');
    await expect(page.getByAltText('reference.png')).toBeVisible();
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await expect(nodes).toHaveCount(3);
    await nodes.last().click();
    await page.getByRole('button', { name: '删除节点', exact: true }).click();
    await expect(nodes).toHaveCount(2);
    await page.getByRole('button', { name: '返回项目列表' }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await expect(nodes).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('settings validate, cancel, save and restore without requests', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    const requests: string[] = [];
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) requests.push(r.url());
    });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await page.getByLabel('req_from', { exact: true }).fill('local-test');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: '返回工作台' }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('local-test');
    await page.getByLabel('aigc 地址', { exact: true }).fill('not-a-url');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.getByText(/请输入完整的 http/)).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('');
    await page.getByLabel('req_from', { exact: true }).fill(' local-test ');
    await page.getByLabel('aigc 地址', { exact: true }).fill('https://example.invalid/generate/');
    await page.getByLabel('upload 地址', { exact: true }).fill('https://example.invalid/upload');
    await page
      .getByLabel('upload-media 地址', { exact: true })
      .fill('https://example.invalid/media');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.locator('.form-actions')).toContainText('已保存到本机');
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('local-test');
    await expect(page.getByLabel('aigc 地址', { exact: true })).toHaveValue(
      'https://example.invalid/generate',
    );
    await page.screenshot({ path: test.info().outputPath('settings.png') });
    expect(requests).toEqual([]);
  } finally {
    await app.close();
  }
});
