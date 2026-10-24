import { TaskService } from './helpers/task-service';
import { _electron as electron, expect as baseExpect, test, type Page } from '@playwright/test';

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  acceptsSource,
  connectSelected,
  connectionIssue,
  linkedReferences,
  relatedWorkflow,
  validateReferences,
} from '../src/renderer/src/features/creation/connections';
import {
  createMedia,
  createProject,
  projectSchema,
  type CanvasNode,
  type WorkspaceData,
} from '../src/renderer/src/features/creation/types';
import {
  promptMentions,
  rebaseLocalMentions,
  submittedPrompt,
} from '../src/renderer/src/features/creation/prompt-mentions';

const image: CanvasNode = {
  id: 'image',
  type: 'media',
  position: { x: 0, y: 0 },
  data: createMedia('image'),
};
const video: CanvasNode = {
  id: 'video',
  type: 'media',
  position: { x: 500, y: 0 },
  data: createMedia('video'),
};
const assets: CanvasNode[] = (['image', 'video', 'audio'] as const).map((kind) => ({
  id: `asset-${kind}`,
  type: 'asset',
  position: { x: 0, y: 300 },
  data: { kind, name: kind, upload: { status: 'ready', url: `https://example.invalid/${kind}` } },
}));

test('connection type matrix, duplicates, cycles and reference limits are enforced', () => {
  for (const source of [...assets, image, video]) {
    expect(acceptsSource(source, image)).toBe(source.data.kind === 'image');
    expect(acceptsSource(source, video)).toBe(true);
    expect(acceptsSource(source, assets[0]!)).toBe(false);
  }
  const project = {
    ...createProject(),
    nodes: [image, video, ...assets],
    edges: [{ id: 'a', source: 'image', target: 'video' }],
  };
  expect(connectionIssue(project, { source: 'image', target: 'image' })).toContain('自身');
  expect(connectionIssue(project, { source: 'image', target: 'video' })).toContain('已连接');
  expect(connectionIssue(project, { source: 'asset-audio', target: 'image' })).toContain(
    '仅接收图像',
  );
  const secondImage = { ...image, id: 'second-image' };
  project.nodes.push(secondImage);
  project.edges.push({ id: 'b', source: 'second-image', target: 'image' });
  expect(connectionIssue(project, { source: 'image', target: 'second-image' })).toContain('循环');
  const more = Array.from(
    { length: 9 },
    (_, index): CanvasNode => ({
      ...image,
      id: `ref-${index}`,
    }),
  );
  project.nodes.push(...more);
  project.edges = more.map((node, index) => ({
    id: `c${index}`,
    source: node.id,
    target: 'image',
  }));
  expect(connectionIssue(project, { source: 'asset-image', target: 'image' })).toContain('最多 9');
  expect(projectSchema.parse({ ...createProject(), edges: undefined }).edges).toEqual([]);
});

test('batch connections commit together and reject mixed invalid sources', () => {
  const project = { ...createProject(), nodes: [image, video, ...assets] };
  const imageResult = connectSelected(project, ['image', 'asset-image'], 'video');
  expect(imageResult.issue).toBeNull();
  expect(imageResult.project.edges.map(({ source, target }) => [source, target])).toEqual([
    ['image', 'video'],
    ['asset-image', 'video'],
  ]);
  const invalid = connectSelected(project, ['asset-image', 'asset-audio'], 'image');
  expect(invalid.issue).toContain('仅接收图像');
  expect(invalid.project).toBe(project);
  expect(project.edges).toHaveLength(0);
});

