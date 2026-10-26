import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { canvasMenu, canvasOption } from './helpers/canvas-menu';

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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的画布' })).toBeVisible();
    const rail = page.getByRole('navigation', { name: '空间导航' });
    await expect(rail.getByRole('button', { name: 'AIGC 创作空间' })).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(rail.getByRole('button', { name: '首页' })).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    const renderer = await page.evaluate(() => ({
      bridge: window.desktop,
      require: 'require' in window,
      process: 'process' in window,
    }));
    expect(renderer.bridge?.versions.electron).toBeTruthy();
    expect(renderer.require).toBe(false);
    expect(renderer.process).toBe(false);
    const navigation = page.locator('.shell-navigation');
    await expect(navigation.getByRole('button').first()).toHaveAccessibleName('收起侧栏');
    expect(await page.evaluate(() => window.desktop!.appearance.getFullScreen())).toBe(false);
    if (process.platform === 'darwin') {
      await expect(navigation).toHaveCSS('padding-left', '76px');
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('appearance:fullscreen-changed', true);
      });
      await expect(navigation).toHaveCSS('padding-left', '0px');
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('appearance:fullscreen-changed', false);
      });
      await expect(navigation).toHaveCSS('padding-left', '76px');
    }
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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.text().includes('[React Flow]')) errors.push(message.text());
    });
    await page.getByRole('button', { name: '新建画布', exact: true }).click();
    await page.getByLabel('画布名称', { exact: true }).fill('画布交互测试');
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
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(expandedBounds?.width).toBe(Math.min(960, viewport.width - 64));
    expect(expandedBounds?.height).toBe(Math.min(600, viewport.height - 120));
    await expect(page.getByLabel('图像提示词')).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('image-editor-expanded.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: '图像编辑面板' })).toBeVisible();
    await expect(page.getByLabel('图像提示词')).toHaveText('窗边的橘猫，温暖自然光');
    await page.getByLabel('选择模型', { exact: true }).selectOption('nano-banana-pro');
    await page.getByLabel('宽高比', { exact: true }).selectOption('16:9');
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
        const canvasBounds = await page.getByTestId('canvas-body').boundingBox();
        return Boolean(
          panel &&
            canvasBounds &&
            panel.x >= canvasBounds.x + 15 &&
            panel.y >= canvasBounds.y + 15 &&
            panel.x + panel.width <= canvasBounds.x + canvasBounds.width - 15 &&
            panel.y + panel.height <= canvasBounds.y + canvasBounds.height - 15,
        );
      })
      .toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 820));
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await page.getByLabel('生成信息', { exact: true }).click();
    await expect(
      page.getByTestId('generation-details').getByText('生成失败', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('node-task-status')).toHaveText('生成失败');
    await page.getByRole('button', { name: '视频', exact: true }).click();
    await expect(nodes).toHaveCount(2);
    await nodes.last().click();
    await expect(page.getByRole('region', { name: '视频编辑面板' })).toBeVisible();
    const videoControls = page.getByRole('group', { name: '视频参数' });
    await expect(videoControls.locator('select')).toHaveCount(4);
    expect(
      await videoControls
        .locator('select')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label'))),
    ).toEqual(['选择模型', '视频时长', '宽高比', '分辨率']);
    const tops = await videoControls
      .getByTestId('parameter-control')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);
    await page.getByLabel('选择模型', { exact: true }).selectOption('seedance-2.0');
    await page.getByLabel('宽高比', { exact: true }).selectOption('16:9');
    await page.getByLabel('分辨率', { exact: true }).selectOption('4k');

    await expect(page.getByRole('region', { name: '图像编辑面板' })).toBeHidden();
    await page.getByLabel('视频提示词').fill('镜头缓慢推进');
    await page.getByRole('button', { name: '放大编辑', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '视频编辑面板' })).toBeVisible();
    await page.getByRole('button', { name: '还原面板', exact: true }).click();
    await expect(page.getByLabel('视频提示词')).toHaveText('镜头缓慢推进');
    await page.getByLabel('选择模型', { exact: true }).selectOption('seedance-2.5');
    await expect(page.getByLabel('分辨率', { exact: true })).toHaveValue('1080p');
    await page.screenshot({ path: test.info().outputPath('video-parameter-cards.png') });
    await page.getByLabel('视频时长').selectOption('30');
    await page.getByLabel('选择模型', { exact: true }).selectOption('seedance-2.0');
    await expect(page.getByLabel('视频时长')).toHaveValue('15');
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    await expect(nodes).toHaveCount(2);
    expect(await canvasOption(page, '画布磁性吸附')).toBe(true);
    await canvasMenu(page, '画布磁性吸附');
    expect(await canvasOption(page, '画布磁性吸附')).toBe(false);
    await canvasMenu(page, '画布磁性吸附');
    expect(await canvasOption(page, '画布磁性吸附')).toBe(true);
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
    await canvasMenu(page, '显示背景圆点');
    await expect(page.locator('.react-flow__background')).toHaveCount(0);
    await canvasMenu(page, '显示背景圆点');
    await page.getByRole('button', { name: '适应视图' }).click();
    await nodes.last().click();
    await page.screenshot({ path: test.info().outputPath('canvas-light.png') });
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '通用', exact: true }).click();
    await page.getByRole('radio', { name: 'Dark Mode', exact: true }).click();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '画布交互测试' }).click();
    await nodes.last().click();
    await page.screenshot({ path: test.info().outputPath('canvas-dark.png') });
    await expect(page.getByTestId('canvas-status')).toContainText('已保存到本机');
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '画布交互测试' }).click();
    await expect(nodes).toHaveCount(2);
    expect(await canvasOption(page, '画布磁性吸附')).toBe(true);
    await nodes.first().click();
    await expect(page.getByLabel('图像提示词')).toHaveText('窗边的橘猫，温暖自然光');
    await expect(page.getByAltText('reference.png')).toBeVisible();
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await expect(nodes).toHaveCount(3);
    await nodes.last().click();
    await page
      .locator('.react-flow__node.selected')
      .getByRole('button', { name: '删除节点', exact: true })
      .click();
    await expect(nodes).toHaveCount(2);
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建画布', exact: true }).click();
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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    const requests: string[] = [];
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) requests.push(r.url());
    });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1800, 1000),
    );
    await expect(page.getByTestId('settings-form')).toHaveCSS('width', '700px');
    for (const label of [
      '生成任务地址',
      'upload 地址',
      'upload-media 地址',
      '平台登录地址',
      '允许的统一登录域名',
    ])
      await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: '登录生成平台', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '验证连接', exact: true })).toBeDisabled();
    await page.getByLabel('req_from', { exact: true }).fill('empty-address-test');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.getByTestId('form-actions')).toContainText('已保存到本机');
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await expect(page.getByLabel('生成任务地址', { exact: true })).toHaveValue('');
    await page.getByLabel('req_from', { exact: true }).fill('');
    await page.getByRole('button', { name: '保存更改' }).click();
    await page.getByLabel('平台登录地址', { exact: true }).fill('https://platform.example.com');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.getByText('请先填写生成任务地址', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByLabel('req_from', { exact: true }).fill('local-test');
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('local-test');
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('');
    await page.getByLabel('生成任务地址', { exact: true }).fill('not-a-url');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.getByText(/请输入完整的 http/)).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('');
    await page.getByLabel('req_from', { exact: true }).fill(' local-test ');
    await page
      .getByLabel('生成任务地址', { exact: true })
      .fill('https://example.invalid/generate/');
    await page.getByLabel('upload 地址', { exact: true }).fill('https://example.invalid/upload');
    await page
      .getByLabel('upload-media 地址', { exact: true })
      .fill('https://example.invalid/media');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.getByTestId('form-actions')).toContainText('已保存到本机');
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('local-test');
    await expect(page.getByLabel('生成任务地址', { exact: true })).toHaveValue(
      'https://example.invalid/generate',
    );
    await page.screenshot({ path: test.info().outputPath('settings.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    await expect
      .poll(() => page.getByTestId('settings-form').evaluate((n) => n.scrollWidth - n.clientWidth))
      .toBe(0);
    await page.screenshot({ path: test.info().outputPath('settings-compact.png') });
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('jarvis-workspace', 1);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('workspace', 'readwrite');
        const store = tx.objectStore('workspace');
        // Preferences saved by this version, edited as an older build would have left them.
        const request = store.get('preferences');
        request.onsuccess = () => {
          const data = request.result;
          data.settings.generateUrl = 'https://old-platform.invalid/aigc/';
          store.put(data, 'preferences');
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await expect(page.getByLabel('生成任务地址', { exact: true })).toHaveValue(
      'https://old-platform.invalid/aigc/',
    );
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('local-test');
    await expect(page.getByLabel('upload 地址', { exact: true })).toHaveValue(
      'https://example.invalid/upload',
    );
    expect(requests).toEqual([]);
  } finally {
    await app.close();
  }
});

test('references stay stacked in compact mode and enforce per-kind limits', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建画布', exact: true }).click();
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await page.locator('.react-flow__node-media').first().click();
    await page.getByLabel('图像提示词').fill('专注编辑提示词');
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=',
      'base64',
    );
    const files = (kind: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        name: `${kind}-${i}`,
        mimeType: kind === 'image' ? 'image/png' : kind === 'video' ? 'video/webm' : 'audio/wav',
        buffer,
      }));
    const before = await page.getByRole('region', { name: '图像编辑面板' }).boundingBox();
    await page.getByLabel('选择参考素材').setInputFiles(files('image', 9));
    await expect(page.getByRole('button', { name: '查看 9 个参考素材' })).toBeVisible();
    const after = await page.getByRole('region', { name: '图像编辑面板' }).boundingBox();
    expect(after?.height).toBe(before?.height);
    expect(after?.width).toBe(before?.width);
    await page.screenshot({ path: test.info().outputPath('references-stacked.png') });
    await page
      .getByLabel('选择参考素材')
      .setInputFiles([...files('image', 1), ...files('audio', 1)]);
    await expect(page.getByRole('alert')).toContainText('最多 9 张');
    await expect(page.getByRole('alert')).toContainText('只支持参考图片');
    await page.getByRole('button', { name: '查看 9 个参考素材' }).click();
    await expect(page.getByTestId('reference-item')).toHaveCount(9);
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    await page.getByRole('button', { name: '视频', exact: true }).click();
    await page.locator('.react-flow__node-media').last().click();
    const videoBefore = await page.getByRole('region', { name: '视频编辑面板' }).boundingBox();
    await page
      .getByLabel('选择参考素材')
      .setInputFiles([...files('image', 9), ...files('audio', 3), ...files('video', 3)]);
    await expect(page.getByRole('button', { name: '查看 15 个参考素材' })).toBeVisible();
    expect((await page.getByRole('region', { name: '视频编辑面板' }).boundingBox())?.height).toBe(
      videoBefore?.height,
    );
    await page
      .getByLabel('选择参考素材')
      .setInputFiles([...files('image', 1), ...files('audio', 1), ...files('video', 1)]);
    await expect(page.getByRole('alert')).toContainText('参考图片最多 9 张');
    await expect(page.getByRole('alert')).toContainText('参考音频最多 3 个');
    await expect(page.getByRole('alert')).toContainText('参考视频最多 3 个');
    await page.getByRole('button', { name: '查看 15 个参考素材' }).click();
    await expect(page.getByTestId('reference-item')).toHaveCount(15);
    await expect(
      page.locator('[data-testid="reference-item"] [data-testid="reference-index"]'),
    ).toHaveText([
      ...Array.from({ length: 9 }, (_, i) => `图片 ${i + 1}`),
      '音频 1',
      '音频 2',
      '音频 3',
      '视频 1',
      '视频 2',
      '视频 3',
    ]);
    const layout = await page.getByRole('dialog', { name: '视频编辑面板' }).evaluate((panel) => {
      const refs = panel.querySelector('[data-testid="references"]')!,
        prompt = panel.querySelector('[data-testid="prompt-code-editor"] .cm-content')!;
      return {
        promptY: prompt.getBoundingClientRect().top,
        refsBottom: refs.getBoundingClientRect().bottom,
        scrollable: refs.scrollWidth > refs.clientWidth,
        rows: Array.from(refs.querySelectorAll('[data-testid="reference-item"]')).map(
          (n) => n.getBoundingClientRect().top,
        ),
      };
    });
    expect(new Set(layout.rows).size).toBe(1);
    expect(layout.scrollable).toBe(true);
    expect(layout.promptY).toBeGreaterThan(layout.refsBottom);
    await page.screenshot({ path: test.info().outputPath('references-expanded.png') });
    await page.getByRole('button', { name: '移除 audio-0', exact: true }).click();
    await expect(page.getByTestId('reference-item')).toHaveCount(14);
    await expect(
      page.locator('[data-reference-type="audio"] [data-testid="reference-index"]'),
    ).toHaveText(['音频 1', '音频 2']);
    await expect(page.locator('[data-reference-type="audio"]').first()).toHaveAttribute(
      'title',
      '音频 1 · audio-1',
    );
    await page.getByRole('button', { name: '还原面板', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看 14 个参考素材' })).toBeVisible();
  } finally {
    await app.close();
  }
});
