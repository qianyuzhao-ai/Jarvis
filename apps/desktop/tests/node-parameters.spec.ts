import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { normalizeMedia, gptPreset } from '../src/renderer/src/features/creation/models';
import { createMedia } from '../src/renderer/src/features/creation/types';
import { payload } from '../src/main/generation/protocol';

test('Image ratio and resolution map to supported output sizes', () => {
  const data = normalizeMedia({
    ...createMedia('image'),
    model: 'gpt-image-2',
    prompt: 'test',
    size: gptPreset('16:9', '4K'),
    quality: 'medium',
  });
  expect(
    payload({ ...data, model: 'gpt-image-2', imageList: [], videoList: [], audioList: [] }, 'test'),
  ).toMatchObject({ config: { size: '3840x2160', quality: 'medium', n: 1 } });
  expect(gptPreset('1:1', '4K')).not.toBe('1:1(4k)');
});

test('Image, Nano and video use shared single-row macOS controls', async () => {
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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await page.locator('.react-flow__node-media').last().click();
    const group = page.getByRole('group', { name: '图像参数' });
    await page.getByLabel('选择模型', { exact: true }).selectOption('gpt-image-2');
    expect(
      await group
        .locator('select')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label'))),
    ).toEqual(['选择模型', '宽高比', '思考程度', '分辨率']);
    await page.getByLabel('宽高比', { exact: true }).selectOption('16:9');
    await page.getByLabel('分辨率', { exact: true }).selectOption('4K');
    await page.getByLabel('思考程度', { exact: true }).selectOption('medium');
    await page.screenshot({ path: test.info().outputPath('image-controls-light.png') });
    await page.getByLabel('宽高比', { exact: true }).selectOption('1:1');
    await expect(
      page.getByLabel('分辨率', { exact: true }).locator('option[value="4K"]'),
    ).toHaveCount(0);
    await page.getByLabel('选择模型', { exact: true }).selectOption('nano-banana-2');
    await expect(page.getByLabel('思考程度', { exact: true })).toHaveCount(0);
    await expect(group.locator('select')).toHaveCount(3);
    await page.getByLabel('宽高比', { exact: true }).selectOption('21:9');
    await page.getByLabel('分辨率', { exact: true }).selectOption('4K');
    await page.screenshot({ path: test.info().outputPath('nano-controls-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByLabel('选择模型', { exact: true }).selectOption('gpt-image-2.5-flare');
    await page.getByLabel('思考程度', { exact: true }).selectOption('xhigh');
    await page.getByLabel('选择模型', { exact: true }).selectOption('gpt-image-2');
    await expect(page.getByLabel('思考程度', { exact: true })).toHaveValue('high');
    await page.getByRole('button', { name: '放大编辑', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath('image-controls-expanded-dark.png') });
    const tops = await group
      .getByTestId('parameter-control')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);
    const modelControl = group.locator('[data-model="true"]');
    const shortWidth = await modelControl.evaluate((node) => node.getBoundingClientRect().width);
    expect(shortWidth).toBe(160);
    await page.getByLabel('选择模型', { exact: true }).selectOption('gpt-image-2.5-sunburst');
    const longWidth = await modelControl.evaluate((node) => node.getBoundingClientRect().width);
    expect(longWidth).toBeGreaterThan(shortWidth);
    const gap = await group.getByTestId('parameter-control').evaluateAll((nodes) => {
      const [model, next] = nodes;
      if (!model || !next) throw new Error('Missing model or next parameter');
      return next.getBoundingClientRect().left - model.getBoundingClientRect().right;
    });
    expect(gap).toBe(8);
    await expect(page.getByLabel('选择模型', { exact: true })).not.toContainText('待验证');
    await page.screenshot({ path: test.info().outputPath('model-content-width.png') });
  } finally {
    await app.close();
  }
});
