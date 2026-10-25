import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { ModelStore } from '../src/main/agent/model-store';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';
import { ProjectStore } from '../src/main/projects/project-store';
import { storedForm } from '../src/renderer/src/features/creation/project-records';
import { createProject } from '../src/renderer/src/features/creation/types';

type Message = { role: string; content: unknown };
type Body = { messages: Message[]; tools?: { function: { name: string } }[] };

test('sub-agents hand off to the main Agent, which delegates only to open targets and hears back', async () => {
  const project = createProject();
  const closed = randomUUID();
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
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: Body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const userIndex = body.messages.findLastIndex((m) => m.role === 'user');
    const prompt = JSON.stringify(body.messages[userIndex]?.content);
    const step = body.messages.slice(userIndex + 1).filter((m) => m.role === 'tool').length;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const send = (delta: unknown, finish: string) =>
      res.end(chunk(delta) + chunk({}, finish) + 'data: [DONE]\n\n');
    const script: [string, unknown[]][] = [
      ['空间子 Agent 转交', []],
      [
        '整理日程',
        [
          call('handoff_to_main', {
            request: '帮我整理下周日程',
            context: '用户在写作文档 a.md 中提出',
            expected: '一张日程表',
          }),
        ],
      ],
      [
        '去项目排分镜',
        [
          call('delegate_task', { target: { projectId: project.id }, task: '排三格分镜' }),
          call('delegate_task', { target: { projectId: closed }, task: '排分镜' }),
        ],
      ],
      [
        'Jarvis 主 Agent 委派的任务',
        [call('report_result', { status: 'done', summary: '三格分镜已排好', artifacts: [] })],
      ],
    ];
    const match = script.find(([key]) => prompt.includes(key));
    const next = match?.[1][step];
    if (next) send(next, 'tool_calls');
    else send({ content: `回复：${match?.[0] ?? '其他'}` }, 'stop');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const root = test.info().outputPath('agent');
  const models = new ModelStore(new JsonFile(join(root, 'connection.json')), cipher);
  await models.initialize();
  const store = new AgentStore(new JsonFile(join(root, 'index.json')));
  const projects = new ProjectStore(test.info().outputPath('projects'));
  await projects.initialize();
  await projects.create(storedForm({ ...project, name: '分镜项目' }).project);
  const service = new AgentService(models, store, root, { projects });
  const idle = () =>
    expect
      .poll(() => Object.keys(service.snapshot().snapshot.runs).length, { timeout: 15000 })
      .toBe(0);
  // No window has the project open; nothing may be asked of one.
  service.canvas.dispatch = () => {
    throw new Error('no window should be asked');
  };
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

    // A writing sub-agent hands a request outside its space to the main Agent; with no home
    // conversation yet, a new segment receives it.
    const scope = { rootId: 'root-1', path: 'notes/a.md' };
    const writing = await service.create(undefined, scope);
    await service.send(writing, randomUUID(), '帮我整理日程', 1, undefined, [], scope);
    await idle();
    expect(bodies[0]?.tools?.map((t) => t.function.name)).toEqual(
      expect.arrayContaining(['handoff_to_main', 'report_result']),
    );
    const reply = store.record(writing).view.messages.at(-1);
    expect(reply?.activities?.map((a) => a.label)).toContain('已交给 Jarvis 处理');
    const segment = service.currentSegment();
    if (!segment) throw new Error('Missing segment');
    const handed = store.record(segment).view.messages;
    expect(handed[0]).toMatchObject({
      role: 'user',
      text: '帮我整理下周日程',
      relay: { kind: 'handoff', sessionId: writing },
    });
    expect(handed[1]).toMatchObject({ status: 'succeeded', text: '回复：空间子 Agent 转交' });
    const handoffPrompt = JSON.stringify(
      bodies
        .find((b) => JSON.stringify(b.messages.at(-1)).includes('空间子 Agent 转交'))
        ?.messages.at(-1),
    );
    expect(handoffPrompt).toContain('不是指令');
    expect(handoffPrompt).toContain('一张日程表');

    // The main Agent delegates to a project no window shows, is told a missing one does not exist,
    // and gets a status notice once the delegated sub-agent reports.
    await service.send(segment, randomUUID(), '去项目排分镜', 1);
    await expect
      .poll(
        () =>
          store
            .record(segment)
            .view.messages.some((m) => m.relay?.kind === 'notice' && m.status === 'succeeded'),
        { timeout: 15000 },
      )
      .toBe(true);
    await idle();
    const mainTools = bodies.find((b) => JSON.stringify(b).includes('去项目排分镜'))?.tools;
    expect(mainTools?.map((t) => t.function.name)).toEqual(
      expect.arrayContaining([
        'list_agents',
        'read_result_card',
        'read_agent_transcript',
        'delegate_task',
        'message_agent',
        'stop_agent',
      ]),
    );
    expect(mainTools?.map((t) => t.function.name)).not.toContain('handoff_to_main');
    const toolResults = JSON.stringify(
      bodies
        .filter((b) => JSON.stringify(b).includes('去项目排分镜'))
        .at(-1)
        ?.messages.filter((m) => m.role === 'tool'),
    );
    expect(toolResults).toContain('这个项目不存在或已删除');
    const delegated = store.records.filter((r) => r.view.agent.origin === 'delegated');
    expect(delegated).toHaveLength(1);
    const sub = delegated[0]?.view;
    expect(sub).toMatchObject({
      projectId: project.id,
      agent: { kind: 'canvas', origin: 'delegated', parentId: segment },
      card: { status: 'done', summary: '三格分镜已排好', source: 'agent' },
    });
    expect(sub?.messages[0]).toMatchObject({
      text: '排三格分镜',
      relay: { kind: 'delegate', sessionId: segment },
    });
    const notice = store.record(segment).view.messages.find((m) => m.relay?.kind === 'notice');
    expect(notice?.text).toBe('画布任务「排三格分镜」已完成');

    // Control tools read cards and transcripts as data and refuse closed targets.
    const listed = service.control.list() as {
      agents: { agentId: string; available: boolean; card: { status: string } | null }[];
      projects: { id: string; name: string }[];
    };
    expect(listed.projects).toMatchObject([{ id: project.id, name: '分镜项目' }]);
    expect(listed.agents.find((a) => a.agentId === sub?.id)).toMatchObject({
      available: true,
      card: { status: 'done' },
    });
    // The writing document is not open in any window, so it cannot take work.
    expect(listed.agents.find((a) => a.agentId === writing)?.available).toBe(false);
    if (!sub) throw new Error('Missing sub-agent');
    expect(service.control.card(sub.id)).toMatchObject({ card: { summary: '三格分镜已排好' } });
    const page = service.control.transcript(sub.id, 0) as { text: string; next: number | null };
    expect(page.text).toContain('[Jarvis] 排三格分镜');
    expect(page.next).toBeNull();
    expect(() => service.control.card(segment)).toThrow('没有这个子 Agent');
    expect(await service.control.stop(sub.id)).toMatchObject({ stopped: false });
    await projects.remove(project.id);
    await expect(service.control.message(segment, sub.id, '再加一格')).rejects.toThrow(
      '这个项目不存在或已删除',
    );
    expect(store.record(sub.id).view.card?.status).toBe('needs_user');
  } finally {
    await service.shutdown();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
