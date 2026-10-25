import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { _electron as electron, expect as baseExpect, test } from '@playwright/test';

import {
  createProjectWorkbook,
  exportFileName,
  textParts,
} from '../src/main/generation/export-project';
import { TaskService } from './helpers/task-service';
import { GenerationJobs } from '../src/main/generation/jobs';
import { UploadHistory } from '../src/main/generation/upload-history';
import type { RequestRecord, StartRequest, UploadRequest } from '../src/shared/generation';

const expect = baseExpect.configure({ timeout: 12_000 });
test.setTimeout(60_000);

const projectId = randomUUID();
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=',
  'base64',
);
function record(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    requestId: randomUUID(),
    projectId,
    nodeId: randomUUID(),
    operation: 'generation',
    kind: 'image',
    model: 'gpt-image-2.5-flare',
    status: 'succeeded',
    startedAt: Date.now(),
    requestJson: '{"prompt":"a cat"}',
    resultUrl: 'https://example.invalid/result.png',
    ...overrides,
  };
}
async function readBook(file: string, bytes?: Uint8Array) {
  if (bytes) await writeFile(file, bytes);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  return book;
}
function column(sheet: ExcelJS.Worksheet, header: string) {
  for (let index = 1; index <= sheet.columnCount; index++)
    if (sheet.getCell(1, index).text === header) return index;
  throw new Error(`Missing column ${header}`);
}
async function service() {
  const calls: { path: string; body: string }[] = [];
  let failure = false;
  const tasks = new TaskService();
  const server = createServer(async (req, res) => {
    const path = req.url ?? '';
    if (tasks.query(req, res)) return;
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    calls.push({ path, body });
    res.setHeader('Content-Type', 'application/json');
    if (path.startsWith('/upload'))
      res.end(JSON.stringify({ files: [{ url: base + '/image.png' }] }));
    else if (failure) tasks.submit(res, { result: { status: 'error', error: 'mock failure' } });
    else
      tasks.submit(res, {
        result: { status: 'success', content: [`${base}/image.png?request=${calls.length}`] },
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    calls,
    fail: () => {
      failure = true;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

test('workbook groups models, separates outcomes, preserves long JSON and excludes other projects', async () => {
  const json = JSON.stringify({ prompt: '=1+1' + '猫🙂'.repeat(24000) });
  expect(textParts(json).join('')).toBe(json);
  const records = [
    record({ requestJson: json }),
    record({ model: 'nano-banana-2' }),
    record({ status: 'failed' }),
    record({ kind: 'video', model: 'seedance-2.5', duration: 5 }),
    record({ kind: 'video', model: 'seedance-2.5', duration: 10 }),
    record({ kind: 'video', model: 'seedance-2.5', duration: -1 }),
    record({ kind: 'video', model: 'seedance-2.5', duration: 30, status: 'failed' }),
    record({ kind: 'video', model: 'seedance-2.5', duration: 5, status: 'running' }),
    record({ kind: 'video', model: 'seedance-2.5', duration: 5, status: 'unknown' }),
    record({
      operation: 'upload',
      kind: 'audio',
      model: undefined,
      requestJson: '{"files":[{"name":"voice.wav"}]}',
    }),
    record({ model: undefined, requestJson: undefined }),
    record({ projectId: randomUUID() }),
  ];
  const file = test.info().outputPath('report.xlsx');
  const book = await readBook(
    file,
    await createProjectWorkbook({ projectId, projectName: '=1+1' }, records),
  );
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['消耗统计', '请求明细']);
  const summary = book.getWorksheet('消耗统计')!;
  const details = book.getWorksheet('请求明细')!;
  expect(summary.getCell('A2').type).toBe(ExcelJS.ValueType.String);
  expect(details.rowCount).toBe(12);
  const videoRow = summary
    .getRows(9, summary.rowCount - 9)!
    .find((row) => row.getCell(2).text === 'seedance-2.5')!;
  expect([3, 4, 5, 6, 7, 8, 9].map((c) => videoRow.getCell(c).result)).toEqual([
    6, 3, 1, 1, 1, 15, 1,
  ]);
  expect(videoRow.getCell(8).formula).toContain('SUMIFS');
  const total = summary.getRow(summary.rowCount);
  expect([3, 4, 5, 6, 7, 8, 9].map((c) => total.getCell(c).result)).toEqual([
    10, 6, 2, 1, 1, 15, 1,
  ]);
  const jsonParts: string[] = [];
  for (let c = 1; c <= details.columnCount; c++) {
    if (details.getCell(1, c).text.startsWith('请求 JSON'))
      jsonParts.push(details.getCell(2, c).text);
    expect(details.getCell(2, c).text.length).toBeLessThanOrEqual(32767);
  }
  expect(jsonParts.join('') === json, 'long Unicode JSON must round-trip byte for byte').toBe(true);
  expect(details.views[0]?.state).toBe('frozen');
  expect(details.autoFilter).toBeTruthy();
  expect(exportFileName('bad/name:*?')).not.toMatch(/[/?:*]/);
});

test('empty exports and legacy jobs keep missing history explicit', async () => {
  const empty = await readBook(
    test.info().outputPath('empty.xlsx'),
    await createProjectWorkbook({ projectId, projectName: '空项目' }, []),
  );
  expect(empty.getWorksheet('请求明细')!.rowCount).toBe(1);
  expect(empty.getWorksheet('消耗统计')!.getCell('C9').value).toBe(0);
  const file = test.info().outputPath('legacy-jobs.json');
  const legacy = record({ model: undefined, requestJson: undefined });
  await writeFile(file, JSON.stringify([{ ...legacy, fingerprint: 'legacy' }]));
  const jobs = new GenerationJobs(file, 20);
  await jobs.initialize();
  expect(jobs.records(projectId)[0]).toMatchObject({
    status: 'succeeded',
    resultUrl: legacy.resultUrl,
  });
  const book = await readBook(
    test.info().outputPath('legacy.xlsx'),
    await createProjectWorkbook({ projectId, projectName: '历史项目' }, jobs.records(projectId)),
  );
  const details = book.getWorksheet('请求明细')!;
  expect(details.getCell(2, column(details, '模型')).text).toBe('未记录');
  expect(details.getCell(2, column(details, '请求 JSON / 上传元数据')).text).toContain('旧请求');
});

test('durable request snapshots match wire bodies and survive repeated generation and restart', async () => {
  const mock = await service();
  try {
    const file = test.info().outputPath('jobs.json');
    const jobs = new GenerationJobs(file, 20);
    await jobs.initialize();
    const request: StartRequest = {
      requestId: randomUUID(),
      projectId,
      nodeId: randomUUID(),
      settings: {
        reqFrom: 'test',
        generateUrl: mock.base + '/generate',
        imageUploadUrl: mock.base + '/upload',
        audioUploadUrl: mock.base + '/upload-media',
      },
      input: {
        kind: 'video',
        model: 'seedance-2.0',
        prompt: 'first',
        size: '16:9',
        resolution: '1080p',
        quality: 'medium',
        duration: 30,
        generateAudio: true,
        imageList: [],
        videoList: [],
        audioList: [],
      },
    };
    await jobs.start(request);
    await expect.poll(() => jobs.get(request.requestId)?.status).toBe('succeeded');
    await jobs.start(request);
    expect(mock.calls).toHaveLength(1);
    mock.fail();
    const next = {
      ...request,
      requestId: randomUUID(),
      input: { ...request.input, model: 'seedance-2.5' as const, prompt: 'second' },
    };
    await jobs.start(next);
    await expect.poll(() => jobs.get(next.requestId)?.status).toBe('failed');
    const restored = new GenerationJobs(file, 20);
    await restored.initialize();
    expect(restored.records(projectId)).toHaveLength(2);
    expect(restored.records(projectId)[0]!.requestJson).toBe(mock.calls[0]!.body);
    expect(restored.records(projectId)[1]!.requestJson).toBe(mock.calls[1]!.body);
    expect(restored.records(projectId).map((r) => r.duration)).toEqual([15, 30]);
    const uploadsFile = test.info().outputPath('uploads.json');
    const uploads = new UploadHistory(uploadsFile);
    await uploads.initialize();
    const upload: UploadRequest = {
      requestId: randomUUID(),
      projectId,
      nodeId: request.nodeId,
      settings: request.settings,
      file: {
        name: 'voice.wav',
        kind: 'audio',
        mime: 'audio/wav',
        bytes: new Uint8Array([1, 2, 3]),
      },
    };
    await uploads.upload(upload);
    const recovered = new UploadHistory(uploadsFile);
    await recovered.initialize();
    expect(recovered.records(projectId)[0]).toMatchObject({
      operation: 'upload',
      kind: 'audio',
      status: 'succeeded',
      resultUrl: mock.base + '/image.png',
    });
    expect(JSON.parse(recovered.records(projectId)[0]!.requestJson!)).toEqual({
      req_from: 'test',
      files: [{ name: 'voice.wav', content_type: 'audio/wav', size_bytes: 3 }],
    });
    expect(mock.calls[2]!.path).toBe('/upload-media');
    await expect(uploads.upload(upload)).rejects.toThrow('已使用');
    expect(recovered.records(randomUUID())).toEqual([]);
  } finally {
    await mock.close();
  }
});

test('canvas Excel export keeps deleted-node history after restart and supports cancel and errors', async () => {
  const mock = await service();
  const profile = test.info().outputPath('profile');
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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await expect(page.getByRole('button', { name: '展开画布助手', exact: true })).toBeEnabled();
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
    });
    await page.getByRole('button', { name: '导出 Excel', exact: true }).click();
    await expect(page.getByTestId('canvas-export-feedback')).toContainText('已取消导出');
    await expect(page.getByTestId('canvas-export-feedback')).toHaveAttribute('data-tone', 'info');
    const emptyPath = test.info().outputPath('empty-project.xlsx');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, emptyPath);
    await page.getByRole('button', { name: '导出 Excel', exact: true }).click();
    await expect(page.getByTestId('canvas-export-feedback')).toContainText('Excel 已导出');
    expect((await readBook(emptyPath)).getWorksheet('请求明细')!.rowCount).toBe(1);
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await page.getByLabel('req_from', { exact: true }).fill('export-test');
    await page.getByLabel('生成任务地址', { exact: true }).fill(mock.base + '/generate');
    await page.getByLabel('upload 地址', { exact: true }).fill(mock.base + '/upload');
    await page.getByLabel('upload-media 地址', { exact: true }).fill(mock.base + '/upload-media');
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(page.getByTestId('form-actions')).toContainText('已保存到本机');
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('删除节点后导出');
    await page
      .getByLabel('导入画布素材')
      .setInputFiles({ name: 'asset.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('[data-node-kind="asset"][data-ready="true"]')).toHaveCount(1);
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await page.locator('.react-flow__node-media').last().click();
    await page.getByLabel('图像提示词').fill('first image');
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect(page.getByTestId('editor-notice')).toContainText('生成完成');
    await page.getByLabel('选择模型', { exact: true }).selectOption('nano-banana-2');
    await page.getByLabel('图像提示词').fill('second image');
    await page.getByRole('button', { name: '生成图像', exact: true }).click();
    await expect.poll(() => mock.calls.filter((c) => c.path === '/generate').length).toBe(2);
    await expect(page.getByTestId('editor-notice')).toContainText('生成完成');
    await page.getByRole('button', { name: '删除节点', exact: true }).click();
    await page.getByAltText('asset.png').hover();
    await page.getByRole('button', { name: '删除资源 asset.png', exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    await expect(page.getByTestId('canvas-status')).toContainText('已保存到本机');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '删除节点后导出' }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    const badPath = test.info().outputPath('missing-dir', 'report.xlsx');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, badPath);
    await page.getByRole('button', { name: '导出 Excel', exact: true }).click();
    await expect(page.getByTestId('canvas-export-feedback')).toContainText('导出失败');
    const file = test.info().outputPath('deleted-nodes.xlsx');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, file);
    await page.getByRole('button', { name: '导出 Excel', exact: true }).click();
    await expect(page.getByTestId('canvas-export-feedback')).toContainText('Excel 已导出');
    const book = await readBook(file);
    const details = book.getWorksheet('请求明细')!;
    expect(details.rowCount).toBe(4);
    const jsonColumn = column(details, '请求 JSON / 上传元数据');
    const urlColumn = column(details, '返回 URL');
    expect(details.getCell(3, jsonColumn).text).toBe(mock.calls[1]!.body);
    expect(details.getCell(4, jsonColumn).text).toBe(mock.calls[2]!.body);
    for (let row = 2; row <= 4; row++)
      expect(details.getCell(row, urlColumn).text).toContain(mock.base);
    const summary = book.getWorksheet('消耗统计')!;
    expect(summary.getCell(summary.rowCount, 4).result).toBe(2);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    await page.screenshot({ path: test.info().outputPath('export-toolbar-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: test.info().outputPath('export-toolbar-dark.png') });
    const stored = JSON.parse(
      await readFile(resolve(profile, 'generation-jobs.json'), 'utf8'),
    ) as unknown[];
    expect(stored).toHaveLength(2);
  } finally {
    await app.close();
    await mock.close();
  }
});
