import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { ModelStore } from '../src/main/agent/model-store';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';
import type { BusEvent } from '../src/main/agent/kernel/bus';
import { GenerationRunner, type FinishedTask } from '../src/main/generation/agent-runner';
import { GenerationJobs } from '../src/main/generation/jobs';
import { UploadHistory } from '../src/main/generation/upload-history';
import { ProjectStore } from '../src/main/projects/project-store';
import { WritingFiles } from '../src/main/writing/files';
import type { NavigationTarget } from '../src/shared/agent';
import type { StoredNode } from '../src/shared/project';
import { storedForm } from '../src/renderer/src/features/creation/project-records';
import { createMedia, createProject } from '../src/renderer/src/features/creation/types';
import { TaskService } from './helpers/task-service';

type Message = { role: string; content: unknown };
type Body = { messages: Message[]; tools?: { function: { name: string } }[] };

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

test('one sentence makes a project, an image and a video connected to it, then reports back', async () => {
  const mock = await platform();
  const dir = test.info().outputPath('flow');
  const bodies: Body[] = [];
  let projectId = '';
  const call = (name: string, args: unknown) => ({
    tool_calls: [
      {
        index: 0,
        id: randomUUID(),
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  const llm = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: Body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const userIndex = body.messages.findLastIndex((m) => m.role === 'user');
    const prompt = JSON.stringify(body.messages[userIndex]?.content);
    const results = body.messages
      .slice(userIndex + 1)
      .filter((m) => m.role === 'tool')
      .map((m) => String(m.content));
    const step = results.length;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const send = (delta: unknown, finish: string) =>
      res.end(chunk(delta) + chunk({}, finish) + 'data: [DONE]\n\n');
    const text = (content: string) => send({ content }, 'stop');
    const steps = (list: [string, unknown][], done: string) => {
      const next = list[step];
      return next ? send(call(...next), 'tool_calls') : text(done);
    };
    if (prompt.includes('委派任务状态通知')) return text('雪山短片做好了：图片和视频都已生成。');
    if (prompt.includes('生成任务完成通知') && prompt.includes('\\"nodeId\\":\\"img\\"'))
      return steps([['start_generation', { nodeIds: ['vid'] }]], '图片好了，视频生成中。');
    if (prompt.includes('生成任务完成通知') && prompt.includes('\\"nodeId\\":\\"vid\\"'))
      return steps(
        [
          [
            'report_result',
            {
              status: 'done',
              summary: '雪山短片的图片与视频已生成',
              artifacts: [{ kind: 'node', ref: 'vid' }],
            },
          ],
        ],
        '全部完成。',
      );
    if (prompt.includes('Jarvis 主 Agent 委派的任务'))
      return steps(
        [
          ['get_canvas_summary', {}],
          [
            'edit_canvas',
            {
              operations: [
                {
                  kind: 'create_node',
                  nodeId: 'img',
                  media: 'image',
                  x: 0,
                  y: 0,
                  patch: { prompt: '雪山日出' },
                },
                {
                  kind: 'create_node',
                  nodeId: 'vid',
                  media: 'video',
                  x: 500,
                  y: 0,
                  patch: { prompt: '镜头缓慢推进' },
                },
                { kind: 'connect', source: 'img', target: 'vid' },
              ],
            },
          ],
          ['start_generation', { nodeIds: ['img'] }],
        ],
        '已搭好节点，图片生成中。',
      );
    if (prompt.includes('做一个雪山短片')) {
      if (step === 1) projectId = JSON.parse(results[0] ?? '{}').projectId;
      return steps(
        [
          ['create_project', { name: '雪山短片' }],
          ['open_project', { projectId }],
          [
            'delegate_task',
            { target: { projectId }, task: '做一张雪山日出图，连到视频节点生成短片' },
          ],
        ],
        '已新建项目并交给画布助手。',
      );
    }
    text('好的');
  });
  await new Promise<void>((r) => llm.listen(0, '127.0.0.1', r));
  const address = llm.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const models = new ModelStore(new JsonFile(join(dir, 'agent', 'connection.json')), cipher);
  await models.initialize();
  const store = new AgentStore(new JsonFile(join(dir, 'agent', 'index.json')));
  const projects = new ProjectStore(join(dir, 'projects'));
  await projects.initialize();
  const { jobs, generation } = await runner(dir, projects);
  generation.setSettings(mock.settings);
  const service = new AgentService(models, store, join(dir, 'agent'), { projects, generation });
  const opened: NavigationTarget[] = [];
  service.onNavigate = (_owner, target) => opened.push(target);
  const cards: BusEvent[] = [];
  service.bus.subscribe((e) => cards.push(e));
  try {
    const provider = await models.saveProvider({
      kind: 'custom',
      name: 'Relay',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      api: 'openai-completions',
      apiKey: '',
      clearKey: false,
    });
    await models.setProviderModels(provider, [{ modelId: 'mock' }]);
    const home = await service.create();
    await service.send(home, randomUUID(), '做一个雪山短片', 1);
    await expect
      .poll(
        () =>
          store
            .record(home)
            .view.messages.filter((m) => m.relay?.kind === 'notice' && m.status === 'succeeded')
            .length,
        { timeout: 20000 },
      )
      .toBe(1);
    await expect.poll(() => Object.keys(service.snapshot().snapshot.runs).length).toBe(0);

    const { project } = projects.get(projectId);
    expect(project.name).toBe('雪山短片');
    expect(opened).toEqual([{ kind: 'canvas', projectId }]);
    expect(project.edges).toMatchObject([{ source: 'img', target: 'vid' }]);
    const image = media(project.nodes.find((n) => n.id === 'img'));
    const video = media(project.nodes.find((n) => n.id === 'vid'));
    expect(image).toMatchObject({
      prompt: '雪山日出',
      generation: { status: 'succeeded', agent: true },
      result: { url: `${mock.base}/image.png` },
    });
    expect(video).toMatchObject({
      prompt: '镜头缓慢推进',
      generation: { status: 'succeeded', agent: true },
      result: { url: `${mock.base}/video.webm` },
    });
    expect(mock.generated.map((g) => g.model)).toEqual([
      expect.not.stringMatching('seedance'),
      'seedance',
    ]);
    expect(mock.generated[1]?.body).toContain(`${mock.base}/image.png`);

    const sub = store.records.find((r) => r.view.projectId === projectId)?.view;
    if (!sub) throw new Error('Missing sub-agent');
    // Two rounds woke on completion notices; the first ones ended waiting, the last reported.
    expect(sub.messages.filter((m) => m.relay?.kind === 'task').map((m) => m.text)).toEqual([
      '生成完成：图像生成',
      '生成完成：视频生成',
    ]);
    const statuses = cards.filter((e) => e.sessionId === sub.id).map((e) => e.card.status);
    expect(statuses).toContain('waiting');
    expect(sub.card).toMatchObject({
      status: 'done',
      summary: '雪山短片的图片与视频已生成',
      source: 'agent',
    });
    // Only the final round told the main Agent; waiting rounds stayed quiet.
    expect(
      store
        .record(home)
        .view.messages.filter((m) => m.relay?.kind === 'notice')
        .map((m) => m.text),
    ).toEqual(['画布任务「做一张雪山日出图，连到视频节点生成短片」已完成']);
    const mainTools =
      bodies
        .find((b) => JSON.stringify(b).includes('做一个雪山短片'))
        ?.tools?.map((t) => t.function.name) ?? [];
    expect(mainTools).toEqual(
      expect.arrayContaining(['create_project', 'open_project', 'open_document']),
    );
    expect(mainTools).not.toContain('start_generation');
    const subTools =
      bodies
        .find((b) => JSON.stringify(b).includes('Jarvis 主 Agent 委派的任务'))
        ?.tools?.map((t) => t.function.name) ?? [];
    expect(subTools).toEqual(
      expect.arrayContaining(['start_generation', 'get_generation_status', 'edit_canvas']),
    );
    expect(subTools).not.toContain('create_project');
  } finally {
    await service.shutdown();
    jobs.dispose();
    await mock.close();
    llm.closeAllConnections();
    await new Promise<void>((r) => llm.close(() => r()));
  }
});

test('the main Agent reads documents across a folder and writes a new summary without overwriting', async () => {
  const dir = test.info().outputPath('writing');
  const folder = join(dir, '会议');
  await mkdir(join(folder, '十月'), { recursive: true });
  await writeFile(join(folder, '十月', '周一会议.md'), '# 周一\n决定：上线日期 11 月 3 日。');
  await writeFile(
    join(folder, '周三会议.md'),
    `# 周三\n${'背景。'.repeat(6000)}\n结论：预算增加 10%。`,
  );
  await writeFile(join(folder, '汇总.md'), '原有内容');
  const files = new WritingFiles(join(dir, 'roots.json'));
  await files.initialize();
  const root = await files.addRoot(folder);
  const bodies: Body[] = [];
  const call = (name: string, args: unknown) => ({
    tool_calls: [
      {
        index: 0,
        id: randomUUID(),
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  const llm = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: Body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const userIndex = body.messages.findLastIndex((m) => m.role === 'user');
    const results = body.messages
      .slice(userIndex + 1)
      .filter((m) => m.role === 'tool')
      .map((m) => String(m.content));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const rootId = results[0] ? JSON.parse(results[0]).folders[0].rootId : '';
    const second = results[3] ? JSON.parse(results[3]) : null;
    const list: [string, unknown][] = [
      ['list_writing_folders', {}],
      ['search_documents', { rootId, query: '会议' }],
      ['read_document', { rootId, path: '十月/周一会议.md' }],
      ['read_document', { rootId, path: '周三会议.md' }],
      ['read_document', { rootId, path: '周三会议.md', offset: second?.next ?? 0 }],
      ['create_document', { rootId, name: '汇总', content: '# 汇总' }],
      [
        'create_document',
        {
          rootId,
          directory: '十月',
          name: '会议汇总',
          content: '# 会议汇总\n- 上线日期 11 月 3 日\n- 预算增加 10%',
        },
      ],
    ];
    const next = list[results.length];
    res.end(
      (next
        ? chunk(call(...next)) + chunk({}, 'tool_calls')
        : chunk({ content: '汇总已写入 十月/会议汇总.md。' }) + chunk({}, 'stop')) +
        'data: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => llm.listen(0, '127.0.0.1', r));
  const address = llm.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const models = new ModelStore(new JsonFile(join(dir, 'agent', 'connection.json')), cipher);
  await models.initialize();
  const store = new AgentStore(new JsonFile(join(dir, 'agent', 'index.json')));
  const service = new AgentService(models, store, join(dir, 'agent'), { files });
  try {
    const provider = await models.saveProvider({
      kind: 'custom',
      name: 'Relay',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      api: 'openai-completions',
      apiKey: '',
      clearKey: false,
    });
    await models.setProviderModels(provider, [{ modelId: 'mock' }]);
    const home = await service.create();
    await service.send(home, randomUUID(), '把会议纪要汇总成一份文档', 1);
    await expect
      .poll(() => Object.keys(service.snapshot().snapshot.runs).length, { timeout: 15000 })
      .toBe(0);
    const tool = (i: number) =>
      String(bodies.at(-1)?.messages.filter((m) => m.role === 'tool')[i]?.content);
    expect(JSON.parse(tool(0))).toEqual({ folders: [{ rootId: root.id, name: '会议' }] });
    expect(tool(0)).not.toContain(folder);
    expect(
      JSON.parse(tool(1))
        .entries.map((e: { path: string }) => e.path)
        .sort(),
    ).toEqual(['十月/周一会议.md', '周三会议.md']);
    expect(tool(2)).toContain('11 月 3 日');
    const first = JSON.parse(tool(3));
    expect(first.text).toHaveLength(16000);
    expect(first.next).toBe(16000);
    expect(tool(4)).toContain('预算增加 10%');
    // An existing file is never overwritten.
    expect(tool(5)).toContain('同名文档已存在，未覆盖');
    expect(tool(5)).not.toContain(folder);
    expect(await readFile(join(folder, '汇总.md'), 'utf8')).toBe('原有内容');
    expect(await readFile(join(folder, '十月', '会议汇总.md'), 'utf8')).toBe(
      '# 会议汇总\n- 上线日期 11 月 3 日\n- 预算增加 10%',
    );
    const reply = store.record(home).view.messages.at(-1);
    expect(reply?.activities?.map((a) => a.label)).toContain('已新建文档 · 十月/会议汇总.md');
    expect(reply?.text).toContain('会议汇总');
  } finally {
    await service.shutdown();
    llm.closeAllConnections();
    await new Promise<void>((r) => llm.close(() => r()));
  }
});
