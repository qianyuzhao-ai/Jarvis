import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { mediaName } from '../../shared/canvas-media';
import {
  generationInputSchema,
  httpUrl,
  serviceSettingsSchema,
  type GenerationInput,
  type GenerationJob,
  type ServiceSettings,
  type UploadRequest,
} from '../../shared/generation';
import {
  linkedReferences,
  numberReferences,
  submittedPrompt,
  validateReferences,
} from '../../shared/generation-refs';
import type { StoredNode } from '../../shared/project';
import { diffProjects } from '../../shared/project-diff';
import { JsonFile, readJson } from '../agent/json-file';
import { ProjectConflictError, type ProjectStore } from '../projects/project-store';
import type { GenerationJobs } from './jobs';

type Media = Extract<StoredNode, { type: 'media' }>['data'];
const taskSchema = z
  .object({
    requestId: z.string().uuid(),
    sessionId: z.string().uuid(),
    projectId: z.string().uuid(),
    nodeId: z.string().min(1).max(100),
    delivered: z.boolean(),
  })
  .strict();
const fileSchema = z.object({ version: z.literal(1), tasks: z.array(taskSchema) }).strict();
export type GenerationTask = z.infer<typeof taskSchema>;
export type FinishedTask = GenerationTask & {
  status: GenerationJob['status'];
  error?: string;
  nodeName: string;
};
const busy = (data: Media) =>
  ['uploading', 'submitting', 'running'].includes(data.generation?.status ?? '');
const listFor = (kind: 'image' | 'video' | 'audio') =>
  kind === 'image' ? 'imageList' : kind === 'video' ? 'videoList' : 'audioList';

/**
 * Generation started by the canvas Agent, run entirely in the main process: reference files are
 * uploaded from the project store, the job goes through GenerationJobs, and every status change is
 * written into the node. When a job ends, `onFinished` names the conversation to wake. Tasks are
 * kept in a file, so a job that finishes while the app is closed is still written and delivered.
 * Generation started from the canvas UI stays with the window.
 */
