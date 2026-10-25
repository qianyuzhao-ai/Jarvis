import { seedWorkspace } from './helpers/workspace';
import { recordVideo } from './helpers/record-video';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { _electron as electron, expect as baseExpect, test } from '@playwright/test';

import { payload, ServiceError } from '../src/main/generation/protocol';
import { TaskService } from './helpers/task-service';
import { getTask, submitTask } from '../src/main/generation/task-protocol';
import { GenerationJobs } from '../src/main/generation/jobs';
import {
  startRequestSchema,
  uploadRequestSchema,
  jobSchema,
  requestRecordSchema,
  type GenerationInput,
  type StartRequest,
} from '../src/shared/generation';
import { applyCanvasOperations } from '../src/main/projects/canvas-engine';
import { storedForm } from '../src/renderer/src/features/creation/project-records';
import { createProject, emptyWorkspace } from '../src/renderer/src/features/creation/types';

const expect = baseExpect.configure({ timeout: 12_000 });
test.setTimeout(60_000);

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
  const tasks = new TaskService();
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const path = req.url ?? '';
    calls.push({
      path,
      body: Buffer.concat(chunks),
      contentType: req.headers['content-type'] ?? '',
    });
    if (tasks.query(req, res)) return;
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
      tasks.submit(res, { result: { status: 'success', content: [] } });
      return;
    }
    if (mode === 'rejected') {
      tasks.submit(res, { result: { status: 'error', error: { message: 'invalid model' } } });
      return;
    }
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { model_name: string };
    const response = {
      result: {
        status: 'success',
        content: [base + (body.model_name === 'seedance' ? '/video.webm' : '/image.png')],
      },
    };
    tasks.hold = mode === 'hold';
    res.setHeader('Content-Type', 'application/json');
    tasks.submit(res, response);
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
    release: () => {
      tasks.hold = false;
    },
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
    for (const mode of ['http-error', 'json-error']) {
      mock.setMode(mode);
      await expect(
        submitTask(mock.base + '/generate', JSON.stringify(payload(input(), 'test'))),
      ).rejects.toBeInstanceOf(ServiceError);
    }
    mock.setMode('empty');
    const empty = await submitTask(
      mock.base + '/generate',
      JSON.stringify(payload(input(), 'test')),
    );
    await expect(getTask(mock.base + '/generate', empty.task_id)).rejects.toThrow(
      '缺少有效结果地址',
    );
    mock.setMode('rejected');
    const rejected = await submitTask(
      mock.base + '/generate',
      JSON.stringify(payload(input(), 'test')),
    );
    expect(await getTask(mock.base + '/generate', rejected.task_id)).toMatchObject({
      status: 'failed',
      error: 'invalid model',
    });
    mock.setMode('disconnect');
    await expect(
      submitTask(mock.base + '/generate', JSON.stringify(payload(input(), 'test'))),
    ).rejects.toMatchObject({
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
    const jobs = new GenerationJobs(file, 20);
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
    jobs.dispose();
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
    async function checkResult(kind: string) {
      await expect(page.getByTestId('generation-notice')).toContainText('今日剩余 116');
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`generation-notice-${kind}.png`),
      });
      await page.getByRole('button', { name: '关闭生成提醒' }).click();
      await expect(page.getByTestId('generation-notice')).toHaveCount(0);
      const details = page.getByTestId('generation-details');
      await expect(details).toHaveAttribute('data-state', 'closed');
      await expect(page.getByRole('button', { name: '复制返回 URL' })).not.toBeVisible();
      await page.getByLabel('生成信息', { exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('data-state', 'open');
      const url = await details.locator('code').innerText();
      expect(url).toMatch(/^https?:/);
      await page.getByRole('button', { name: '复制返回 URL' }).click();
      await expect(page.getByRole('button', { name: '复制返回 URL' })).toHaveText('已复制');
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(url);
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`generation-details-${kind}.png`),
      });
      await page.getByLabel('生成信息', { exact: true }).click();
      await expect(details).toHaveAttribute('data-state', 'closed');
    }
    const deniedCopy = await page.evaluate(() =>
      window.desktop?.generation.copyResultUrl(crypto.randomUUID()),
    );
    expect(deniedCopy?.ok).toBe(false);
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const bytes = await page.evaluate(recordVideo);
    mock.setVideo(Buffer.from(bytes));
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await page.getByLabel('req_from', { exact: true }).fill('test-client');
    await page.getByLabel('生成任务地址', { exact: true }).fill(mock.base + '/generate');
    await page.getByLabel('upload 地址', { exact: true }).fill(mock.base + '/upload');
    await page.getByLabel('upload-media 地址', { exact: true }).fill(mock.base + '/upload-audio');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.getByTestId('form-actions')).toContainText('已保存到本机');
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('生成联调测试');
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await page
      .locator('.react-flow__node-media')
      .last()
      .click({ position: { x: 30, y: 30 } });
    await page.getByLabel('图像提示词').fill('a cat');
    await page.getByLabel('选择模型', { exact: true }).selectOption('gpt-image-2');
    await page.getByLabel('选择参考素材').setInputFiles([
      { name: 'ref-z.png', mimeType: 'image/png', buffer: png },
      { name: 'ref-a.png', mimeType: 'image/png', buffer: png },
    ]);
    await page.getByLabel('图像提示词').fill('a cat @');
    await page.getByRole('option', { name: /图片 1.*ref-z.png/ }).click();
    await expect(page.getByTestId('prompt-tag')).toHaveText('@image_1');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('prompt-mention.png'),
    });
    mock.setMode('upload-fail');
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect(page.getByTestId('editor-notice')).toContainText('files[0].url');
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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '生成联调测试' }).click();
    await expect(page.getByTestId('node-generating')).toHaveText(/正在生成 · 已 \d+:\d{2}/);
    await expect(page.getByText('点击编辑图像', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重命名 图像生成', exact: true })).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('generating-center-light.png'),
    });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await expect(page.locator('[data-testid="node-generating"] svg')).toHaveCSS(
      'animation-name',
      'none',
    );
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('generating-center-dark.png'),
    });
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    mock.release();
    await expect(page.getByAltText('生成的图像')).toBeVisible();
    await expect
      .poll(() =>
        page.getByAltText('生成的图像').evaluate((n) => (n as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    await expect(page.getByTestId('node-task-status')).toHaveCount(0);
    await page
      .locator('.react-flow__node-media')
      .first()
      .click({ position: { x: 30, y: 30 } });
    await checkResult('image');
    mock.setMode('success');
    await page.getByRole('button', { name: '视频', exact: true }).click();
    await page
      .locator('.react-flow__node-media')
      .last()
      .click({ position: { x: 30, y: 30 } });
    await page.getByLabel('视频提示词').fill('slow camera');
    await page.getByLabel('选择模型', { exact: true }).selectOption('seedance-2.0');
    await page.getByLabel('选择参考素材').setInputFiles([
      { name: 'ref.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) },
      { name: 'ref.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFFfixture') },
      { name: 'ref-second.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) },
      { name: 'ref-second.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFFfixture') },
    ]);
    await page.getByLabel('视频提示词').fill('slow camera @video_2 @audio_1');
    await expect(page.getByTestId('prompt-tag')).toHaveText(['@video_2', '@audio_1']);
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
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await checkResult('video');
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
      await page
        .locator('.react-flow__node-media')
        .filter({ has: page.getByRole('button', { name: `下载${kind}`, exact: true }) })
        .hover({ position: { x: 10, y: 10 } });
      await page.getByRole('button', { name: `下载${kind}`, exact: true }).click();
      await expect(page.getByTestId('node-download-notice').last()).toContainText('已下载');
      expect(await readFile(filePath)).toEqual(kind === '图像' ? png : Buffer.from(bytes));
    }
    await page
      .locator('.react-flow__node-media')
      .first()
      .click({ position: { x: 30, y: 30 } });
    mock.setMode('hold');
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect(page.getByTestId('node-generating')).toHaveText(/正在生成 · 已 \d+:\d{2}/);
    await expect(page.getByAltText('生成的图像')).toHaveCount(0);
    await expect(
      page.locator('.react-flow__node-media').first().getByRole('button', { name: '下载图像' }),
    ).toHaveCount(0);
    await expect.poll(() => mock.calls.filter((c) => c.path === '/generate').length).toBe(3);
    mock.release();
    await expect(page.getByAltText('生成的图像')).toBeVisible();
    await expect(
      page.locator('.react-flow__node-media').first().getByTestId('node-task-status'),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '关闭编辑面板', exact: true }).click();
    await page
      .locator('.react-flow__node-media')
      .last()
      .click({ position: { x: 30, y: 30 } });
    mock.setMode('disconnect');
    await page.getByRole('button', { name: '生成视频', exact: true }).click();
    await expect(page.getByTestId('editor-notice')).toContainText('结果未知');
    const submitted = mock.calls.filter((c) => c.path === '/generate').length;
    expect(submitted).toBe(4);
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '生成联调测试' }).click();
    await page
      .locator('.react-flow__node-media')
      .last()
      .click({ position: { x: 30, y: 30 } });
    await expect(page.getByTestId('editor-notice')).toContainText('结果未知');
    await page.getByRole('button', { name: '生成视频', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    expect(mock.calls.filter((c) => c.path === '/generate')).toHaveLength(submitted);
    await page.getByRole('button', { name: '生成视频', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: '仍要重新生成', exact: true })
      .click();
    await expect
      .poll(() => mock.calls.filter((c) => c.path === '/generate').length)
      .toBe(submitted + 1);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('generated.png'),
    });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await mock.close();
  }
});

