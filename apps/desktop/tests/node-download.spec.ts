import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { downloadMediaSchema } from '../src/shared/generation';
import {
  createMedia,
  createProject,
  type CanvasNode,
  type WorkspaceData,
} from '../src/renderer/src/features/creation/types';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=',
  'base64',
);

test('download requests accept HTTP media URLs and reject file URLs and unsupported kinds', () => {
  expect(
    downloadMediaSchema.safeParse({ url: 'https://example.invalid/image.png', kind: 'image' })
      .success,
  ).toBe(true);
  expect(downloadMediaSchema.safeParse({ url: 'file:///etc/passwd', kind: 'image' }).success).toBe(
    false,
  );
  expect(
    downloadMediaSchema.safeParse({ url: 'https://example.invalid/voice.wav', kind: 'audio' })
      .success,
  ).toBe(true);
});

test('general settings persist download directory and only skip dialogs when dont-ask is checked', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const url = `http://127.0.0.1:${address.port}/photo.png`;
  const directory = test.info().outputPath('default-downloads');
  await mkdir(directory);
  const profile = test.info().outputPath('preferences-profile');
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
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const checkbox = page.getByRole('checkbox', { name: '不再提醒，直接保存到默认位置' });
    await expect(checkbox).toBeDisabled();
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
    await expect(page.getByText('已取消选择', { exact: true })).toBeVisible();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, directory);
    await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
    await expect(page.locator('.download-directory')).toHaveText(directory);
    await expect(checkbox).not.toBeChecked();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showSaveDialog = async (
        ...args: [Electron.BaseWindow, Electron.SaveDialogOptions] | [Electron.SaveDialogOptions]
      ) => {
        const options = args.length === 2 ? args[1] : args[0];
        if (options.defaultPath !== directory + '/photo.png')
          throw new Error('保存框没有定位到默认目录');
        return { canceled: true, filePath: '' };
      };
    }, directory);
    expect(
      await page.evaluate(
        (url) => window.desktop!.generation.downloadMedia({ url, kind: 'image' }),
        url,
      ),
    ).toMatchObject({ ok: true, value: { canceled: true } });
    await checkbox.check();
    await expect(page.getByText('下载设置已保存', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('download-settings-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: test.info().outputPath('download-settings-dark.png') });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(
      page.getByRole('checkbox', { name: '不再提醒，直接保存到默认位置' }),
    ).toBeChecked();
    await expect(page.locator('.download-directory')).toHaveText(directory);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => {
        throw new Error('不应弹出保存框');
      };
    });
    const downloaded = await page.evaluate(
      async (url) =>
        Promise.all([
          window.desktop!.generation.downloadMedia({ url, kind: 'image' }),
          window.desktop!.generation.downloadMedia({ url, kind: 'image' }),
        ]),
      url,
    );
    expect(downloaded.every((response) => response.ok && !response.value.canceled)).toBe(true);
    expect(await readFile(resolve(directory, 'photo.png'))).toEqual(png);
    expect(await readFile(resolve(directory, 'photo (1).png'))).toEqual(png);
    await page.getByRole('checkbox', { name: '不再提醒，直接保存到默认位置' }).uncheck();
    await expect(page.getByText('下载设置已保存', { exact: true })).toBeVisible();
    const prompted = await page.evaluate(
      (url) => window.desktop!.generation.downloadMedia({ url, kind: 'image' }),
      url,
    );
    expect(prompted.ok).toBe(false);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
});