export class GenerationRunner {
  onFinished: (task: FinishedTask) => void = () => {};
  private settings: ServiceSettings | null = null;
  private tasks = new Map<string, GenerationTask>();
  private file: JsonFile;
  constructor(
    private jobs: GenerationJobs,
    private uploads: { upload(request: UploadRequest): Promise<{ url: string }> },
    private projects: ProjectStore,
    file: string,
  ) {
    this.file = new JsonFile(file);
    jobs.onChange = (job) => void this.update(job);
  }
  async initialize() {
    const parsed = fileSchema.safeParse(await readJson(this.file.path).catch(() => null));
    if (parsed.success) for (const task of parsed.data.tasks) this.tasks.set(task.requestId, task);
    for (const task of [...this.tasks.values()]) {
      const job = this.jobs.get(task.requestId);
      if (job) await this.update(job);
      else
        await this.finish(task, { status: 'unknown', error: '未找到任务记录，无法确认生成结果' });
    }
  }
  /** The service settings of the window; generation is refused until a window has sent them. */
  setSettings(value: unknown) {
    const parsed = serviceSettingsSchema.safeParse(value);
    this.settings = parsed.success ? parsed.data : null;
  }
  /** Jobs of a conversation that have not finished yet. */
  pending(sessionId: string) {
    return [...this.tasks.values()].filter((t) => t.sessionId === sessionId && !t.delivered).length;
  }
  async start(sessionId: string, projectId: string, nodeId: string) {
    const settings = this.settings;
    if (!settings)
      throw new Error('生成服务设置尚未就绪，请在设置的“内网地址”中填写 req_from 与生成地址');
    if (!httpUrl.safeParse(settings.generateUrl).success)
      throw new Error('请在设置中填写生成任务地址');
    const { project } = this.projects.get(projectId);
    const node = project.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'media') throw new Error('节点不存在或不是图像/视频生成节点');
    if (busy(node.data)) throw new Error('这个节点正在生成');
    if (node.data.generation?.status === 'unknown')
      throw new Error(
        '上次生成结果未知，上游可能已生成；为避免重复费用，请用户确认后在画布中手动重新生成',
      );
    if (!node.data.prompt.trim()) throw new Error('节点提示词为空，请先填写提示词');
    const linked = linkedReferences(project, nodeId);
    validateReferences(node.data, linked);
    const input: GenerationInput = generationInputSchema.parse({
      ...node.data,
      imageList: [],
      videoList: [],
      audioList: [],
    });
    const requestId = randomUUID();
    const startedAt = Date.now();
    const stamp = (status: 'uploading' | 'submitting') => (d: Media) => ({
      ...d,
      generation: { requestId, status, startedAt, agent: true },
    });
    await this.patch(projectId, nodeId, stamp('uploading'));
    this.tasks.set(requestId, { requestId, sessionId, projectId, nodeId, delivered: false });
    await this.save();
    let sent = false;
    try {
      for (const { item: ref } of numberReferences(node.data.references)) {
        const target = ref.type === 'audio' ? settings.audioUploadUrl : settings.imageUploadUrl;
        httpUrl.parse(target);
        const uploadedFor = createHash('sha256')
          .update(target + '\n' + settings.reqFrom)
          .digest('hex');
        let url = ref.uploadedFor === uploadedFor ? ref.uploadedUrl : undefined;
        if (!url) {
          const bytes = new Uint8Array(await this.projects.readBlob(projectId, ref.id));
          const uploaded = await this.uploads.upload({
            requestId: randomUUID(),
            projectId,
            nodeId,
            settings,
            file: { name: ref.name, kind: ref.type, mime: ref.mimeType, bytes },
          });
          const done = uploaded.url;
          url = done;
          await this.patch(projectId, nodeId, (d) => ({
            ...d,
            references: d.references.map((r) =>
              r.id === ref.id ? { ...r, uploadedUrl: done, uploadedFor } : r,
            ),
          }));
        }
        input[listFor(ref.type)].push(url);
      }
      for (const reference of linked) {
        const urls = input[listFor(reference.kind)];
        if (!urls.includes(reference.url)) urls.push(reference.url);
      }
      input.prompt = submittedPrompt(input.prompt, {
        image: input.imageList.length,
        video: input.videoList.length,
        audio: input.audioList.length,
      });
      generationInputSchema.parse(input);
      await this.patch(projectId, nodeId, stamp('submitting'));
      sent = true;
      await this.update(await this.jobs.start({ requestId, projectId, nodeId, settings, input }));
      return { requestId };
    } catch (error) {
      const recovered = sent ? this.jobs.get(requestId) : null;
      if (recovered) {
        await this.update(recovered);
        return { requestId };
      }
      const message = error instanceof Error ? error.message : '生成请求失败';
      await this.patch(projectId, nodeId, (d) =>
        d.generation?.requestId === requestId
          ? {
              ...d,
              generation: {
                requestId,
                startedAt,
                agent: true,
                status: sent ? 'unknown' : 'failed',
                error: sent ? '提交结果无法确认，请核实后再重新生成。' : message,
              },
            }
          : null,
      ).catch(() => {});
      this.tasks.delete(requestId);
      await this.save();
      throw error instanceof Error ? error : new Error(message);
    }
  }
  /** Writes a job's status into its node and, once it ends, wakes its conversation once. */
  private async update(job: GenerationJob) {
    const task = this.tasks.get(job.requestId);
    if (!task) return;
    await this.patch(task.projectId, task.nodeId, (d) =>
      d.generation?.requestId !== job.requestId
        ? null
        : {
            ...d,
            generation: {
              requestId: job.requestId,
              status: job.status,
              startedAt: job.startedAt,
              error: job.error,
              warning: job.warning,
              remoteTaskId: job.remoteTaskId,
              remoteStatus: job.remoteStatus,
              quotaPending: job.quotaPending,
              authRequired: job.authRequired,
              agent: true,
            },
            result:
              job.status === 'succeeded' && job.resultUrl
                ? { requestId: job.requestId, url: job.resultUrl }
                : d.result,
          },
    ).catch(() => {});
    if (job.status === 'running') return;
    await this.finish(task, job);
    // Keep tracking until the quota note arrives, then forget the task.
    if (!job.quotaPending) {
      this.tasks.delete(job.requestId);
      await this.save();
    }
  }
  private async finish(task: GenerationTask, job: Pick<GenerationJob, 'status' | 'error'>) {
    if (task.delivered) return;
    task.delivered = true;
    await this.save();
    let nodeName = task.nodeId;
    try {
      const node = this.projects
        .get(task.projectId)
        .project.nodes.find((n) => n.id === task.nodeId);
      if (node) nodeName = node.type === 'media' ? mediaName(node.data) : node.data.name;
    } catch {
      /* The project was removed; the conversation is still told. */
    }
    this.onFinished({ ...task, status: job.status, error: job.error, nodeName });
  }
  /** Changes one node on the latest version; null leaves it as it is. */
  private async patch(projectId: string, nodeId: string, change: (data: Media) => Media | null) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { version, project } = this.projects.get(projectId);
      const node = project.nodes.find((n) => n.id === nodeId);
      if (!node || node.type !== 'media') return;
      const data = change(node.data);
      if (!data) return;
      const next = {
        ...project,
        nodes: project.nodes.map((n) => (n === node ? { ...node, data } : n)),
      };
      const ops = diffProjects(project, next);
      if (!ops.length) return;
      try {
        await this.projects.applyOps(projectId, version, ops, { source: 'generation' });
        return;
      } catch (error) {
        if (!(error instanceof ProjectConflictError)) throw error;
      }
    }
    throw new Error('项目正在被频繁修改，生成状态暂未写入');
  }
  private save() {
    return this.file.write({ version: 1, tasks: [...this.tasks.values()] }).catch(() => {});
  }
}