test('prompt mentions follow per-kind upload array order and reject missing positions', () => {
  const target = {
    ...video,
    data: {
      ...video.data,
      references: [
        { id: 'r-image', name: 'first.png', type: 'image' as const, blob: new Blob() },
        { id: 'r-audio', name: 'first.wav', type: 'audio' as const, blob: new Blob() },
      ],
    },
  };
  const project = {
    ...createProject(),
    nodes: [target, image, ...assets],
    edges: [
      { id: 'a', source: 'asset-video', target: 'video' },
      { id: 'b', source: 'asset-audio', target: 'video' },
      { id: 'c', source: 'image', target: 'video' },
    ],
  };
  expect(promptMentions(project, target).map(({ token }) => token)).toEqual([
    '@image_1',
    '@audio_1',
    '@video_1',
    '@audio_2',
    '@image_2',
  ]);
  expect(
    submittedPrompt('use @image_2 with @audio_1 and @video_1', { image: 2, audio: 2, video: 1 }),
  ).toBe('use <<<image_2>>> with <<<audio_1>>> and <<<video_1>>>');
  expect(() => submittedPrompt('@audio_3', { image: 2, audio: 2, video: 1 })).toThrow('不存在');
  expect(
    rebaseLocalMentions(
      '@image_1 then @image_2 and linked @image_3',
      [
        { id: 'a', name: 'a', type: 'image', blob: new Blob() },
        { id: 'b', name: 'b', type: 'image', blob: new Blob() },
      ],
      [{ id: 'b', name: 'b', type: 'image', blob: new Blob() }],
    ),
  ).toBe(' then @image_1 and linked @image_2');
});

test('marquee selection keeps the editor closed and connects selected images to one target', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
  const mock = await fixture(page);
  try {
    const first = await node(page, mock.ids.imageAsset).boundingBox();
    const last = await node(page, mock.ids.imageB).boundingBox();
    if (!first || !last) throw new Error('节点未显示');
    await page.mouse.move(first.x - 12, first.y - 12);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width + 12, last.y + last.height + 12, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole('toolbar', { name: '多选节点操作' })).toContainText(
      '已选择 3 个节点',
    );
    await expect(page.getByRole('region', { name: /编辑面板/ })).toHaveCount(0);
    await page.getByRole('button', { name: '连接到节点' }).click();
    await node(page, mock.ids.video).click({ position: { x: 30, y: 30 } });
    await expect(page.locator('.react-flow__edge')).toHaveCount(3);
    await expect(page.getByText('已连接 3 个节点')).toBeVisible();
  } finally {
    await app.close();
    await mock.close();
  }
});

test('marquee selects half-covered nodes and ignores connected edges in both directions', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
  const mock = await fixture(page);
  try {
    await connect(page, mock.ids.imageAsset, mock.ids.imageA);
    await clickBlankPane(page);
    await page.mouse.move(500, 400);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(560, 460, { steps: 6 });
    await page.mouse.up({ button: 'middle' });
    const first = await node(page, mock.ids.imageAsset).boundingBox();
    const last = await node(page, mock.ids.imageB).boundingBox();
    if (!first || !last) throw new Error('节点未显示');
    for (const reverse of [false, true]) {
      for (const fraction of [0.49, 0.5, 1]) {
        const start = { x: first.x - 12, y: first.y - 12 };
        const end = { x: last.x + last.width + 12, y: first.y + first.height * fraction };
        await page.mouse.move(reverse ? end.x : start.x, reverse ? end.y : start.y);
        await page.mouse.down();
        await page.mouse.move(reverse ? start.x : end.x, reverse ? start.y : end.y, {
          steps: 12,
        });
        await expect(
          page.locator('.react-flow__node.selected'),
          `reverse=${reverse}, fraction=${fraction}`,
        ).toHaveCount(fraction < 0.5 ? 0 : 3);
        await page.mouse.up();
        await expect(
          page.locator('.react-flow__node.selected'),
          `reverse=${reverse}, fraction=${fraction}`,
        ).toHaveCount(fraction < 0.5 ? 0 : 3);
        await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
        await expect(page.getByRole('region', { name: /编辑面板/ })).toHaveCount(0);
        await clickBlankPane(page);
      }
    }
    // Only the line between the first two nodes intersects this rectangle.
    await page.mouse.move(first.x + first.width + 20, first.y + 20);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width + 80, first.y + first.height - 20, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
  } finally {
    await app.close();
    await mock.close();
  }
});