test('generation identifiers follow canvas rules while request and project IDs remain UUIDs', () => {
  for (const schema of [startRequestSchema, uploadRequestSchema, jobSchema, requestRecordSchema]) {
    for (const id of ['agent-image', 'agent-video', randomUUID()])
      expect(schema.shape.nodeId.safeParse(id).success).toBe(true);
    for (const id of ['', 'x'.repeat(101)])
      expect(schema.shape.nodeId.safeParse(id).success).toBe(false);
    expect(schema.shape.requestId.safeParse('agent-request').success).toBe(false);
    expect(schema.shape.projectId.safeParse('agent-project').success).toBe(false);
  }
});

test('Agent-created image and video nodes upload, generate through Electron and survive restart', async () => {
  const mock = await service();
  const profile = test.info().outputPath('agent-profile');
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
    const project = applyCanvasOperations(storedForm(createProject()).project, [
      {
        kind: 'create_node',
        nodeId: 'agent-image',
        media: 'image',
        x: 0,
        y: 0,
        patch: { prompt: 'a cat' },
      },
      {
        kind: 'create_node',
        nodeId: 'agent-video',
        media: 'video',
        x: 450,
        y: 0,
        patch: { prompt: 'a moving cat' },
      },
      { kind: 'connect', source: 'agent-image', target: 'agent-video' },
    ]).project;
    project.name = 'Agent generation regression';
    let page = await app.firstWindow();
    mock.setVideo(Buffer.from(await page.evaluate(recordVideo)));
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).waitFor();
    await seedWorkspace(app, page, {
      ...emptyWorkspace,
      projects: [project],
      settings: {
        reqFrom: 'agent-test',
        generateUrl: mock.base + '/generate',
        imageUploadUrl: mock.base + '/upload',
        audioUploadUrl: mock.base + '/upload-audio',
      },
    });
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page
      .getByTestId('project-row')
      .filter({ hasText: 'Agent generation regression' })
      .click();
    await page.locator('[data-id="agent-image"]').click();
    await page
      .getByLabel('选择参考素材')
      .setInputFiles([{ name: 'agent-ref.png', mimeType: 'image/png', buffer: png }]);
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect(page.getByAltText('生成的图像')).toBeVisible();
    await page.locator('[data-id="agent-video"]').click();
    await page.getByRole('button', { name: '生成视频', exact: true }).click();
    await expect(page.getByLabel('生成的视频', { exact: true })).toBeVisible();
    const requests = mock.calls
      .filter((c) => c.path === '/generate')
      .map((c) => JSON.parse(c.body.toString()));
    expect(requests).toHaveLength(2);
    expect(requests[0].image_list).toEqual([mock.base + '/reference/agent-ref.png']);
    expect(requests[1].image_list).toEqual([mock.base + '/image.png']);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page
      .getByTestId('project-row')
      .filter({ hasText: 'Agent generation regression' })
      .click();
    await expect(page.getByAltText('生成的图像')).toBeVisible();
    await expect(page.getByLabel('生成的视频', { exact: true })).toBeVisible();
    const jobs = new GenerationJobs(resolve(profile, 'generation-jobs.json'));
    try {
      await jobs.initialize();
      expect(jobs.records(project.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nodeId: 'agent-image', status: 'succeeded' }),
          expect.objectContaining({ nodeId: 'agent-video', status: 'succeeded' }),
        ]),
      );
    } finally {
      jobs.dispose();
    }
    expect(mock.calls.filter((c) => c.path === '/generate')).toHaveLength(2);
  } finally {
    await app.close();
    await mock.close();
  }
});
