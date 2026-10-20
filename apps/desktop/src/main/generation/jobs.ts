import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { jobSchema, httpUrl, type GenerationJob, type StartRequest } from '../../shared/generation';
import { generate, payload, ServiceError } from './protocol';

const storedJob = jobSchema.extend({ fingerprint: z.string() });
type StoredJob = z.infer<typeof storedJob>;
export class GenerationJobs {
  private jobs = new Map<string, StoredJob>();
  private writes = Promise.resolve();
  private starts = Promise.resolve();
  constructor(private readonly file: string) {}
  async initialize() {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const records = z.array(storedJob).parse(JSON.parse(raw));
    let changed = false;
    for (const record of records) {
      if (record.status === 'running') {
        record.status = 'unknown';
        record.error = '应用已重启，无法确认上次生成结果。请核实后再重新生成。';
        changed = true;
      }
      this.jobs.set(record.requestId, record);
    }
    if (changed) await this.persist();
  }
  get(requestId: string): GenerationJob | null {
    const job = this.jobs.get(requestId);
    return job ? jobSchema.parse(job) : null;
  }
  private persist() {
    const snapshot = JSON.stringify([...this.jobs.values()]);
    const write = this.writes.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + '.tmp', snapshot, { mode: 0o600 });
      await rename(this.file + '.tmp', this.file);
    });
    this.writes = write.catch(() => {});
    return write;
  }
  start(request: StartRequest): Promise<GenerationJob> {
    const pending = this.starts.then(async () => {
      httpUrl.parse(request.settings.generateUrl);
      payload(request.input, request.settings.reqFrom);
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            project: request.projectId,
            node: request.nodeId,
            input: request.input,
            settings: request.settings,
          }),
        )
        .digest('hex');
      const existing = this.jobs.get(request.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Error('同一请求标识不能用于不同内容');
        return jobSchema.parse(existing);
      }
      if (
        [...this.jobs.values()].some(
          (j) =>
            j.projectId === request.projectId &&
            j.nodeId === request.nodeId &&
            j.status === 'running',
        )
      )
        throw new Error('该节点已有进行中的生成任务');
      const job: StoredJob = {
        requestId: request.requestId,
        projectId: request.projectId,
        nodeId: request.nodeId,
        kind: request.input.kind,
        status: 'running',
        startedAt: Date.now(),
        fingerprint,
      };
      this.jobs.set(job.requestId, job);
      try {
        await this.persist();
      } catch {
        this.jobs.delete(job.requestId);
        throw new Error('无法保存任务记录，生成请求未发送');
      }
      void this.perform(request, job);
      return jobSchema.parse(job);
    });
    this.starts = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  private async perform(request: StartRequest, job: StoredJob) {
    try {
      job.resultUrl = await generate(
        request.settings.generateUrl,
        request.input,
        request.settings.reqFrom,
      );
      job.status = 'succeeded';
    } catch (error) {
      job.status = error instanceof ServiceError && error.unknown ? 'unknown' : 'failed';
      job.error = error instanceof Error ? error.message : '生成失败';
    }
    try {
      await this.persist();
    } catch {
      job.warning = '任务状态尚未写入磁盘，请保留当前窗口并记录结果。';
    }
  }
}