test('mixed media selection connects to video and downloads image, audio and video', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
  const mock = await fixture(page);
  try {
    for (const [id, name] of [
      [mock.ids.imageAsset, '新图片'],
      [mock.ids.audio, '新配音'],
      [mock.ids.videoAsset, '新视频'],
    ]) {
      await node(page, id!)
        .getByRole('button', { name: /^重命名 / })
        .click();
      await node(page, id!).getByLabel('节点名称', { exact: true }).fill(name!);
      await node(page, id!).getByLabel('节点名称', { exact: true }).press('Enter');
    }
    await node(page, mock.ids.imageAsset).click({ position: { x: 30, y: 30 } });
    await node(page, mock.ids.audio).click({ position: { x: 30, y: 30 }, modifiers: ['Shift'] });
    await node(page, mock.ids.videoAsset).click({
      position: { x: 30, y: 30 },
      modifiers: ['Shift'],
    });
    await expect(page.getByRole('toolbar', { name: '多选节点操作' })).toContainText(
      '已选择 3 个节点',
    );
    await page.getByRole('button', { name: '连接到节点' }).click();
    await node(page, mock.ids.video).click({ position: { x: 30, y: 30 } });
    await expect(page.locator('.react-flow__edge')).toHaveCount(3);
    const paths = ['image.png', 'audio.wav', 'video.webm'].map((name) =>
      test.info().outputPath(name),
    );
    await app.evaluate(({ dialog }, outputPaths) => {
      let index = 0;
      const names = ['新图片.png', '新配音.wav', '新视频.webm'];
      dialog.showSaveDialog = async (
        ...args: [Electron.BaseWindow, Electron.SaveDialogOptions] | [Electron.SaveDialogOptions]
      ) => {
        const options = args.length === 2 ? args[1] : args[0];
        if (options.defaultPath !== names[index])
          throw new Error(`批量下载未使用新名称：${options.defaultPath}`);
        return { canceled: false, filePath: outputPaths[index++]! };
      };
    }, paths);
    const download = page.getByRole('button', { name: '下载可用文件 (3)' });
    await expect(download).toHaveText('3');
    await expect(download.locator('svg')).toHaveCount(1);
    await expect(download).toHaveAttribute('title', '下载 3 个可用文件');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('selection-download-count.png'),
    });
    await download.click();
    await expect(page.getByText('批量下载：已下载 3 个，跳过 0 个，失败 0 个')).toBeVisible();
    expect((await readFile(paths[0]!)).subarray(0, 8)).toEqual(png.subarray(0, 8));
    expect((await readFile(paths[1]!)).toString('ascii', 0, 4)).toBe('RIFF');
    expect((await readFile(paths[2]!)).length).toBeGreaterThan(0);
  } finally {
    await app.close();
    await mock.close();
  }
});

test('highlight includes only direct upstream and downstream connections', () => {
  const edges = [
    { id: 'a', source: 'root', target: 'parent' },
    { id: 'b', source: 'parent', target: 'selected' },
    { id: 'c', source: 'selected', target: 'child' },
    { id: 'd', source: 'child', target: 'end' },
    { id: 'sibling', source: 'parent', target: 'sibling' },
    { id: 'other', source: 'x', target: 'y' },
  ];
  const related = relatedWorkflow(edges, 'selected');
  expect([...related.links].sort()).toEqual(['b', 'c']);
  expect([...related.nodes].sort()).toEqual(['child', 'parent', 'selected']);
  expect(relatedWorkflow(edges, null).links.size).toBe(0);
});

