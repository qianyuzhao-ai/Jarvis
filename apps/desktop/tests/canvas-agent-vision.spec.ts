import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { createProject, emptyWorkspace } from '../src/renderer/src/features/creation/types';
test('selected images and sampled video frames reach the vision model; failed assets can be removed', async () => {
  test.setTimeout(60000);
  const video = await readFile(resolve(import.meta.dirname, 'fixtures/vision-colors.mp4'));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=',
    'base64',
  );
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith('/image')) {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png);
      return;
    }
    if (req.url === '/clip.mp4') {
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
      const start = Number(range?.[1] ?? 0),
        end = range?.[2] ? Number(range[2]) : video.length - 1;
      res.writeHead(range ? 206 : 200, {
        'content-type': 'video/mp4',
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
        ...(range ? { 'content-range': `bytes ${start}-${end}/${video.length}` } : {}),
      });
      res.end(video.subarray(start, end + 1));
      return;
    }
    if (req.url === '/missing') {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [delta, finish_reason] of [
      [{ content: '已查看两张图片和视频的三个代表帧。' }, null],
      [{}, 'stop'],
    ]) {
      res.write(
        `data: ${JSON.stringify({ id: 'vision', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server');
  const origin = `http://127.0.0.1:${address.port}`;
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
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 950));
    const project = createProject();
    project.name = '视觉资产项目';
    project.nodes = [
      {
        id: 'asset-a',
        type: 'asset',
        position: { x: 20, y: 160 },
        data: {
          kind: 'image',
          name: '参考图一.png',
          upload: { status: 'ready', url: origin + '/image-a' },
        },
      },
      {
        id: 'asset-b',
        type: 'asset',
        position: { x: 420, y: 160 },
        data: {
          kind: 'image',
          name: '参考图二.png',
          upload: { status: 'ready', url: origin + '/image-b' },
        },
      },
      {
        id: 'asset-c',
        type: 'asset',
        position: { x: 820, y: 160 },
        data: {
          kind: 'video',
          name: '颜色变化.mp4',
          upload: { status: 'ready', url: origin + '/clip.mp4' },
        },
      },
      {
        id: 'asset-bad',
        type: 'asset',
        position: { x: 20, y: 480 },
        data: {
          kind: 'image',
          name: '失效图片.png',
          upload: { status: 'ready', url: origin + '/missing' },
        },
      },
    ];
    await page.evaluate(
      async ({ data, origin }) => {
        const configured = await window.desktop?.agent.saveConfiguration({
          config: {
            name: 'Vision mock',
            baseUrl: origin + '/v1',
            api: 'openai-completions',
            model: 'vision',
            contextWindow: 1000000,
            maxTokens: 4096,
          },
          apiKey: '',
          clearKey: false,
        });
        if (!configured?.ok) throw new Error('Cannot save configuration');
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open('jarvis-workspace', 1);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(data, 'current');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      { data: { ...emptyWorkspace, projects: [project] }, origin },
    );
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.locator('.project-row').filter({ hasText: '视觉资产项目' }).click();
    for (const id of ['asset-a', 'asset-b', 'asset-c'])
      await page
        .locator(`.react-flow__node[data-id="${id}"]`)
        .click({ modifiers: ['Shift'], position: { x: 10, y: 10 } });
    await page.getByRole('button', { name: '展开画布助手', exact: true }).click();
    const sidebar = page.getByRole('complementary', { name: '画布助手' });
    await expect(sidebar.locator('.canvas-context-scope')).toContainText('3 个选中节点');
    await sidebar.getByRole('button', { name: '添加选中画布资产' }).click();
    await expect(sidebar.locator('.canvas-attachment[data-status="ready"]')).toHaveCount(3, {
      timeout: 20000,
    });
    await expect(sidebar.locator('.canvas-attachments')).toContainText('视频 · 3 帧');
    await sidebar.getByRole('button', { name: '移除待发送资产：参考图二.png' }).click();
    await expect(sidebar.locator('.canvas-attachment')).toHaveCount(2);
    await sidebar.getByRole('button', { name: '添加选中画布资产' }).click();
    await expect(sidebar.locator('.canvas-attachment[data-status="ready"]')).toHaveCount(3);
    await page.screenshot({ path: test.info().outputPath('canvas-vision-attachments.png') });
    await sidebar.getByLabel('消息', { exact: true }).fill('比较这些图片和视频帧');
    await sidebar.getByRole('button', { name: '发送消息' }).click();
    await expect(sidebar.locator('.chat-message.assistant[data-status="succeeded"]')).toContainText(
      '已查看两张图片',
    );
    const serialized = JSON.stringify(requests[0]);
    expect(serialized.match(/data:image\/jpeg;base64/g)).toHaveLength(5);
    expect(serialized).toContain('video-frame');
    expect(serialized).not.toContain(origin + '/clip.mp4');
    await expect(sidebar.locator('.chat-vision-assets img')).toHaveCount(5);
    await expect(sidebar.locator('.canvas-attachments')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('canvas-vision-sent.png') });
    const snapshot = await page.evaluate(async () => window.desktop?.agent.getSnapshot());
    const user = snapshot?.ok ? snapshot.value.snapshot.sessions[0]?.messages[0] : undefined;
    expect(user?.visionAssets?.filter((a) => a.kind === 'video-frame').map((a) => a.time)).toEqual([
      0.2, 1, 1.8,
    ]);
    expect(user?.visionAssets?.filter((a) => a.kind === 'video-frame')[0]?.preview).not.toBe(
      user?.visionAssets?.filter((a) => a.kind === 'video-frame')[2]?.preview,
    );
    await page
      .locator('.react-flow__node[data-id="asset-bad"]')
      .click({ position: { x: 10, y: 10 } });
    await sidebar.getByRole('button', { name: '添加选中画布资产' }).click();
    await expect(sidebar.locator('.canvas-attachment[data-status="failed"]')).toHaveCount(1);
    await sidebar.getByLabel('消息', { exact: true }).fill('不能发送失败的附件');
    await expect(sidebar.getByRole('button', { name: '发送消息' })).toBeDisabled();
    await sidebar.getByRole('button', { name: '移除待发送资产：失效图片.png' }).click();
    await expect(sidebar.getByRole('button', { name: '发送消息' })).toBeEnabled();
    expect(requests).toHaveLength(1);
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.locator('.project-row').filter({ hasText: '视觉资产项目' }).click();
    await expect(page.locator('.canvas-agent .chat-vision-assets img')).toHaveCount(5);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
