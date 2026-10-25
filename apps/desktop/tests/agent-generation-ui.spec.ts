import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { emptyWorkspace } from '../src/renderer/src/features/creation/types';
import { addRelayModel } from './helpers/model-setup';
import { TaskService } from './helpers/task-service';
import { readProjects, seedWorkspace } from './helpers/workspace';

type Message = { role: string; content: unknown };
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('from home, one sentence opens a new project whose image and video the Agent generates', async () => {
  test.setTimeout(90000);
  const tasks = new TaskService();
  const generated: string[] = [];
  const platform = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (tasks.query(req, res)) return;
    if (req.url === '/image.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(png);
    }
    if (req.url === '/video.webm') {
      res.writeHead(404);
      return res.end();
    }
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { model_name: string };
    generated.push(body.model_name);
    res.setHeader('Content-Type', 'application/json');
    tasks.submit(res, {
      result: {
        status: 'success',
        content: [`${base}/${body.model_name === 'seedance' ? 'video.webm' : 'image.png'}`],
      },
    });
  });
  await new Promise<void>((r) => platform.listen(0, '127.0.0.1', r));
  const platformAddress = platform.address();
  if (!platformAddress || typeof platformAddress === 'string') throw new Error('server');
  const base = `http://127.0.0.1:${platformAddress.port}`;
  let projectId = '';
  const llm = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: { messages: Message[] } = JSON.parse(Buffer.concat(chunks).toString());
    const userIndex = body.messages.findLastIndex((m) => m.role === 'user');
    const prompt = JSON.stringify(body.messages[userIndex]?.content);
    const results = body.messages
      .slice(userIndex + 1)
      .filter((m) => m.role === 'tool')
      .map((m) => String(m.content));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const steps = (list: [string, unknown][], done: string) => {
      const next = list[results.length];
      res.end(
        (next
          ? chunk({
              tool_calls: [
                {
                  index: 0,
                  id: randomUUID(),
                  type: 'function',
                  function: { name: next[0], arguments: JSON.stringify(next[1]) },
                },
              ],
            }) + chunk({}, 'tool_calls')
          : chunk({ content: done }) + chunk({}, 'stop')) + 'data: [DONE]\n\n',
      );
    };
    if (prompt.includes('委派任务状态通知')) return steps([], '雪山短片做好了。');
    if (prompt.includes('生成任务完成通知') && prompt.includes('\\"nodeId\\":\\"img\\"'))
      return steps([['start_generation', { nodeIds: ['vid'] }]], '图片好了，视频生成中。');
    if (prompt.includes('生成任务完成通知'))
      return steps(
        [['report_result', { status: 'done', summary: '图片与视频已生成', artifacts: [] }]],
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
                  patch: { prompt: '镜头推进' },
                },
                { kind: 'connect', source: 'img', target: 'vid' },
              ],
            },
          ],
          ['start_generation', { nodeIds: ['img'] }],
        ],
        '图片生成中。',
      );
    if (results.length === 1) projectId = JSON.parse(results[0] ?? '{}').projectId;
    return steps(
      [
        ['create_project', { name: '雪山短片' }],
        ['open_project', { projectId }],
        ['delegate_task', { target: { projectId }, task: '雪山日出图连到视频' }],
      ],
      '已新建项目并交给画布助手。',
    );
  });
  await new Promise<void>((r) => llm.listen(0, '127.0.0.1', r));
  const llmAddress = llm.address();
  if (!llmAddress || typeof llmAddress === 'string') throw new Error('server');
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
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await addRelayModel(page, { baseUrl: `http://127.0.0.1:${llmAddress.port}/v1`, model: 'mock' });
    await seedWorkspace(app, page, {
      ...emptyWorkspace,
      settings: {
        reqFrom: 'agent-ui',
        generateUrl: `${base}/generate`,
        imageUploadUrl: `${base}/upload`,
        audioUploadUrl: `${base}/upload`,
      },
    });
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByLabel('消息', { exact: true }).fill('做一个雪山短片');
    await page.getByRole('button', { name: '发送消息' }).click();

    // Jarvis opens the project it created; the canvas fills in as the sub-agent works.
    await expect(page.getByTestId('project-row').filter({ hasText: '雪山短片' })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('.react-flow__node-media')).toHaveCount(2, { timeout: 20000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await expect(page.getByAltText('生成的图像')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid="media-placeholder"][data-ready="true"]')).toHaveCount(
      2,
      { timeout: 20000 },
    );
    expect(generated).toHaveLength(2);
    expect(generated[1]).toBe('seedance');
    const project = (await readProjects(page)).find((p) => p.id === projectId);
    expect(
      project?.nodes.map((n) => (n.type === 'media' ? n.data.generation?.agent : undefined)),
    ).toEqual([true, true]);
    await page.screenshot({ path: test.info().outputPath('generated-canvas.png') });

    // The conversation kept its own tab when the project opened.
    await page.getByRole('tab', { name: '做一个雪山短片' }).click();
    const notice = page
      .locator('[data-testid="chat-message"][data-message-role="user"]')
      .filter({ hasText: '画布任务「雪山日出图连到视频」已完成' });
    await expect(notice).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('雪山短片做好了。')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    for (const server of [platform, llm]) {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
});