test('download settings report unavailable IPC and allow retry after it recovers', async () => {
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
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('downloads:get-preferences');
    });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('请完全退出应用并重新运行 pnpm dev');
    await expect(page.getByRole('button', { name: '选择文件夹', exact: true })).toBeDisabled();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.handle('downloads:get-preferences', () => ({
        ok: true,
        value: { directory: '', dontAskAgain: false },
      }));
    });
    await page.getByRole('button', { name: '重试读取下载设置', exact: true }).click();
    await expect(page.getByRole('button', { name: '选择文件夹', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('uploaded and generated image/video nodes download original bytes, cancel and preserve existing files on failure', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/missing') {
      res.writeHead(404).end();
      return;
    }
    if (req.url === '/wrong') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>expired</html>');
      return;
    }
    if (req.url === '/empty') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': 0 }).end();
      return;
    }
    if (req.url === '/broken') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': 10000 });
      res.write('partial');
      setTimeout(() => res.destroy(), 50);
      return;
    }
    const isVideo = req.url?.includes('webm');
    res.writeHead(200, { 'Content-Type': isVideo ? 'video/webm' : 'image/png' });
    res.end(isVideo ? video : png);
  });
  let video = Buffer.alloc(0);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
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
    video = Buffer.from(
      await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        const stream = canvas.captureStream(5);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
        const chunks: Blob[] = [];
        const done = new Promise<Blob>((resolve) => {
          recorder.ondataavailable = (event) => chunks.push(event.data);
          recorder.onstop = () => resolve(new Blob(chunks));
        });
        recorder.start();
        let frame = 0;
        const timer = setInterval(() => {
          ctx.fillStyle = frame++ % 2 ? '#286080' : '#802060';
          ctx.fillRect(0, 0, 16, 16);
        }, 50);
        await new Promise((resolve) => setTimeout(resolve, 600));
        clearInterval(timer);
        recorder.stop();
        const bytes = Array.from(new Uint8Array(await (await done).arrayBuffer()));
        stream.getTracks().forEach((track) => track.stop());
        return bytes;
      }),
    );
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const nodes: CanvasNode[] = [
      {
        id: ids[0]!,
        type: 'asset',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          name: 'photo.png',
          upload: { status: 'ready', url: base + '/image.png' },
        },
      },
      {
        id: ids[1]!,
        type: 'asset',
        position: { x: 420, y: 0 },
        data: {
          kind: 'video',
          name: 'camera.mov',
          upload: { status: 'ready', url: base + '/video.webm' },
        },
      },
      {
        id: ids[2]!,
        type: 'media',
        position: { x: 0, y: 320 },
        data: {
          ...createMedia('image'),
          result: { requestId: randomUUID(), url: base + '/generated.png' },
        },
      },
      {
        id: ids[3]!,
        type: 'media',
        position: { x: 420, y: 320 },
        data: {
          ...createMedia('video'),
          result: { requestId: randomUUID(), url: base + '/generated.webm' },
        },
      },
      { id: ids[4]!, type: 'media', position: { x: 840, y: 0 }, data: createMedia('image') },
    ];
    const workspace: WorkspaceData = {
      version: 1,
      projects: [
        { ...createProject(), name: '节点下载测试', nodes, viewport: { x: 40, y: 40, zoom: 0.8 } },
      ],
      settings: { reqFrom: '', generateUrl: '', imageUploadUrl: '', audioUploadUrl: '' },
      theme: 'system',
      sidebarWidth: 230,
    };
    await page.evaluate(async (workspace) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('jarvis-workspace', 1);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put(workspace, 'current');
        tx.oncomplete = () => resolve();
      });
      db.close();
    }, workspace);
    await page.reload();
    await page.getByRole('button', { name: /节点下载测试/ }).click();
    const renamed = ['休眠舱%20.v2.png', '驾驶舱 v2', '生成全景.v2', '全息影像.mp4'];
    for (let index = 0; index < 4; index++) {
      const current = page.locator(`.react-flow__node[data-id="${ids[index]}"]`);
      await current.getByRole('button', { name: /^重命名 / }).click();
      const input = current.getByRole('textbox', { name: '节点名称', exact: true });
      await input.fill(renamed[index]!);
      if (index === 1) await page.getByLabel('项目名称', { exact: true }).click();
      else await input.press('Enter');
      await expect(
        current.getByRole('button', { name: `重命名 ${renamed[index]}`, exact: true }),
      ).toBeVisible();
    }
    const first = page.locator(`.react-flow__node[data-id="${ids[0]}"]`);
    const renameButton = first.getByRole('button', { name: `重命名 ${renamed[0]}`, exact: true });
    await renameButton.click();
    await first.getByLabel('节点名称', { exact: true }).fill('取消的名称');
    await first.getByLabel('节点名称', { exact: true }).press('Escape');
    await expect(renameButton).toBeVisible();
    await renameButton.click();
    await first.getByLabel('节点名称', { exact: true }).fill('   ');
    await first.getByLabel('节点名称', { exact: true }).press('Enter');
    await expect(renameButton).toBeVisible();
    await renameButton.click();
    await first.getByLabel('节点名称', { exact: true }).press('Backspace');
    await expect(page.locator('.react-flow__node')).toHaveCount(5);
    await first.getByLabel('节点名称', { exact: true }).press('Escape');
    await first.click({ position: { x: 30, y: 30 } });
    await expect(first.locator('.media-placeholder')).toHaveCSS('outline-width', '3px');
    await expect(first.locator('.media-placeholder')).toHaveCSS('outline-offset', '3px');
    await expect(first.locator('.media-placeholder')).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.getByRole('region', { name: /编辑面板/ })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('renamed-selected-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: test.info().outputPath('renamed-selected-dark.png') });
    await page.getByRole('button', { name: '返回项目列表' }).click();
    await page.reload();
    await page.getByRole('button', { name: /节点下载测试/ }).click();
    for (let index = 0; index < 4; index++) {
      await expect(
        page.locator(`.react-flow__node[data-id="${ids[index]}"]`).getByRole('button', {
          name: `重命名 ${renamed[index]}`,
          exact: true,
        }),
      ).toBeVisible();
    }
    const outputPaths = [
      test.info().outputPath('asset.png'),
      test.info().outputPath('asset.webm'),
      test.info().outputPath('generated.png'),
      test.info().outputPath('generated.webm'),
    ];
    await app.evaluate(
      ({ dialog }, config) => {
        let index = 0;
        dialog.showSaveDialog = async (
          ...args: [Electron.BaseWindow, Electron.SaveDialogOptions] | [Electron.SaveDialogOptions]
        ) => {
          const options = args.length === 2 ? args[1] : args[0];
          if (options.defaultPath !== config.names[index])
            throw new Error('下载文件扩展名与响应类型不匹配');
          return { canceled: false, filePath: config.paths[index++]! };
        };
      },
      {
        paths: outputPaths,
        names: ['休眠舱%20.v2.png', '驾驶舱 v2.webm', '生成全景.v2.png', '全息影像.webm'],
      },
    );
    for (let index = 0; index < 4; index++) {
      const node = page.locator(`.react-flow__node[data-id="${ids[index]}"]`);
      const button = node.getByRole('button', {
        name: index % 2 ? '下载视频' : '下载图像',
        exact: true,
      });
      await button.click();
      await expect(node.locator('.node-download-notice')).toContainText('已下载');
      expect(await readFile(outputPaths[index]!)).toEqual(index % 2 ? video : png);
    }
    await expect(page.getByRole('region', { name: /编辑面板/ })).toHaveCount(0);
    await expect(
      page
        .locator(`.react-flow__node[data-id="${ids[4]}"]`)
        .getByRole('button', { name: '下载图像' }),
    ).toHaveCount(0);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
    });
    await page
      .locator(`.react-flow__node[data-id="${ids[0]}"]`)
      .getByRole('button', { name: '下载图像', exact: true })
      .click();
    await expect(
      page.locator(`.react-flow__node[data-id="${ids[0]}"] .node-download-notice`),
    ).toContainText('已取消下载');
    const existing = test.info().outputPath('existing.mp4');
    await writeFile(existing, 'keep original');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, existing);
    const failures = await page.evaluate(async (base) => {
      const bridge = window.desktop!.generation;
      return Promise.all([
        bridge.downloadMedia({ url: base + '/missing', kind: 'image' }),
        bridge.downloadMedia({ url: base + '/wrong', kind: 'image' }),
        bridge.downloadMedia({ url: 'file:///etc/passwd', kind: 'image' }),
        bridge.downloadMedia({ url: base + '/broken', kind: 'video' }),
      ]);
    }, base);
    expect(failures.every((response) => !response.ok)).toBe(true);
    expect(await readFile(existing, 'utf8')).toBe('keep original');
    expect((await readdir(dirname(existing))).filter((name) => name.endsWith('.part'))).toEqual([]);
    const emptyPath = test.info().outputPath('empty.png');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, emptyPath);
    const empty = await page.evaluate(
      (base) => window.desktop!.generation.downloadMedia({ url: base + '/empty', kind: 'image' }),
      base,
    );
    expect(empty.ok).toBe(false);
    expect(
      await readFile(emptyPath).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    await page.screenshot({ path: test.info().outputPath('node-download-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('.theme-root')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: test.info().outputPath('node-download-dark.png') });
  } finally {
    await app.close();
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
});
