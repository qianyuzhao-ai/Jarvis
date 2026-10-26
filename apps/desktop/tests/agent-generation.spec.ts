import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { GenerationRunner, type FinishedTask } from '../src/main/generation/agent-runner';
import { GenerationJobs } from '../src/main/generation/jobs';
import { UploadHistory } from '../src/main/generation/upload-history';
import { ProjectStore } from '../src/main/projects/project-store';
import type { StoredNode } from '../src/shared/project';
import { storedForm } from '../src/renderer/src/features/creation/project-records';
import { createMedia, createProject } from '../src/renderer/src/features/creation/types';
import { TaskService } from './helpers/task-service';

/** A generation platform: uploads, task submission and task queries, results after `release`. */
async function platform() {
  const tasks = new TaskService();
  const generated: { model: string; body: string }[] = [];
  const uploads: string[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    if (tasks.query(req, res)) return;
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.startsWith('/upload')) {
      const name = body.match(/filename="([^"]+)"/)?.[1] ?? 'file';
      uploads.push(decodeURIComponent(name));
      res.end(JSON.stringify({ files: [{ url: `${base}/reference/${name}`, status: 'new' }] }));
      return;
    }
    const parsed = JSON.parse(body) as { model_name: string };
    generated.push({ model: parsed.model_name, body });
    tasks.submit(res, {
      result: {
        status: 'success',
        content: [`${base}/${parsed.model_name === 'seedance' ? 'video.webm' : 'image.png'}`],
      },
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    tasks,
    generated,
    uploads,
    settings: {
      reqFrom: 'agent-test',
      generateUrl: `${base}/generate`,
      imageUploadUrl: `${base}/upload`,
      audioUploadUrl: `${base}/upload`,
    },
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
async function runner(dir: string, projects: ProjectStore) {
  const jobs = new GenerationJobs(join(dir, 'jobs.json'), 20);
  await jobs.initialize();
  const uploads = new UploadHistory(join(dir, 'uploads.json'));
  await uploads.initialize();
  const generation = new GenerationRunner(
    jobs,
    uploads,
    projects,
    join(dir, 'agent-generation.json'),
  );
  await generation.initialize();
  return { jobs, generation };
}
const media = (node: StoredNode | undefined) => (node?.type === 'media' ? node.data : undefined);

test('the main-process runner uploads references, generates, writes results and reports once', async () => {
  const mock = await platform();
  const dir = test.info().outputPath('runner');
  const projects = new ProjectStore(join(dir, 'projects'));
  await projects.initialize();
  const p = createProject();
  const refId = randomUUID();
  p.nodes = [
    {
      id: 'img',
      type: 'media',
      position: { x: 0, y: 0 },
      data: {
        ...createMedia('image'),
        prompt: '参考 @image_1 画雪山',
        references: [
          {
            id: refId,
            name: 'ref.png',
            type: 'image',
            blob: new Blob(['png'], { type: 'image/png' }),
          },
        ],
      },
    },
    {
      id: 'vid',
      type: 'media',
      position: { x: 500, y: 0 },
      data: { ...createMedia('video'), prompt: '推进' },
    },
  ];
  p.edges = [{ id: 'e', source: 'img', target: 'vid' }];
  const { project, blobs } = storedForm(p);
  await projects.create(
    project,
    new Map([[refId, new Uint8Array(await (blobs.get(refId) as Blob).arrayBuffer())]]),
  );
  const { jobs, generation } = await runner(dir, projects);
  const finished: FinishedTask[] = [];
  generation.onFinished = (task) => finished.push(task);
  const session = randomUUID();
  try {
    await expect(generation.start(session, p.id, 'img')).rejects.toThrow('生成服务设置尚未就绪');
    generation.setSettings(mock.settings);
    // The video needs the image's result first.
    await expect(generation.start(session, p.id, 'vid')).rejects.toThrow('尚无可用 URL');
    const { requestId } = await generation.start(session, p.id, 'img');
    expect(generation.pending(session)).toBe(1);
    await expect(generation.start(session, p.id, 'img')).rejects.toThrow('正在生成');
    await expect.poll(() => finished.length).toBe(1);
    expect(finished[0]).toMatchObject({
      sessionId: session,
      nodeId: 'img',
      status: 'succeeded',
      nodeName: '图像生成',
    });
    expect(generation.pending(session)).toBe(0);
    const image = media(projects.get(p.id).project.nodes.find((n) => n.id === 'img'));
    expect(image?.generation).toMatchObject({ requestId, status: 'succeeded', agent: true });
    expect(image?.result?.url).toBe(`${mock.base}/image.png`);
    expect(image?.references[0]?.uploadedUrl).toBe(`${mock.base}/reference/ref.png`);
    expect(mock.uploads).toEqual(['ref.png']);
    expect(mock.generated[0]?.body).toContain('<<<image_1>>>');

    // Now the video can use the image, passed by its URL.
    await generation.start(session, p.id, 'vid');
    await expect.poll(() => finished.length).toBe(2);
    expect(mock.generated[1]?.body).toContain(`${mock.base}/image.png`);
    expect(mock.uploads).toHaveLength(1);
    await expect
      .poll(
        async () => JSON.parse(await readFile(join(dir, 'agent-generation.json'), 'utf8')).tasks,
      )
      .toEqual([]);

    // A node whose last result is unknown is left for the user to decide.
    await projects.applyOps(p.id, projects.get(p.id).version, [
      {
        kind: 'update_node',
        nodeId: 'img',
        data: { generation: { requestId: randomUUID(), status: 'unknown', startedAt: 1 } },
        unset: [],
      },
    ]);
    await expect(generation.start(session, p.id, 'img')).rejects.toThrow('结果未知');
  } finally {
    jobs.dispose();
    await mock.close();
  }
});
