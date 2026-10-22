import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { getQuota, getTask, submitTask } from '../src/main/generation/task-protocol';

test('task protocol preserves the body, follows task identity and reads quota by model family', async () => {
  let mode = 'running';
  let sent = '';
  const paths: string[] = [];
  const server = createServer(async (req, res) => {
    paths.push(req.url!);
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      for await (const chunk of req) sent += chunk.toString();
      if (mode === 'gateway') {
        res.writeHead(502);
        res.end('{}');
        return;
      }
      if (mode === 'rejected') {
        res.writeHead(402);
        res.end('{"error":"quota"}');
        return;
      }
      if (mode === 'malformed') {
        res.end('{}');
        return;
      }
      res.end(JSON.stringify({ task_id: 'task-123', status: 'pending' }));
      return;
    }
    if (req.url?.includes('model-quota')) {
      res.end(
        JSON.stringify({
          granted: true,
          items: [{ label: '可用额度', daily: { remaining: 4 }, monthly: { remaining: 20 } }],
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        task_id: mode === 'wrong-id' ? 'another-task' : 'task-123',
        status: ['wrong-id', 'running'].includes(mode) ? 'running' : mode,
        response:
          mode === 'running'
            ? null
            : {
                request_id: 'task-123',
                result: {
                  status: mode,
                  content:
                    mode === 'success'
                      ? ['https://example.invalid/video.mp4?authorization=keep']
                      : [],
                  error: { code: 'PolicyViolation', message: 'blocked' },
                },
              },
        error_code: mode === 'failed' ? 'UPSTREAM_FAILED' : null,
        error_msg: mode === 'failed' ? 'blocked' : null,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const endpoint = `http://127.0.0.1:${address.port}/api/mr/tasks`;
  try {
    const body = '{"model_name":"seedance","prompt":"<<<image_1>>>","config":{"duration":30}}';
    expect(await submitTask(endpoint, body)).toEqual({ task_id: 'task-123', status: 'pending' });
    expect(sent).toBe(body);
    expect(await getTask(endpoint, 'task-123')).toMatchObject({ status: 'running' });
    mode = 'success';
    expect(await getTask(endpoint, 'task-123')).toMatchObject({
      resultUrl: 'https://example.invalid/video.mp4?authorization=keep',
    });
    mode = 'failed';
    expect(await getTask(endpoint, 'task-123')).toMatchObject({
      status: 'failed',
      error: 'PolicyViolation：blocked',
    });
    mode = 'wrong-id';
    await expect(getTask(endpoint, 'task-123')).rejects.toThrow('任务 ID 不匹配');
    expect(await getQuota(endpoint, 'nano-banana')).toContain('今日剩余 4');
    expect(paths).toContain('/api/mr/model-quota?model_name=nano-banana');
    for (mode of ['gateway', 'malformed'])
      await expect(submitTask(endpoint, body)).rejects.toMatchObject({ unknown: true });
    mode = 'rejected';
    await expect(submitTask(endpoint, body)).rejects.toMatchObject({ unknown: false });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
