import { seedWorkspace } from './helpers/workspace';
import { generationInputSchema } from '../src/shared/generation';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import {
  createMedia,
  createProject,
  emptyWorkspace,
  type MediaData,
} from '../src/renderer/src/features/creation/types';
import { mediaHeight, mediaTime } from '../src/renderer/src/features/creation/node-actions-context';
import { recordVideo } from './helpers/record-video';
test('node media sizing and elapsed labels clamp to the specified bounds', () => {
  expect(mediaHeight(1600, 900)).toBe(180);
  expect(mediaHeight(900, 1600)).toBe(320);
  expect(mediaHeight(1200, 900)).toBe(240);
  expect(mediaHeight(0, 0)).toBe(180);
  expect(mediaTime(84.7)).toBe('1:24');
  expect(mediaTime(-3)).toBe('0:00');
});
test('canvas visual states, sizing, hot areas, inline playback, retries and editor flipping work in both themes', async () => {
  test.setTimeout(60000);
  let base = '',
    broken = true,
    releaseSlow: () => void = () => {};
  let video = Buffer.alloc(0);
  const tasks = new Map<string, boolean>();
  const svg = (portrait = false) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${portrait ? 90 : 160}" height="${portrait ? 160 : 90}"><rect width="100%" height="100%" fill="#8a8a8e"/></svg>`;
  const wav = Buffer.alloc(44 + 16000);
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
  wav.writeUInt32LE(16000, 40);
  const server = createServer(async (req, res) => {
    const path = req.url ?? '';
    if (path === '/video.webm') {
      res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': video.length });
      res.end(video);
      return;
    }
    if (path === '/audio.wav') {
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(wav);
      return;
    }
    if (path.endsWith('.svg')) {
      if (path === '/broken.svg' && broken) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (path === '/slow.svg')
        await new Promise<void>((r) => {
          releaseSlow = r;
        });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(svg(path === '/portrait.svg'));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const id = randomUUID();
      tasks.set(id, body.prompt === 'busy');
      res.end(JSON.stringify({ task_id: id, status: 'running' }));
      return;
    }
    if (path.startsWith('/model-quota')) {
      res.end(JSON.stringify({ granted: true, items: [] }));
      return;
    }
    const id = path.split('/').at(-1) ?? '',
      held = tasks.get(id);
    res.end(
      JSON.stringify({
        task_id: id,
        status: held ? 'running' : 'success',
        response: held
          ? null
          : { request_id: id, result: { status: 'success', content: [base + '/wide.svg'] } },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing service');
  base = `http://127.0.0.1:${address.port}`;
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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000),
    );
    video = Buffer.from(await page.evaluate(recordVideo));
    const p = createProject();
    p.name = '节点状态验收';
    p.viewport = { x: 24, y: 24, zoom: 0.6 };
    const add = (
      id: string,
      status?: NonNullable<MediaData['generation']>['status'],
      url?: string,
      kind: 'image' | 'video' = 'image',
    ) => {
      const index = p.nodes.length,
        requestId = randomUUID();
      const data: MediaData = {
        ...createMedia(kind),
        name: id,
        prompt: id === 'busy' ? 'busy' : ['empty', 'flip'].includes(id) ? '' : 'retry',
      };
      if (status)
        data.generation = {
          requestId,
          startedAt: Date.now(),
          status,
          error: status === 'failed' ? '示例失败原因' : undefined,
        };
      if (url) data.result = { requestId, url };
      p.nodes.push({
        id,
        type: 'media',
        position: { x: (index % 4) * 400, y: index < 8 ? Math.floor(index / 4) * 400 : 1000 },
        data,
      });
      return data;
    };
    add('empty');
    const busy = add('busy', 'running');
    add('failed', 'failed');
    add('old-result', 'failed', base + '/wide.svg');
    add('unknown', 'unknown');
    add('loading', 'succeeded', base + '/slow.svg');
    add('broken', 'succeeded', base + '/broken.svg');
    add('video', 'succeeded', base + '/video.webm', 'video');
    p.nodes.push({
      id: 'portrait',
      type: 'asset',
      position: { x: 0, y: 1000 },
      data: {
        name: '竖图素材',
        kind: 'image',
        upload: { status: 'ready', url: base + '/portrait.svg' },
      },
    });
    p.nodes.push({
      id: 'audio',
      type: 'asset',
      position: { x: 400, y: 1000 },
      data: {
        name: '音频素材',
        kind: 'audio',
        upload: { status: 'ready', url: base + '/audio.wav' },
      },
    });
    p.nodes.push({
      id: 'upload-failed',
      type: 'asset',
      position: { x: 800, y: 1000 },
      data: {
        name: '失败素材',
        kind: 'image',
        upload: { status: 'failed', error: '上传失败示例' },
      },
    });
    add('flip');
    const settings = {
      reqFrom: 'visual-test',
      generateUrl: base + '/tasks',
      imageUploadUrl: base + '/upload',
      audioUploadUrl: base + '/upload-audio',
    };
    const job = await page.evaluate(
      async ({ id, nodeId, requestId, settings, input }) => {
        const r = await window.desktop!.generation.start({
          projectId: id,
          nodeId,
          requestId,
          settings,
          input,
        });
        if (!r.ok) throw new Error(r.error);
        return r.value;
      },
      {
        id: p.id,
        nodeId: 'busy',
        requestId: busy.generation!.requestId,
        settings,
        input: generationInputSchema.parse({
          ...busy,
          imageList: [],
          videoList: [],
          audioList: [],
        }),
      },
    );
    busy.generation = { requestId: job.requestId, status: job.status, startedAt: job.startedAt };
    await seedWorkspace(app, page, { ...emptyWorkspace, projects: [p], settings });
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
    await expect(node('empty').getByTestId('media-placeholder')).toHaveCSS('width', '320px');
    await expect(node('empty').getByTestId('media-placeholder')).toHaveCSS('height', '180px');
    await expect(node('portrait').getByTestId('media-placeholder')).toHaveCSS('height', '320px');
    const elapsed = await node('busy').getByTestId('node-generating').textContent();
    await expect
      .poll(() => node('busy').getByTestId('node-generating').textContent())
      .not.toBe(elapsed);
    await expect(node('busy').getByRole('button', { name: '删除节点' })).toHaveCount(0);
    await expect(node('loading')).toContainText('正在加载媒体');
    await expect(node('broken').getByTestId('result-error')).toBeVisible();
    await expect(node('old-result').getByAltText('生成的图像')).toBeVisible();
    await expect(node('old-result').getByTestId('node-task-status')).toHaveText('失败');
    const dir = resolve(import.meta.dirname, '../test-results/ui-v1/phase-l');
    await mkdir(dir, { recursive: true });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.mouse.move(60, 40);
      await page.screenshot({ path: resolve(dir, `node-states-${theme}.png`) });
    }
    await node('flip').click();
    const editor = page.getByRole('region', { name: '图像编辑面板' });
    await expect(editor).toContainText('选择模型并填写提示词后可生成');
    await expect
      .poll(async () => {
        const panel = await editor.boundingBox();
        const anchor = await node('flip').boundingBox();
        return panel && anchor ? anchor.y - panel.y - panel.height : 0;
      })
      .toBeGreaterThanOrEqual(15);
    const box = await editor.boundingBox(),
      target = await node('flip').boundingBox(),
      canvas = await page.getByTestId('canvas-body').boundingBox();
    if (!box || !target || !canvas) throw new Error('Missing geometry');
    expect(box.y + box.height).toBeLessThanOrEqual(target.y - 15);
    expect(box.x).toBeGreaterThanOrEqual(canvas.x + 15);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width - 15);
    await expect(editor.locator('[data-ui="select-leading"]')).toHaveCount(0);
    await expect(page.getByTestId('editor-position')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: resolve(dir, 'editor-flipped-dark.png') });
    await page.getByLabel('选择参考素材').setInputFiles([
      { name: '海边.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg()) },
      { name: '城市.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg(true)) },
    ]);
    await page.getByLabel('图像提示词').fill('海边日落，暖色调，参考 @image_1 和 @image_2');
    await expect(page.getByTestId('prompt-tag')).toHaveCount(2);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.screenshot({ path: resolve(dir, `editor-normal-${theme}.png`) });
      await page.getByRole('button', { name: '放大编辑' }).click();
      await page.screenshot({ path: resolve(dir, `editor-expanded-${theme}.png`) });
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    await page.keyboard.press('Tab');
    await node('empty').focus();
    await expect(node('empty')).toBeFocused();
    expect(
      await node('empty')
        .getByTestId('media-placeholder')
        .evaluate((el) => getComputedStyle(el, '::after').borderWidth),
    ).toBe('3px');
    const port = node('empty').getByRole('button', { name: '输出连接' });
    await expect(port).toHaveCSS('width', '28px');
    await port.hover();
    await expect(page.getByRole('tooltip')).toContainText('拖向下游节点');
    expect(await port.evaluate((el) => getComputedStyle(el, '::after').width)).toBe('18px');
    await page.screenshot({ path: resolve(dir, 'node-port-focus-dark.png') });
    await node('unknown').getByRole('button', { name: '查看任务信息' }).click();
    await expect(page.getByTestId('generation-details')).toHaveAttribute('data-state', 'open');
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    broken = false;
    await node('broken').getByRole('button', { name: '重新加载媒体' }).click();
    await expect(node('broken').getByAltText('生成的图像')).toBeVisible();
    releaseSlow();
    await expect(node('loading').getByAltText('生成的图像')).toBeVisible();
    const v = node('video').getByLabel('生成的视频', { exact: true });
    await expect(v).toHaveJSProperty('controls', false);
    await node('video').hover();
    await node('video').getByRole('button', { name: '播放生成的视频' }).click();
    await expect
      .poll(() => v.evaluate((e) => (e as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0);
    await node('audio').getByRole('button', { name: '播放音频素材' }).click();
    await expect
      .poll(() =>
        node('audio')
          .getByLabel('音频素材', { exact: true })
          .evaluate((e) => (e as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0);
    await node('failed').getByRole('button', { name: '重试', exact: true }).click();
    await expect(node('failed').getByAltText('生成的图像')).toBeVisible({ timeout: 12000 });
    await node('upload-failed').hover();
    await node('upload-failed').getByRole('button', { name: '删除资源 失败素材' }).click();
    await expect(node('upload-failed')).toHaveCount(0);
  } finally {
    releaseSlow();
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