test('generation resolves only direct upstream URLs and blocks unready or excessive inputs', () => {
  const readyImage: CanvasNode = {
    ...image,
    data: {
      ...createMedia('image'),
      result: { requestId: 'previous', url: 'https://example.invalid/generated.png' },
    },
  };
  const project = {
    ...createProject(),
    nodes: [readyImage, video, ...assets],
    edges: [
      { id: 'upstream', source: 'asset-image', target: 'image' },
      { id: 'generated', source: 'image', target: 'video' },
      { id: 'audio', source: 'asset-audio', target: 'video' },
    ],
  };
  expect(linkedReferences(project, 'video')).toEqual([
    { nodeId: 'image', kind: 'image', url: 'https://example.invalid/generated.png' },
    { nodeId: 'asset-audio', kind: 'audio', url: 'https://example.invalid/audio' },
  ]);
  expect(() => linkedReferences({ ...project, nodes: [image, video, ...assets] }, 'video')).toThrow(
    '尚无可用 URL',
  );
  expect(() =>
    validateReferences(
      createMedia('video'),
      Array.from({ length: 4 }, () => ({
        nodeId: 'a',
        kind: 'audio',
        url: 'https://example.invalid/audio',
      })),
    ),
  ).toThrow('超限');
});

const expect = baseExpect.configure({ timeout: 12_000 });
test.setTimeout(60_000);

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
async function fixture(page: Page, imageName = 'source.png') {
  const calls: Record<string, unknown>[] = [];
  const video = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d')!;
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
        ctx.fillStyle = frame++ % 2 ? '#286080' : '#802060';
        ctx.fillRect(0, 0, 16, 16);
      }, 50);
      await new Promise((resolve) => setTimeout(resolve, 700));
      clearInterval(animation);
      recorder.stop();
      const bytes = Array.from(new Uint8Array(await (await done).arrayBuffer()));
      stream.getTracks().forEach((track) => track.stop());
      return bytes;
    }),
  );
  const audio = Buffer.alloc(44 + 16000);
  audio.write('RIFF');
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24);
  audio.writeUInt32LE(16000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(audio.length - 44, 40);
  const tasks = new TaskService();
  const server = createServer(async (req, res) => {
    if (tasks.query(req, res)) return;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
      calls.push(body);
      res.setHeader('Content-Type', 'application/json');
      tasks.submit(res, {
        result: {
          status: 'success',
          content: [
            base + (body.model_name === 'seedance' ? '/result.webm' : '/image.png?generated=1'),
          ],
        },
      });
      return;
    }
    const isVideo = req.url?.includes('.webm');
    const isAudio = req.url?.includes('.wav');
    const bytes = isVideo ? video : isAudio ? audio : png;
    res.writeHead(200, {
      'Content-Type': isVideo ? 'video/webm' : isAudio ? 'audio/wav' : 'image/png',
      'Content-Length': bytes.length,
    });
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
  const ids = {
    imageAsset: randomUUID(),
    audio: randomUUID(),
    videoAsset: randomUUID(),
    imageA: randomUUID(),
    imageB: randomUUID(),
    video: randomUUID(),
    sibling: randomUUID(),
  };
  const nodes: CanvasNode[] = [
    {
      id: ids.imageAsset,
      type: 'asset',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        name: imageName,
        upload: { status: 'ready', url: base + '/image.png?asset=1' },
      },
    },
    {
      id: ids.audio,
      type: 'asset',
      position: { x: 0, y: 450 },
      data: {
        kind: 'audio',
        name: 'voice.wav',
        upload: { status: 'ready', url: base + '/voice.wav' },
      },
    },
    {
      id: ids.videoAsset,
      type: 'asset',
      position: { x: 1200, y: 450 },
      data: {
        kind: 'video',
        name: 'reference.webm',
        upload: { status: 'ready', url: base + '/reference.webm' },
      },
    },
    {
      id: ids.imageA,
      type: 'media',
      position: { x: 600, y: 0 },
      data: {
        ...createMedia('image'),
        prompt: 'image A',
        result: { requestId: randomUUID(), url: base + '/image.png?generated=A' },
      },
    },
    {
      id: ids.imageB,
      type: 'media',
      position: { x: 1200, y: 0 },
      data: {
        ...createMedia('image'),
        prompt: 'image B',
        result: { requestId: randomUUID(), url: base + '/image.png?generated=B' },
      },
    },
    {
      id: ids.video,
      type: 'media',
      position: { x: 1800, y: 0 },
      data: { ...createMedia('video'), prompt: 'make a video' },
    },
    { id: ids.sibling, type: 'media', position: { x: 600, y: 450 }, data: createMedia('image') },
  ];
  const project = {
    ...createProject(),
    name: '连线验证',
    nodes,
    viewport: { x: 40, y: 40, zoom: 0.5 },
  };
  const workspace: WorkspaceData = {
    version: 1,
    projects: [project],
    theme: 'system',
    sidebarWidth: 230,
    settings: {
      reqFrom: 'graph-test',
      generateUrl: base + '/generate',
      imageUploadUrl: '',
      audioUploadUrl: '',
    },
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
  await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
  await page.getByTestId('project-row').filter({ hasText: '连线验证' }).click();
  return {
    ids,
    base,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
function node(page: Page, id: string) {
  return page.locator(`.react-flow__node[data-id="${id}"]`);
}
async function clickBlankPane(page: Page) {
  const pane = page.locator('.react-flow__pane');
  const point = await pane.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (let y = rect.bottom - 90; y > rect.top + 20; y -= 40)
      for (let x = rect.right - 20; x > rect.left + 20; x -= 40)
        if (document.elementFromPoint(x, y) === element)
          return { x: x - rect.left, y: y - rect.top };
    throw new Error('No visible blank canvas point');
  });
  await pane.click({ position: point });
}
async function connect(page: Page, source: string, target: string) {
  const output = await node(page, source)
    .getByRole('button', { name: '输出连接', exact: true })
    .boundingBox();
  const input = await node(page, target)
    .getByRole('button', { name: '输入连接', exact: true })
    .boundingBox();
  if (!output || !input) throw new Error('Missing ports');
  await page.mouse.move(output.x + output.width / 2, output.y + output.height / 2);
  await page.mouse.down();
  await page.mouse.move(input.x + input.width / 2, input.y + input.height / 2, { steps: 12 });
  await expect(page.locator('svg.react-flow__connectionline')).toHaveCSS('z-index', '0');
  await page.mouse.up();
}

test('left-to-right ports persist edges, highlight only selected paths and keep every edge below nodes', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
  const mock = await fixture(page);
  try {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { ids } = mock;
    await expect(node(page, ids.imageAsset).getByRole('button', { name: '输入连接' })).toHaveCount(
      0,
    );
    const pairs = [
      [ids.imageAsset, ids.imageA],
      [ids.imageA, ids.imageB],
      [ids.imageB, ids.video],
      [ids.audio, ids.video],
      [ids.videoAsset, ids.video],
      [ids.imageAsset, ids.sibling],
    ];
    for (const [index, [source, target]] of pairs.entries()) {
      await connect(page, source!, target!);
      await expect(page.locator('.react-flow__edge')).toHaveCount(index + 1);
    }
    await expect(page.locator('.react-flow__edge')).toHaveCount(6);
    await clickBlankPane(page);
    await expect(page.locator('[aria-description="highlighted"]')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge .react-flow__edge-path').first()).toHaveCSS(
      'stroke',
      'rgb(163, 166, 170)',
    );
    await node(page, ids.imageA).click({ position: { x: 30, y: 30 } });
    await expect(page.locator('[aria-description="highlighted"]')).toHaveCount(2);
    await expect(node(page, ids.imageA).getByTestId('media-placeholder')).toHaveCSS(
      'outline-width',
      '3px',
    );
    for (const id of [ids.imageAsset, ids.imageB, ids.video, ids.sibling]) {
      await expect(node(page, id).getByTestId('media-placeholder')).toHaveCSS(
        'outline-style',
        'none',
      );
      await expect(node(page, id)).not.toHaveClass(/selected/);
    }
    const active = page.locator('[aria-description="highlighted"] .react-flow__edge-path').first();
    await expect(active).toHaveCSS('animation-name', 'workflow-ants');
    const layers = await page
      .locator('.react-flow__edges > svg:has(.react-flow__edge)')
      .evaluateAll((elements) =>
        elements.map((element) => Number(getComputedStyle(element).zIndex)),
      );
    expect(layers.length).toBe(6);
    expect(layers.every((z) => z === 0)).toBe(true);
    expect(
      await node(page, ids.imageA).evaluate((element) => Number(getComputedStyle(element).zIndex)),
    ).toBe(10);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('workflow-light.png'),
    });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await expect(active).toHaveCSS('animation-name', 'none');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('workflow-dark.png'),
    });
    await clickBlankPane(page);
    await connect(page, ids.audio, ids.imageA);
    await expect(page.getByTestId('canvas-import-notice')).toContainText('仅接收图像');
    await expect(page.locator('.react-flow__edge')).toHaveCount(6);
    await connect(page, ids.imageB, ids.imageA);
    await expect(page.getByTestId('canvas-import-notice')).toContainText('循环');
    await connect(page, ids.imageAsset, ids.imageA);
    await expect(page.getByTestId('canvas-import-notice')).toContainText('已连接');
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '连线验证' }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(6);
    await expect(page.locator('[aria-description="highlighted"]')).toHaveCount(0);
    await node(page, ids.imageA)
      .getByRole('button', { name: '输出连接', exact: true })
      .press('Enter');
    await node(page, ids.sibling)
      .getByRole('button', { name: '输入连接', exact: true })
      .press('Enter');
    await expect(page.locator('.react-flow__edge')).toHaveCount(7);
    const keyboardEdge = page.locator('.react-flow__edge').last();
    await keyboardEdge.focus();
    await keyboardEdge.press('Enter');
    await keyboardEdge.press('Delete');
    await expect(page.locator('.react-flow__edge')).toHaveCount(6);
    const edge = page.locator('.react-flow__edge').first();
    const edgePoint = await edge.locator('.react-flow__edge-path').evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path
        .getPointAtLength(path.getTotalLength() / 2)
        .matrixTransform(path.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
    await page.mouse.click(edgePoint.x, edgePoint.y);
    await expect(edge).toHaveClass(/selected/);
    await edge.focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('.react-flow__edge')).toHaveCount(5);
    await expect(page.locator('.react-flow__node')).toHaveCount(7);
    await node(page, ids.imageB).click({ position: { x: 30, y: 30 } });
    await page.getByRole('button', { name: '删除节点', exact: true }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(3);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await mock.close();
  }
});

