import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  jobSchema,
  httpUrl,
  requestRecordSchema,
  TASK_POLL_INTERVAL_MS,
  type GenerationJob,
  type StartRequest,
  type RequestRecord,
} from '../../shared/generation';
import { payload, ServiceError } from './protocol';
import { getQuota, getTask, submitTask, type TaskFetch } from './task-protocol';

const storedJob = jobSchema.extend({
  fingerprint: z.string(),
  requestJson: z.string().optional(),
  endpoint: z.string().optional(),
  model: z.string().optional(),
  modelName: z.string().optional(),
  duration: z.number().optional(),
  finishedAt: z.number().optional(),
});
type StoredJob = z.infer<typeof storedJob>;
export class GenerationJobs {
  /** Called after a job is created or its status is saved. */
  onChange: (job: GenerationJob) => void = () => {};
  private jobs = new Map<string, StoredJob>();
  private writes = Promise.resolve();
  private starts = Promise.resolve();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;
  get isBusy() {
    return [...this.jobs.values()].some((job) => job.status === 'running');
  }
  constructor(
    private readonly file: string,
    private readonly pollInterval = TASK_POLL_INTERVAL_MS,
    private readonly fetchTask?: TaskFetch,
  ) {}
  async resumeAfterLogin(origin: string) {
    for (const job of this.jobs.values()) {
      if (
        job.status !== 'running' ||
        !job.authRequired ||
        !job.endpoint ||
        new URL(job.endpoint).origin !== origin
      )
        continue;
      job.authRequired = false;
      job.warning = undefined;
      await this.saveStatus(job);
      this.schedule(job);
    }
  }
  dispose() {
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
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
      if (record.status === 'running' && !(record.remoteTaskId && record.endpoint)) {
        record.status = 'unknown';
        record.error = '应用已重启，无法确认上次生成结果。请核实后再重新生成。';
        changed = true;
      }
      this.jobs.set(record.requestId, record);
    }
    if (changed) await this.persist();
    for (const job of this.jobs.values()) {
      if (job.status === 'running') this.schedule(job);
      else if (job.quotaPending) void this.refreshQuota(job);
    }
  }
  get(requestId: string): GenerationJob | null {
    const job = this.jobs.get(requestId);
    return job ? jobSchema.parse(job) : null;
  }
  records(projectId: string): RequestRecord[] {
    return [...this.jobs.values()]
      .filter((job) => job.projectId === projectId)
      .map((job) => requestRecordSchema.parse({ ...job, operation: 'generation' }));
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
      if (!request.settings.generateUrl.trim()) throw new Error('请在设置中填写生成任务地址');
      const endpoint = httpUrl.parse(request.settings.generateUrl);
      const body = payload(request.input, request.settings.reqFrom);
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
      const requestJson = JSON.stringify(body);
      const job: StoredJob = {
        requestId: request.requestId,
        projectId: request.projectId,
        nodeId: request.nodeId,
        kind: request.input.kind,
        status: 'running',
        startedAt: Date.now(),
        fingerprint,
        requestJson,
        endpoint,
        model: request.input.model,
        modelName: body.model_name,
        duration: 'duration' in body.config ? body.config.duration : undefined,
      };
      this.jobs.set(job.requestId, job);
      try {
        await this.persist();
      } catch {
        this.jobs.delete(job.requestId);
        throw new Error('无法保存任务记录，生成请求未发送');
      }
      void this.perform(job, endpoint, requestJson);
      this.onChange(jobSchema.parse(job));
      return jobSchema.parse(job);
    });
    this.starts = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  private async perform(job: StoredJob, endpoint: string, requestJson: string) {
    try {
      const submitted = await submitTask(endpoint, requestJson, this.fetchTask);
      job.remoteTaskId = submitted.task_id;
      job.remoteStatus = submitted.status;
    } catch (error) {
      job.status = error instanceof ServiceError && error.unknown ? 'unknown' : 'failed';
      job.error = error instanceof Error ? error.message : '生成失败';
      job.authRequired = error instanceof ServiceError && error.authRequired;
      job.finishedAt = Date.now();
    }
    await this.saveStatus(job);
    if (job.status === 'running') this.schedule(job);
  }
  private schedule(job: StoredJob) {
    if (this.closed || job.authRequired || this.timers.has(job.requestId)) return;
    const timer = setTimeout(() => {
      this.timers.delete(job.requestId);
      void this.poll(job);
    }, this.pollInterval);
    timer.unref();
    this.timers.set(job.requestId, timer);
  }
  private async poll(job: StoredJob) {
    try {
      if (!job.endpoint || !job.remoteTaskId) throw new Error('本地记录缺少平台任务地址或 ID');
      // Persist the remote ID before any query, including after a failed initial write.
      await this.persist();
      if (this.closed) return;
      const remote = await getTask(job.endpoint, job.remoteTaskId, this.fetchTask);
      if (this.closed) return;
      job.remoteStatus = remote.status;
      job.warning = undefined;
      if (remote.status === 'success' || remote.status === 'failed') {
        job.status = remote.status === 'success' ? 'succeeded' : 'failed';
        job.resultUrl = remote.resultUrl;
        job.error = remote.error;
        job.finishedAt = Date.now();
        job.quotaPending = true;
      }
    } catch (error) {
      job.authRequired = error instanceof ServiceError && error.authRequired;
      job.warning = job.authRequired
        ? '平台登录已失效或账号无权限，请在设置中重新登录并验证连接；任务已保留，不会重新提交。'
        : `${error instanceof Error ? error.message : '任务查询失败'}；稍后继续查询，不会重新提交。`;
    }
    await this.saveStatus(job);
    if (job.status === 'running') this.schedule(job);
    else if (job.quotaPending && !this.closed) void this.refreshQuota(job);
  }
  private async refreshQuota(job: StoredJob) {
    try {
      job.quotaNotice =
        job.endpoint && job.modelName
          ? await getQuota(job.endpoint, job.modelName, this.fetchTask)
          : '额度详情请到平台查看。';
    } catch {
      job.quotaNotice = '额度查询暂不可用，请到平台查看。';
    }
    job.quotaPending = false;
    await this.saveStatus(job);
  }
  private async saveStatus(job: StoredJob) {
    try {
      await this.persist();
    } catch {
      job.warning = '任务状态尚未写入磁盘，请保留当前窗口并记录结果。';
    }
    this.onChange(jobSchema.parse(job));
  }
}
