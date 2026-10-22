import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { GenerationJobs } from '../src/main/generation/jobs';
import {
  generationInputSchema,
  TASK_POLL_INTERVAL_MS,
  type StartRequest,
} from '../src/shared/generation';

async function fixture(file: string, interval = 20) {
  const calls: { method: string; path: string; at: number; body: string }[] = [];
  let status = 'running';
  let offline = false;
  let rejectSubmission = false;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    calls.push({ method: req.method!, path: req.url!, at: Date.now(), body });
    if (req.url?.includes('model-quota')) {
      res.writeHead(503);
      res.end();
      return;
    }
    if ((rejectSubmission && req.method === 'POST') || offline) {
      res.writeHead(502);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.method === 'POST'
          ? { task_id: 'remote123', status: 'pending' }
          : {
              task_id: 'remote123',
              status,
              response:
                status === 'success'
                  ? {
                      request_id: 'remote123',
                      result: {
                        status: 'success',
                        content: ['https://example.invalid/result.png'],
                      },
                    }
                  : null,
            },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const jobs = new GenerationJobs(file, interval);
  const request: StartRequest = {
    requestId: randomUUID(),
    projectId: randomUUID(),
    nodeId: randomUUID(),
    settings: {
      reqFrom: 'test',
      generateUrl: `http://127.0.0.1:${address.port}/api/mr/tasks`,
      imageUploadUrl: '',
      audioUploadUrl: '',
    },
    input: {
      kind: 'image',
      model: 'gpt-image-2',
      prompt: '<<<image_1>>>',
      imageList: ['https://example.invalid/ref.png'],
      videoList: [],
      audioList: [],
      size: '3:2',
      quality: 'high',
      resolution: '1080p',
      duration: 5,
      generateAudio: true,
    },
  };
  return {
    jobs,
    request,
    calls,
    setStatus: (value: string) => {
      status = value;
    },
    setOffline: (value: boolean) => {
      offline = value;
    },
    reject: () => {
      rejectSubmission = true;
    },
    close: async () => {
      jobs.dispose();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test('durable task IDs resume polling after restart and query failures never resubmit', async () => {
  const file = test.info().outputPath('jobs.json');
  const f = await fixture(file);
  let recovered: GenerationJobs | undefined;
  try {
    await f.jobs.initialize();
    await Promise.all([f.jobs.start(f.request), f.jobs.start(f.request)]);
    await expect.poll(() => f.jobs.get(f.request.requestId)?.remoteTaskId).toBe('remote123');
    await expect.poll(() => f.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(0);
    expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    const wire = f.calls.find((c) => c.method === 'POST')!.body;
    expect(JSON.parse(wire).prompt).toBe('<<<image_1>>>');
    await expect(f.jobs.start({ ...f.request, requestId: randomUUID() })).rejects.toThrow(
      '已有进行中',
    );
    f.jobs.dispose();
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved[0]).toMatchObject({
      remoteTaskId: 'remote123',
      requestJson: wire,
      endpoint: f.request.settings.generateUrl,
    });
    const recoveryFile = test.info().outputPath('recovered.json');
    await writeFile(recoveryFile, JSON.stringify(saved));
    f.setOffline(true);
    recovered = new GenerationJobs(recoveryFile, 20);
    await recovered.initialize();
    await expect.poll(() => recovered!.get(f.request.requestId)?.warning).toContain('不会重新提交');
    expect(recovered.get(f.request.requestId)?.status).toBe('running');
    f.setOffline(false);
    f.setStatus('success');
    await expect.poll(() => recovered!.get(f.request.requestId)?.status).toBe('succeeded');
    await expect.poll(() => recovered!.get(f.request.requestId)?.quotaPending).toBe(false);
    expect(recovered.get(f.request.requestId)).toMatchObject({
      resultUrl: 'https://example.invalid/result.png',
      quotaNotice: '额度查询暂不可用，请到平台查看。',
    });
    expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(f.calls.filter((c) => c.path.includes('model-quota'))).toHaveLength(1);
  } finally {
    recovered?.dispose();
    await f.close();
  }
});

test('uncertain submissions and legacy unfinished records remain unknown without auto-resend', async () => {
  const file = test.info().outputPath('jobs.json');
  const f = await fixture(file);
  let recovered: GenerationJobs | undefined;
  try {
    f.reject();
    await f.jobs.start(f.request);
    await expect.poll(() => f.jobs.get(f.request.requestId)?.status).toBe('unknown');
    await f.jobs.start(f.request);
    expect(f.calls).toHaveLength(1);
    const legacy = { ...f.jobs.get(f.request.requestId), status: 'running', fingerprint: 'legacy' };
    const oldFile = test.info().outputPath('legacy.json');
    await writeFile(oldFile, JSON.stringify([legacy]));
    recovered = new GenerationJobs(oldFile, 20);
    await recovered.initialize();
    expect(recovered.get(f.request.requestId)?.status).toBe('unknown');
    expect(f.calls).toHaveLength(1);
  } finally {
    recovered?.dispose();
    await f.close();
  }
});

test('production interval waits five seconds before querying the accepted task', async () => {
  const f = await fixture(test.info().outputPath('jobs.json'), TASK_POLL_INTERVAL_MS);
  try {
    f.setStatus('success');
    await f.jobs.start(f.request);
    await expect
      .poll(() => f.jobs.get(f.request.requestId)?.status, { timeout: 10_000 })
      .toBe('succeeded');
    const post = f.calls.find((c) => c.method === 'POST')!;
    const get = f.calls.find((c) => c.method === 'GET')!;
    expect(TASK_POLL_INTERVAL_MS).toBe(5000);
    expect(get.at - post.at).toBeGreaterThanOrEqual(4900);
  } finally {
    await f.close();
  }
});

test('every supported image and video model uses tasks while keeping its payload and quota family', async () => {
  for (const model of generationInputSchema.shape.model.options) {
    const f = await fixture(test.info().outputPath(`${model}.json`));
    try {
      const video = model.startsWith('seedance');
      const nano = model.startsWith('nano-');
      f.request.input = {
        ...f.request.input,
        model,
        kind: video ? 'video' : 'image',
        size: nano || video ? '16:9' : '3:2',
        resolution: nano ? '2K' : '1080p',
      };
      f.setStatus('success');
      await f.jobs.start(f.request);
      await expect.poll(() => f.jobs.get(f.request.requestId)?.quotaPending).toBe(false);
      expect(f.jobs.get(f.request.requestId)?.status).toBe('succeeded');
      const post = f.calls.filter((call) => call.method === 'POST');
      expect(post).toHaveLength(1);
      expect(post[0]?.path).toBe('/api/mr/tasks');
      const body = JSON.parse(post[0]!.body);
      expect(body).toMatchObject({
        model_name: video ? 'seedance' : nano ? 'nano-banana' : model,
        prompt: '<<<image_1>>>',
        image_list: f.request.input.imageList,
      });
      expect(
        f.calls.filter((call) => call.path.includes('model-quota')).map((call) => call.path),
      ).toEqual([`/api/mr/model-quota?model_name=${body.model_name}`]);
    } finally {
      await f.close();
    }
  }
});