test('connected asset and generated URLs enter the request without reuploading sources', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
  const mock = await fixture(page);
  try {
    const { ids, base } = mock;
    await connect(page, ids.imageAsset, ids.imageA);
    await connect(page, ids.imageB, ids.video);
    await connect(page, ids.audio, ids.video);
    await connect(page, ids.videoAsset, ids.video);
    await node(page, ids.imageA).click({ position: { x: 30, y: 30 } });
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await page.getByLabel('生成信息', { exact: true }).click();
    await expect(page.getByText('生成完成', { exact: true })).toBeVisible();
    await expect(node(page, ids.imageA).getByTestId('node-task-status')).toHaveCount(0);
    expect(mock.calls[0]).toMatchObject({ image_list: [base + '/image.png?asset=1'] });
    await page.getByRole('button', { name: '关闭编辑面板', exact: true }).click();
    await node(page, ids.video).click({ position: { x: 30, y: 30 } });
    await page.getByRole('button', { name: '生成视频', exact: true }).click();
    await page.getByLabel('生成信息', { exact: true }).click();
    await expect(page.getByText('生成完成', { exact: true })).toBeVisible();
    await expect(node(page, ids.video).getByTestId('node-task-status')).toHaveCount(0);
    expect(mock.calls[1]).toMatchObject({
      image_list: [base + '/image.png?generated=B'],
      video_list: [base + '/reference.webm'],
      audio_list: [base + '/voice.wav'],
    });
    expect(mock.calls).toHaveLength(2);
    await page.getByRole('button', { name: '关闭编辑面板', exact: true }).click();
    await connect(page, ids.sibling, ids.imageA);
    await node(page, ids.imageA).click({ position: { x: 30, y: 30 } });
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await page.getByLabel('生成信息', { exact: true }).click();
    await expect(
      page.getByTestId('editor-notice').filter({ hasText: '尚无可用 URL' }),
    ).toBeVisible();
    expect(mock.calls).toHaveLength(2);
  } finally {
    await app.close();
    await mock.close();
  }
});

