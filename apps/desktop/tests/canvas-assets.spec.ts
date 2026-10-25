import { readProjects } from './helpers/workspace';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import {
  assetNodeSchema,
  workspaceSchema,
  emptyWorkspace,
} from '../src/renderer/src/features/creation/types';
import { inspectAsset } from '../src/renderer/src/features/creation/asset-upload';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=',
  'base64',
);
async function launch() {
  return electron.launch({
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
}
async function service() {
  const files = new Map<string, { bytes: Uint8Array; mime: string }>();
  files.set('image.png', { bytes: png, mime: 'image/png' });
  const calls: { path: string; name: string; reqFrom: string }[] = [];
  let fail = false;
  let hold = false;
  const pending: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    const path = req.url ?? '';
    if (path.startsWith('/files/')) {
      const file = files.get(decodeURIComponent(path.slice(7)));
      if (!file) {
        res.writeHead(404).end();
        return;
      }
      const start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] ?? 0);
      const headers: Record<string, string | number> = {
        'Content-Type': file.mime,
        'Content-Length': file.bytes.length - start,
        'Accept-Ranges': 'bytes',
      };
      if (req.headers.range)
        headers['Content-Range'] = `bytes ${start}-${file.bytes.length - 1}/${file.bytes.length}`;
      res.writeHead(req.headers.range ? 206 : 200, headers);
      res.end(file.bytes.slice(start));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': req.headers['content-type'] ?? '' },
    }).formData();
    const file = form.get('files');
    if (!(file instanceof File)) {
      res.writeHead(400).end();
      return;
    }
    calls.push({ path, name: file.name, reqFrom: String(form.get('req_from')) });
    files.set(file.name, { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type });
    res.setHeader('Content-Type', 'application/json');
    const respond = () =>
      res.end(
        JSON.stringify({
          files: fail ? [] : [{ url: `${base}/files/${encodeURIComponent(file.name)}` }],
        }),
      );
    if (hold) pending.push(respond);
    else respond();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    calls,
    files,
    setFail: (value: boolean) => {
      fail = value;
    },
    setHold: (value: boolean) => {
      hold = value;
    },
    release: () => {
      pending.splice(0).forEach((respond) => respond());
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

test('URL media bridge validates URLs and preserves streaming ranges', async () => {
  const mock = await service();
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    const response = await page.evaluate(async (base) => {
      const bridge = window.desktop!.generation;
      const source = await bridge.mediaUrl(base + '/files/image.png');
      if (!source.ok) throw new Error(source.error);
      const image = new Image();
      image.src = source.value;
      await image.decode();
      const invalid = await bridge.mediaUrl('file:///etc/passwd');
      return { width: image.naturalWidth, invalid, source: source.value };
    }, mock.base);
    expect(response.width).toBe(1);
    expect(response.invalid.ok).toBe(false);
    const range = await app.evaluate(async ({ net }, source) => {
      const response = await net.fetch(source, { headers: { Range: 'bytes=4-' } });
      return { status: response.status, range: response.headers.get('content-range') };
    }, response.source);
    expect(range).toEqual({ status: 206, range: `bytes 4-${png.length - 1}/${png.length}` });
    expect(
      assetNodeSchema.safeParse({
        id: 'asset',
        type: 'asset',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          name: 'image.png',
          upload: { status: 'ready', url: mock.base + '/files/image.png' },
        },
      }).success,
    ).toBe(true);
  } finally {
    await app.close();
    await mock.close();
  }
});

async function configure(page: Page, base: string) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '内网地址', exact: true }).click();
  await page.getByLabel('req_from', { exact: true }).fill('canvas-import-test');
  await page.getByLabel('upload 地址', { exact: true }).fill(base + '/upload');
  await page.getByLabel('upload-media 地址', { exact: true }).fill(base + '/upload-media');
  await page.getByRole('button', { name: '保存更改' }).click();
  await expect(page.getByTestId('form-actions')).toContainText('已保存到本机');
  await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('资源画布测试');
}
async function drop(page: Page, files: { name: string; mime: string; bytes: number[] }[]) {
  const transfer = await page.evaluateHandle((files) => {
    const data = new DataTransfer();
    for (const file of files)
      data.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.mime }));
    return data;
  }, files);
  const canvas = page.getByTestId('canvas-body');
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Missing canvas');
  const point = { x: rect.x + 120, y: rect.y + 100 };
  await canvas.dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(page.getByTestId('canvas-drop-hint')).toBeVisible();
  await canvas.dispatchEvent('dragover', { dataTransfer: transfer });
  await canvas.dispatchEvent('drop', {
    dataTransfer: transfer,
    clientX: point.x,
    clientY: point.y,
  });
  await transfer.dispose();
  await expect(page.getByTestId('canvas-drop-hint')).toHaveCount(0);
  return { ...point, origin: { x: rect.x, y: rect.y } };
}
/** The canvas project under test, as the main process saved it. */
async function readWorkspace(page: Page) {
  return { projects: (await readProjects(page)).filter((p) => p.name === '资源画布测试') };
}

