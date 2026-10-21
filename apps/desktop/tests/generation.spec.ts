import { createServer, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { _electron as electron, expect, test } from '@playwright/test';
import { generate, payload, ServiceError } from '../src/main/generation/protocol';
import { GenerationJobs } from '../src/main/generation/jobs';
import type { GenerationInput, StartRequest } from '../src/shared/generation';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=',
  'base64',
);
function input(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    kind: 'image',
    model: 'gpt-image-2',
    prompt: 'test',
    size: '3:2',
    quality: 'high',
    resolution: '1080p',
    duration: 5,
    generateAudio: true,
    imageList: [],
    videoList: [],
    audioList: [],
    ...overrides,
  };
}
async function service() {
  const calls: { path: string; body: Buffer; contentType: string }[] = [];
  let mode = 'success';
  let video: Buffer = Buffer.alloc(0);
  let held: ServerResponse | undefined;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const path = req.url ?? '';
    calls.push({
      path,
      body: Buffer.concat(chunks),
      contentType: req.headers['content-type'] ?? '',
    });
    if (path === '/image.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
      return;
    }
    if (path === '/video.webm') {
      res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': video.length });
      res.end(video);
      return;
    }
    if (path.startsWith('/upload')) {
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'upload-fail') res.end(JSON.stringify({ files: [] }));
      else {
        const filename =
          Buffer.concat(chunks)
            .toString()
            .match(/filename="([^"]+)"/)?.[1] ?? 'unknown';
        res.end(
          JSON.stringify({
            files: [
              { url: base + '/reference/' + encodeURIComponent(filename), status: 'duplicate' },
            ],
          }),
        );
      }
      return;
    }
    if (mode === 'disconnect') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': 999 });
      res.write('{');
      setTimeout(() => res.destroy(), 20);
      return;
    }
    if (mode === 'http-error') {
      res.writeHead(503);
      res.end('unavailable');
      return;
    }
    if (mode === 'json-error') {
      res.end('not json');
      return;
    }
    if (mode === 'empty') {
      res.end(JSON.stringify({ result: { status: 'success', content: [] } }));
      return;
    }
    if (mode === 'rejected') {
      res.end(JSON.stringify({ result: { status: 'error', error: { message: 'invalid model' } } }));
      return;
    }
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { model_name: string };
    const response = JSON.stringify({
      result: {
        status: 'success',
        content: [base + (body.model_name === 'seedance' ? '/video.webm' : '/image.png')],
      },
    });
    if (mode === 'hold') {
      held = res;
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    calls,
    setMode: (value: string) => {
      mode = value;
    },
    setVideo: (bytes: Buffer) => {
      video = bytes;
    },
    release: () =>
      held?.end(JSON.stringify({ result: { status: 'success', content: [base + '/image.png'] } })),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

test('payload families and response failures match the protocol', async () => {
  expect(payload(input(), 'test')).toMatchObject({
    model_name: 'gpt-image-2',
    config: { size: '1536x1024', n: 1, quality: 'high' },
  });
  const nano = payload(input({ model: 'nano-banana-2', size: '16:9', resolution: '4K' }), 'test');
  expect(nano).toMatchObject({
    model_name: 'nano-banana',
    version: 'gemini-3.1-flash-image-preview',
    config: { aspect_ratio: '16:9', image_size: '4K' },
  });
  expect(nano.config).not.toHaveProperty('n');
  expect(nano.config).not.toHaveProperty('quality');
  expect(
    payload(
      input({
        kind: 'video',
        model: 'seedance-2.5',
        size: 'adaptive',
        resolution: '4k',
        duration: 30,
      }),
      'test',
    ),
  ).toMatchObject({
    version: 'doubao-seedance-2-5-260628',
    config: { resolution: '1080p', duration: 30 },
  });
  expect(
    payload(input({ kind: 'video', model: 'seedance-2.0', size: '16:9', duration: 30 }), 'test'),
  ).toMatchObject({ config: { duration: 15 } });
  expect(() => payload(input({ duration: 31 }), 'test')).toThrow();
  expect(() =>
    payload(input({ imageList: Array(10).fill('https://example.invalid/ref.png') }), 'test'),
  ).toThrow();
  expect(() =>
    payload(
      input({
        kind: 'video',
        model: 'seedance-2.0',
        size: '16:9',
        audioList: Array(4).fill('https://example.invalid/ref.wav'),
      }),
      'test',
    ),
  ).toThrow();
  expect(() => payload(input({ prompt: '  ' }), 'test')).toThrow();
  const mock = await service();
  try {
    for (const mode of ['http-error', 'json-error', 'empty', 'rejected']) {
      mock.setMode(mode);
      await expect(generate(mock.base + '/generate', input(), 'test')).rejects.toBeInstanceOf(
        ServiceError,
      );
    }
    mock.setMode('disconnect');
    await expect(generate(mock.base + '/generate', input(), 'test')).rejects.toMatchObject({
      unknown: true,
    });
  } finally {
    await mock.close();
  }
});

test('local jobs prevent duplicates and recover interrupted tasks without resubmission', async () => {
  const mock = await service();
  try {
    mock.setMode('hold');
    const file = test.info().outputPath('jobs.json');
    const jobs = new GenerationJobs(file);
    await jobs.initialize();
    const request: StartRequest = {
      requestId: randomUUID(),
      projectId: randomUUID(),
      nodeId: randomUUID(),
      settings: {
        reqFrom: 'test',
        generateUrl: mock.base + '/generate',
        imageUploadUrl: '',
        audioUploadUrl: '',
      },
      input: input(),
    };
    const [a, b] = await Promise.all([jobs.start(request), jobs.start(request)]);
    expect(a.requestId).toBe(b.requestId);
    await expect(jobs.start({ ...request, requestId: randomUUID() })).rejects.toThrow('已有进行中');
    await expect(jobs.start({ ...request, input: input({ prompt: 'different' }) })).rejects.toThrow(
      '不同内容',
    );
    await expect.poll(() => mock.calls.filter((c) => c.path === '/generate').length).toBe(1);
    const recoveryFile = test.info().outputPath('recovery.json');
    await writeFile(recoveryFile, JSON.stringify([{ ...a, fingerprint: 'test' }]));
    const recovered = new GenerationJobs(recoveryFile);
    await recovered.initialize();
    expect(recovered.get(a.requestId)?.status).toBe('unknown');
    expect(mock.calls.filter((c) => c.path === '/generate')).toHaveLength(1);
    mock.release();
    await expect.poll(() => jobs.get(a.requestId)?.status).toBe('succeeded');
  } finally {
    await mock.close();
  }
});

test('Electron uploads references, generates image and video, and restores results', async () => {
  const mock = await service();
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
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d')!;
      ctx.fillRect(0, 0, 16, 16);
      const stream = canvas.captureStream(5);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks: Blob[] = [];
      const done = new Promise<Blob>((resolve) => {
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });
      recorder.start();
      let frame = 0;
      const animation = setInterval(() => {
        ctx.fillStyle = frame++ % 2 ? '#206080' : '#802060';
        ctx.fillRect(0, 0, 16, 16);
      }, 50);
      await new Promise((r) => setTimeout(r, 900));
      clearInterval(animation);
      recorder.stop();
      const blob = await done;
      stream.getTracks().forEach((t) => t.stop());
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    mock.setVideo(Buffer.from(bytes));
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await page.getByLabel('req_from', { exact: true }).fill('test-client');
    await page.getByLabel('aigc 地址', { exact: true }).fill(mock.base + '/generate');
    await page.getByLabel('upload 地址', { exact: true }).fill(mock.base + '/upload');
    await page.getByLabel('upload-media 地址', { exact: true }).fill(mock.base + '/upload-audio');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.locator('.form-actions')).toContainText('已保存到本机');
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('生成联调测试');
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await page.locator('.react-flow__node-media').last().click();
    await page.getByLabel('图像提示词').fill('a cat');
    await page.getByLabel('选择模型', { exact: true }).selectOption('gpt-image-2');
    await page.getByLabel('选择参考素材').setInputFiles([
      { name: 'ref-z.png', mimeType: 'image/png', buffer: png },
      { name: 'ref-a.png', mimeType: 'image/png', buffer: png },
    ]);
    await page.getByLabel('图像提示词').fill('a cat @');
    await page.getByRole('option', { name: /图片 1.*ref-z.png/ }).click();
    await expect(page.locator('.prompt-tag')).toHaveText('@image_1');
    await page.screenshot({ path: test.info().outputPath('prompt-mention.png') });
    mock.setMode('upload-fail');
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect(page.locator('.editor-notice')).toContainText('files[0].url');
    expect(mock.calls.filter((c) => c.path === '/generate')).toHaveLength(0);
    mock.setMode('hold');
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect(page.getByRole('button', { name: '生成图像', exact: true })).toBeDisabled();
    await expect.poll(() => mock.calls.filter((c) => c.path === '/generate').length).toBe(1);
    const upload = mock.calls.find((c) => c.path === '/upload')!;
    expect(upload.contentType).toContain('multipart/form-data; boundary=');
    expect(upload.body.toString()).toContain('name="files"');
    expect(upload.body.toString()).toContain('test-client');
    await page.reload();
    await page.getByRole('button', { name: /生成联调测试/ }).click();
    await expect(page.locator('.node-generating')).toHaveText('正在生成…');
    await expect(page.getByText('点击编辑图像', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重命名 图像生成', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('generating-center-light.png') });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await expect(page.locator('.node-generating svg')).toHaveCSS('animation-name', 'none');
    await page.screenshot({ path: test.info().outputPath('generating-center-dark.png') });
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    mock.release();
    await expect(page.getByAltText('生成的图像')).toBeVisible();
    await expect
      .poll(() =>
        page.getByAltText('生成的图像').evaluate((n) => (n as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    await expect(page.locator('.node-task-status')).toHaveCount(0);
    mock.setMode('success');
    await page.getByRole('button', { name: '视频', exact: true }).click();
    await page.locator('.react-flow__node-media').last().click();
    await page.getByLabel('视频提示词').fill('slow camera');
    await page.getByLabel('选择模型', { exact: true }).selectOption('seedance-2.0');
    await page.getByLabel('选择参考素材').setInputFiles([
      { name: 'ref.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) },
      { name: 'ref.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFFfixture') },
      { name: 'ref-second.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) },
      { name: 'ref-second.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFFfixture') },
    ]);
    await page.getByLabel('视频提示词').fill('slow camera @video_2 @audio_1');
    await expect(page.locator('.prompt-tag')).toHaveText(['@video_2', '@audio_1']);
    await page.getByRole('button', { name: '生成视频', exact: true }).click();
    await expect(page.getByLabel('生成的视频', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByLabel('生成的视频', { exact: true })
          .evaluate((n) => (n as HTMLVideoElement).readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await page
      .getByLabel('生成的视频', { exact: true })
      .evaluate((n) => (n as HTMLVideoElement).play());
    await expect
      .poll(() =>
        page
          .getByLabel('生成的视频', { exact: true })
          .evaluate((n) => (n as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0);
    expect(mock.calls.some((c) => c.path === '/upload-audio')).toBe(true);
    const requests = mock.calls
      .filter((c) => c.path === '/generate')
      .map((c) => JSON.parse(c.body.toString()));
    expect(requests[0]).toMatchObject({
      req_from: 'test-client',
      prompt: 'a cat <<<image_1>>>',
      image_list: [mock.base + '/reference/ref-z.png', mock.base + '/reference/ref-a.png'],
      config: { n: 1 },
    });
    expect(requests[1]).toMatchObject({
      model_name: 'seedance',
      mode: 'reference_image',
      prompt: 'slow camera <<<video_2>>> <<<audio_1>>>',
      video_list: [mock.base + '/reference/ref.webm', mock.base + '/reference/ref-second.webm'],
      audio_list: [mock.base + '/reference/ref.wav', mock.base + '/reference/ref-second.wav'],
    });
    await page.getByRole('button', { name: '关闭编辑面板', exact: true }).click();
    for (const kind of ['图像', '视频']) {
      const filePath = test.info().outputPath(kind === '图像' ? 'result.png' : 'result.webm');
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, filePath);
      await page.getByRole('button', { name: `下载${kind}`, exact: true }).click();
      await expect(page.locator('.node-download-notice').last()).toContainText('已下载');
      expect(await readFile(filePath)).toEqual(kind === '图像' ? png : Buffer.from(bytes));
    }
    await page
      .locator('.react-flow__node-media')
      .first()
      .click({ position: { x: 30, y: 30 } });
    mock.setMode('hold');
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect(page.locator('.node-generating')).toHaveText('正在生成…');
    await expect(page.getByAltText('生成的图像')).toHaveCount(0);
    await expect(
      page.locator('.react-flow__node-media').first().getByRole('button', { name: '下载图像' }),
    ).toHaveCount(0);
    await expect.poll(() => mock.calls.filter((c) => c.path === '/generate').length).toBe(3);
    mock.release();
    await expect(page.getByAltText('生成的图像')).toBeVisible();
    await expect(
      page.locator('.react-flow__node-media').first().locator('.node-task-status'),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '关闭编辑面板', exact: true }).click();
    await page.locator('.react-flow__node-media').last().click();
    mock.setMode('disconnect');
    await page.getByRole('button', { name: '生成视频', exact: true }).click();
    await expect(page.locator('.editor-notice')).toContainText('结果未知');
    const submitted = mock.calls.filter((c) => c.path === '/generate').length;
    expect(submitted).toBe(4);
    await page.reload();
    await page.getByRole('button', { name: /生成联调测试/ }).click();
    await page.locator('.react-flow__node-media').last().click();
    await expect(page.locator('.editor-notice')).toContainText('结果未知');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: '生成视频', exact: true }).click();
    expect(mock.calls.filter((c) => c.path === '/generate')).toHaveLength(submitted);
    await page.screenshot({ path: test.info().outputPath('generated.png') });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await mock.close();
  }
});