test('connected references preview upstream media and keep long mention rows on one line', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
  const longName = 'Apple风格飞船驾驶舱 v2（全息影像·面部虚化·超长文件名称参考图）.png';
  const mock = await fixture(page, longName);
  try {
    const { ids } = mock;
    await node(page, ids.video).click({ position: { x: 30, y: 30 } });
    await expect(page.getByLabel('暂无参考素材')).toBeVisible();
    await expect(page.getByRole('button', { name: '添加参考素材' })).toHaveCount(0);
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    for (const source of [ids.imageA, ids.imageB, ids.imageAsset, ids.audio]) {
      await connect(page, source, ids.video);
    }
    await node(page, ids.video).click({ position: { x: 30, y: 30 } });
    const preview = page.getByTestId('reference-stack');
    await expect(preview.getByLabel('共 4 个参考素材')).toHaveText('4');
    expect(
      await preview.getByLabel('共 4 个参考素材').evaluate((badge) => {
        const rect = badge.getBoundingClientRect();
        return (
          document
            .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            ?.closest('[data-ui="badge-count"]') === badge
        );
      }),
    ).toBe(true);
    await expect(preview.getByAltText(longName)).toHaveAttribute('src', /^jarvis-media:/);
    await expect
      .poll(() =>
        preview.getByAltText(longName).evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: '添加参考素材' })).toHaveCount(0);
    await page.getByLabel('视频提示词').fill('@');
    const options = page.getByRole('listbox', { name: '引用参考素材' }).getByRole('option');
    await expect(options).toHaveCount(4);
    const longOption = options.filter({ hasText: longName });
    await expect(longOption).toHaveAttribute('title', `图片 3 · ${longName}`);
    const layout = await longOption.evaluate((row) => {
      const label = row.querySelector('[data-testid="prompt-mention-label"]')!;
      const name = row.querySelector('[data-ui="candidate-title"]')!;
      return {
        labelHeight: label.getBoundingClientRect().height,
        nameHeight: name.getBoundingClientRect().height,
        labelLineHeight: parseFloat(getComputedStyle(label).lineHeight),
        nameLineHeight: parseFloat(getComputedStyle(name).lineHeight),
        truncated: name.scrollWidth > name.clientWidth,
        ellipsis: getComputedStyle(name).textOverflow,
        fits: name.getBoundingClientRect().right <= row.getBoundingClientRect().right,
      };
    });
    expect(layout.labelHeight).toBeLessThanOrEqual(layout.labelLineHeight + 1);
    expect(layout.nameHeight).toBeLessThanOrEqual(layout.nameLineHeight + 1);
    expect(layout.truncated).toBe(true);
    expect(layout.ellipsis).toBe('ellipsis');
    expect(layout.fits).toBe(true);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('connected-mentions-light.png'),
    });
    await longOption.click();
    await expect(page.getByLabel('视频提示词')).toHaveText('@image_3 ');
    await preview.click();
    await expect(page.getByTestId('reference-item')).toHaveCount(4);
    await expect(
      page.locator('[data-testid="reference-item"] [data-testid="reference-index"]'),
    ).toHaveText(['图片 1', '图片 2', '图片 3', '音频 1']);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('connected-references-expanded-dark.png'),
    });
    await page.getByRole('button', { name: '还原面板' }).click();
    await page.getByRole('button', { name: '关闭编辑面板' }).click();
    const edge = page.locator('.react-flow__edge').last();
    await edge.focus();
    await edge.press('Enter');
    await edge.press('Delete');
    await node(page, ids.video).click({ position: { x: 30, y: 30 } });
    await expect(page.getByTestId('reference-stack').getByLabel('共 3 个参考素材')).toHaveText('3');
  } finally {
    await app.close();
    await mock.close();
  }
});
