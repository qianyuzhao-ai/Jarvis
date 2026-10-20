import { useCallback, useEffect, useRef } from 'react';
import {
  generationInputSchema,
  httpUrl,
  serviceSettingsSchema,
  type GenerationInput,
  type GenerationJob,
} from '../../../../shared/generation';
import { numberReferences } from './reference-order';
import { submittedPrompt } from './prompt-mentions';
import { linkedReferences, validateReferences } from './connections';
import type { AssetData, MediaData, MediaNode, WorkspaceData } from './types';
import type { ChangeWorkspace } from './useWorkspace';

export const generationBusy = (data: MediaData | AssetData) =>
  'generation' in data &&
  ['uploading', 'submitting', 'running'].includes(data.generation?.status ?? '');
export function useGeneration(
  data: WorkspaceData,
  commit: (change: ChangeWorkspace) => Promise<void>,
  getCurrent: () => WorkspaceData,
) {
  const starting = useRef(new Set<string>());
  const patch = useCallback(
    (projectId: string, nodeId: string, change: (data: MediaData) => MediaData) =>
      commit((s) => ({
        ...s,
        projects: s.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                updatedAt: Date.now(),
                nodes: p.nodes.map((n) =>
                  n.id === nodeId && n.type === 'media' ? { ...n, data: change(n.data) } : n,
                ),
              }
            : p,
        ),
      })),
    [commit],
  );
  const finish = useCallback(
    (job: GenerationJob) =>
      patch(job.projectId, job.nodeId, (d) =>
        d.generation?.requestId !== job.requestId
          ? d
          : {
              ...d,
              generation: {
                requestId: job.requestId,
                status: job.status,
                startedAt: job.startedAt,
                error: job.error,
                warning: job.warning,
              },
              result:
                job.status === 'succeeded' && job.resultUrl
                  ? { requestId: job.requestId, url: job.resultUrl }
                  : d.result,
            },
      ),
    [patch],
  );
  const generate = useCallback(
    async (projectId: string, nodeId: string) => {
      const key = projectId + ':' + nodeId;
      if (starting.current.has(key)) return;
      const snapshot = getCurrent();
      const project = snapshot.projects.find((p) => p.id === projectId);
      const node = project?.nodes.find((n) => n.id === nodeId);
      const bridge = window.desktop?.generation;
      if (!project || !node || node.type !== 'media' || !bridge || generationBusy(node.data))
        return;
      if (
        node.data.generation?.status === 'unknown' &&
        !window.confirm('上次任务结果未知，上游可能已生成。重新生成可能产生重复费用，确定继续吗？')
      )
        return;
      starting.current.add(key);
      const requestId = crypto.randomUUID(),
        startedAt = Date.now();
      let sent = false;
      try {
        const linked = linkedReferences(project, nodeId);
        validateReferences(node.data, linked);
        const settings = serviceSettingsSchema.parse(snapshot.settings);
        httpUrl.parse(settings.generateUrl);
        const input: GenerationInput = generationInputSchema.parse({
          ...node.data,
          imageList: [],
          videoList: [],
          audioList: [],
        });
        await patch(projectId, nodeId, (d) => ({
          ...d,
          generation: { requestId, status: 'uploading', startedAt },
        }));
        for (const { item: reference } of numberReferences(node.data.references)) {
          const target =
            reference.type === 'audio' ? settings.audioUploadUrl : settings.imageUploadUrl;
          httpUrl.parse(target);
          const digest = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(target + '\n' + settings.reqFrom),
          );
          const uploadedFor = Array.from(new Uint8Array(digest), (n) =>
            n.toString(16).padStart(2, '0'),
          ).join('');
          let url = reference.uploadedFor === uploadedFor ? reference.uploadedUrl : undefined;
          if (!url) {
            const response = await bridge.upload({
              requestId: crypto.randomUUID(),
              projectId,
              nodeId,
              settings,
              file: {
                name: reference.name,
                kind: reference.type,
                mime: reference.blob.type,
                bytes: new Uint8Array(await reference.blob.arrayBuffer()),
              },
            });
            if (!response.ok) throw new Error(`${reference.name}：${response.error}`);
            url = response.value.url;
            await patch(projectId, nodeId, (d) => ({
              ...d,
              references: d.references.map((r) =>
                r.id === reference.id ? { ...r, uploadedUrl: url, uploadedFor } : r,
              ),
            }));
          }
          input[
            reference.type === 'image'
              ? 'imageList'
              : reference.type === 'video'
                ? 'videoList'
                : 'audioList'
          ].push(url);
        }
        for (const reference of linked) {
          const urls =
            input[
              reference.kind === 'image'
                ? 'imageList'
                : reference.kind === 'video'
                  ? 'videoList'
                  : 'audioList'
            ];
          if (!urls.includes(reference.url)) urls.push(reference.url);
        }
        input.prompt = submittedPrompt(input.prompt, {
          image: input.imageList.length,
          video: input.videoList.length,
          audio: input.audioList.length,
        });
        generationInputSchema.parse(input);
        await patch(projectId, nodeId, (d) => ({
          ...d,
          generation: { requestId, status: 'submitting', startedAt },
        }));
        sent = true;
        const response = await bridge.start({ requestId, projectId, nodeId, settings, input });
        if (!response.ok) {
          sent = false;
          throw new Error(response.error);
        }
        await finish(response.value);
      } catch (error) {
        if (sent) {
          try {
            const recovered = await bridge.get(requestId);
            if (recovered.ok && recovered.value) {
              await finish(recovered.value);
              return;
            }
          } catch {
            /* Keep uncertain requests distinct from rejected requests. */
          }
        }
        const errorText = error instanceof Error ? error.message : '请求失败';
        await patch(projectId, nodeId, (d) => ({
          ...d,
          generation: {
            requestId,
            startedAt,
            status: sent ? 'unknown' : 'failed',
            error: sent ? '提交结果无法确认，请核实后再重新生成。' : errorText,
          },
        })).catch(() => {});
      } finally {
        starting.current.delete(key);
      }
    },
    [getCurrent, patch, finish],
  );
  const pending = data.projects
    .flatMap((p) =>
      p.nodes
        .filter((n): n is MediaNode => n.type === 'media' && generationBusy(n.data))
        .map((n) => `${p.id}:${n.id}:${n.data.generation?.requestId}`),
    )
    .join('|');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const state = getCurrent();
      for (const p of state.projects)
        for (const n of p.nodes) {
          if (stopped) return;
          if (
            n.type !== 'media' ||
            !generationBusy(n.data) ||
            starting.current.has(p.id + ':' + n.id)
          )
            continue;
          const generation = n.data.generation!;
          try {
            const response = await window.desktop!.generation.get(generation.requestId);
            if (stopped) return;
            if (!response.ok) {
              if (generation.warning !== response.error)
                await patch(p.id, n.id, (d) => ({
                  ...d,
                  generation: { ...generation, warning: response.error },
                }));
              continue;
            }
            if (response.value) {
              if (
                response.value.status !== 'running' ||
                generation.status !== 'running' ||
                generation.warning
              )
                await finish(response.value);
            } else
              await patch(p.id, n.id, (d) => ({
                ...d,
                generation: {
                  ...generation,
                  status: generation.status === 'uploading' ? 'failed' : 'unknown',
                  error:
                    generation.status === 'uploading'
                      ? '素材上传已中断，请手动重试。'
                      : '未找到可确认的任务记录，请核实后再重新生成。',
                },
              }));
          } catch {
            if (!generation.warning)
              await patch(p.id, n.id, (d) => ({
                ...d,
                generation: {
                  ...generation,
                  warning: '暂时无法查询任务，将继续查询；不会重新提交生成。',
                },
              })).catch(() => {});
          }
        }
      if (!stopped) timer = setTimeout(() => void poll(), 1500);
    }
    if (pending) void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, getCurrent, finish, patch]);
  return generate;
}
