import { EditorState } from '@codemirror/state';
import { expect, test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  promptReferenceEditing,
  referenceSelection,
} from '../src/renderer/src/features/creation/prompt-editor-state';

test('reference tags expand partial selections and edits as whole units', () => {
  const doc = 'A @image_1 B @video_2 C';
  const state = EditorState.create({ doc, extensions: promptReferenceEditing });
  expect(state.update({ changes: { from: 9, to: 10 } }).newDoc.toString()).toBe('A  B @video_2 C');
  expect(
    state.update({ changes: { from: 3, to: 4, insert: 'replacement' } }).newDoc.toString(),
  ).toBe('A replacement B @video_2 C');
  expect(referenceSelection(doc, 3, 8)).toEqual({ anchor: 2, head: 10 });
  expect(referenceSelection(doc, 8, 3)).toEqual({ anchor: 10, head: 2 });
  expect(state.update({ selection: { anchor: 8 } }).newSelection.main.head).toBe(10);
});

test('caret menu has thumbnails and keyboard selection; tags delete, undo, cut and paste atomically', async () => {
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
    page.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await page.locator('.react-flow__node-media').last().click();
    const image = await readFile(resolve(import.meta.dirname, 'fixtures/vision-sample.jpg'));
    await page.getByLabel('选择参考素材').setInputFiles([
      { name: '角色正面.jpg', mimeType: 'image/jpeg', buffer: image },
      { name: '场景参考.jpg', mimeType: 'image/jpeg', buffer: image },
    ]);
    const input = page.getByLabel('图像提示词', { exact: true });
    await input.fill('使用参考@');
    const menu = page.getByRole('listbox', { name: '引用参考素材' });
    await expect(menu.getByRole('option')).toHaveCount(2);
    await expect
      .poll(() =>
        menu
          .locator('img')
          .first()
          .evaluate((n) => (n as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const a = await menu.boundingBox(),
      b = await input.boundingBox();
    expect(a && b && a.y < b.y + b.height - 24 && a.x > b.x + 20).toBe(true);
    await input.press('ArrowDown');
    await expect(menu.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('prompt-mention-caret.png'),
    });
    await input.press('Enter');
    await expect(input).toHaveText('使用参考@image_2 ');
    await expect(menu).toHaveCount(0);
    await input.press('Backspace');
    await input.press('Backspace');
    await expect(input).toHaveText('使用参考');
    await expect(page.getByTestId('prompt-tag')).toHaveCount(0);
    await input.press('ControlOrMeta+z');
    await expect(page.getByTestId('prompt-tag')).toHaveCount(1);
    await input.fill('a @image_1 b');
    await input.press('Home');
    await input.press('ArrowRight');
    await input.press('ArrowRight');
    await input.press('Delete');
    await expect(input).toHaveText('a  b');
    await input.press('ControlOrMeta+z');
    await expect(input).toHaveText('a @image_1 b');
    await input.press('Home');
    await input.press('ArrowRight');
    await input.press('ArrowRight');
    await input.press('Shift+ArrowRight');
    await input.press('ControlOrMeta+x');
    await expect(input).toHaveText('a  b');
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('@image_1');
    await input.press('ControlOrMeta+v');
    await expect(input).toHaveText('a @image_1 b');
    await page.getByRole('button', { name: '视频', exact: true }).click();
    await page.locator('.react-flow__node-media').last().click();
    await page.getByLabel('选择参考素材').setInputFiles([
      { name: '角色参考.jpg', mimeType: 'image/jpeg', buffer: image },
      {
        name: '镜头参考.mp4',
        mimeType: 'video/mp4',
        buffer: await readFile(resolve(import.meta.dirname, 'fixtures/vision-colors.mp4')),
      },
      { name: '音色参考.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('audio fixture') },
    ]);
    const videoInput = page.getByLabel('视频提示词', { exact: true });
    await videoInput.fill('音色@');
    await expect(menu.getByRole('option')).toHaveCount(3);
    await videoInput.press('ArrowUp');
    await expect(menu.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
    await videoInput.press('Enter');
    await expect(videoInput).toHaveText('音色@audio_1 ');
    await videoInput.fill('@');
    await videoInput.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('region', { name: '视频编辑面板' })).toBeVisible();
    await page.getByRole('button', { name: '放大编辑' }).click();
    await videoInput.fill('第一行\n第二行引用@');
    await expect(menu).toBeVisible();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(menu).toHaveCSS('background-color', 'rgb(58, 58, 60)');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('prompt-mention-expanded-dark.png'),
    });
    await videoInput.dispatchEvent('compositionstart', { data: '' });
    await videoInput.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
    await expect(page.getByTestId('prompt-tag')).toHaveCount(0);
    await videoInput.dispatchEvent('compositionend', { data: '' });
    await expect(menu).toBeVisible();
    await videoInput.press('Enter');
    await expect(videoInput.locator('.cm-line')).toHaveText(['第一行', '第二行引用@image_1 ']);
    await videoInput.press('ControlOrMeta+a');
    await videoInput.press('ControlOrMeta+c');
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      '第一行\n第二行引用@image_1 ',
    );
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