test('file validation handles desktop MIME gaps, limits and legacy workspaces', () => {
  expect(inspectAsset({ name: 'clip.MOV', type: '', size: 10 })).toEqual({
    kind: 'video',
    mime: 'video/quicktime',
  });
  expect(inspectAsset({ name: 'voice.mp3', type: 'application/octet-stream', size: 10 }).kind).toBe(
    'audio',
  );
  expect(() => inspectAsset({ name: 'notes.txt', type: 'text/plain', size: 1 })).toThrow('只支持');
  expect(() => inspectAsset({ name: 'empty.png', type: 'image/png', size: 0 })).toThrow('文件为空');
  expect(() =>
    inspectAsset({ name: 'large.mp4', type: 'video/mp4', size: 201 * 1024 * 1024 }),
  ).toThrow('200 MiB');
  expect(workspaceSchema.parse(emptyWorkspace)).toEqual(emptyWorkspace);
});

test('desktop file drops upload three media kinds, render URLs and restore without reuploading', async () => {
  const mock = await service();
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const video = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      canvas.getContext('2d')!.fillRect(0, 0, 16, 16);
      const stream = canvas.captureStream(5);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks: Blob[] = [];
      const done = new Promise<Blob>((resolve) => {
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks));
      });
      recorder.start();
      let frame = 0;
      const animation = setInterval(() => {
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = frame++ % 2 ? '#206080' : '#802060';
        ctx.fillRect(0, 0, 16, 16);
      }, 50);
      await new Promise((resolve) => setTimeout(resolve, 900));
      clearInterval(animation);
      recorder.stop();
      const bytes = Array.from(new Uint8Array(await (await done).arrayBuffer()));
      stream.getTracks().forEach((track) => track.stop());
      return bytes;
    });
    const wav = Buffer.alloc(44 + 8000 * 2);
    wav.write('RIFF');
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    await configure(page, mock.base);
    const point = await drop(page, [
      { name: 'image.png', mime: 'image/png', bytes: Array.from(png) },
      { name: 'clip.webm', mime: 'video/webm', bytes: video },
      { name: 'voice.wav', mime: 'audio/wav', bytes: Array.from(wav) },
    ]);
    await expect(page.locator('[data-node-kind="asset"][data-ready="true"]')).toHaveCount(3);
    expect(mock.calls).toEqual([
      { path: '/upload', name: 'image.png', reqFrom: 'canvas-import-test' },
      { path: '/upload', name: 'clip.webm', reqFrom: 'canvas-import-test' },
      { path: '/upload-media', name: 'voice.wav', reqFrom: 'canvas-import-test' },
    ]);
    await expect
      .poll(() =>
        page.getByAltText('image.png').evaluate((n) => (n as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    for (const label of ['clip.webm', 'voice.wav']) {
      const media = page.getByLabel(label, { exact: true });
      await expect
        .poll(() => media.evaluate((n) => (n as HTMLMediaElement).readyState))
        .toBeGreaterThanOrEqual(2);
      await media.evaluate((n) => (n as HTMLMediaElement).play());
      await expect
        .poll(() => media.evaluate((n) => (n as HTMLMediaElement).currentTime))
        .toBeGreaterThan(0);
    }
    await expect(page.getByRole('region', { name: /编辑面板/ })).toHaveCount(0);
    const state = await readWorkspace(page);
    const first = state.projects[0]!.nodes[0]!;
    expect(first.position).toEqual({
      x: Math.round((point.x - point.origin.x) / 24) * 24,
      y: Math.round((point.y - point.origin.y) / 24) * 24,
    });
    for (const node of state.projects[0]!.nodes) {
      expect(node.type).toBe('asset');
      expect(Object.keys(node.data).sort()).toEqual(['kind', 'name', 'upload']);
    }
    await page.getByRole('button', { name: '适应视图' }).click();
    await page.screenshot({ path: test.info().outputPath('assets-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: test.info().outputPath('assets-dark.png') });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '资源画布测试' }).click();
    await expect(page.locator('[data-node-kind="asset"][data-ready="true"]')).toHaveCount(3);
    await expect
      .poll(() =>
        page.getByAltText('image.png').evaluate((n) => (n as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    expect(mock.calls).toHaveLength(3);
    await page.getByAltText('image.png').hover();
    await page.getByRole('button', { name: '删除资源 image.png', exact: true }).click();
    await expect(page.locator('.react-flow__node-asset')).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await mock.close();
  }
});

test('uploads survive project navigation and drop coordinates account for zoom', async () => {
  const mock = await service();
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await configure(page, mock.base);
    await page.getByRole('button', { name: '缩小', exact: true }).click();
    await expect(page.getByTestId('zoom-value')).not.toHaveText('100%');
    const viewport = await page.locator('.react-flow__viewport').evaluate((node) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return { x: matrix.e, y: matrix.f, zoom: matrix.a };
    });
    mock.setHold(true);
    const point = await drop(page, [
      { name: 'background.png', mime: 'image/png', bytes: Array.from(png) },
      { name: 'invalid.txt', mime: 'text/plain', bytes: [1] },
    ]);
    await expect(page.getByTestId('canvas-import-notice')).toContainText('只支持');
    await expect.poll(() => mock.calls.length).toBe(1);
    const initial = await readWorkspace(page);
    expect(initial.projects[0]!.nodes[0]!.position).toEqual({
      x: Math.round((point.x - point.origin.x - viewport.x) / viewport.zoom / 24) * 24,
      y: Math.round((point.y - point.origin.y - viewport.y) / viewport.zoom / 24) * 24,
    });
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('另一个项目');
    mock.release();
    await expect
      .poll(async () => {
        const state = await readWorkspace(page);
        const node = state.projects[0]!.nodes[0];
        return node?.type === 'asset' ? node.data.upload.status : '';
      })
      .toBe('ready');
    await expect(page.locator('.react-flow__node-asset')).toHaveCount(0);
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '资源画布测试' }).click();
    await expect
      .poll(() =>
        page.getByAltText('background.png').evaluate((n) => (n as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    mock.files.delete('background.png');
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '资源画布测试' }).click();
    await expect(page.getByTestId('result-error')).toContainText('媒体暂时无法加载');
    mock.files.set('background.png', { bytes: png, mime: 'image/png' });
    await page.getByRole('button', { name: '重新加载媒体' }).click();
    await expect
      .poll(() =>
        page.getByAltText('background.png').evaluate((n) => (n as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    expect(mock.calls).toHaveLength(1);
  } finally {
    await app.close();
    await mock.close();
  }
});

test('failed, interrupted and removed uploads stay explicit and never recreate removed nodes', async () => {
  const mock = await service();
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await drop(page, [{ name: 'image.png', mime: 'image/png', bytes: Array.from(png) }]);
    await expect(page.getByTestId('canvas-import-notice')).toContainText('req_from');
    expect(mock.calls).toHaveLength(0);
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await configure(page, mock.base);
    await drop(page, [{ name: 'notes.txt', mime: 'text/plain', bytes: [1] }]);
    await expect(page.getByTestId('canvas-import-notice')).toContainText('只支持');
    mock.setFail(true);
    await drop(page, [{ name: 'failed.png', mime: 'image/png', bytes: Array.from(png) }]);
    await expect(page.locator('[data-node-kind="asset"]')).toContainText('files[0].url');
    mock.setFail(false);
    mock.setHold(true);
    await drop(page, [{ name: 'removed.png', mime: 'image/png', bytes: Array.from(png) }]);
    await expect(page.locator('[data-node-kind="asset"]').last()).toContainText('正在上传');
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.screenshot({ path: test.info().outputPath(`uploading-node-${theme}.png`) });
    }
    await expect.poll(() => mock.calls.length).toBe(2);
    await page.locator('.react-flow__node-asset').last().click();
    await page.keyboard.press('Delete');
    mock.release();
    await page
      .getByLabel('导入画布素材')
      .setInputFiles({ name: 'interrupted.png', mimeType: 'image/png', buffer: png });
    await expect.poll(() => mock.calls.length).toBe(3);
    await expect(page.locator('.react-flow__node-asset')).toHaveCount(2);
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '资源画布测试' }).click();
    await expect(page.locator('[data-node-kind="asset"]')).toContainText([
      'files[0].url',
      '上传已中断',
    ]);
    mock.release();
    await expect(page.locator('[data-node-kind="asset"][data-ready="true"]')).toHaveCount(0);
    await expect(page.locator('.react-flow__node-asset')).toHaveCount(2);
    expect(mock.calls).toHaveLength(3);
  } finally {
    await app.close();
    await mock.close();
  }
});
