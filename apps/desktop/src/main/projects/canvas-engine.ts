import { createHash, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  canvasOperationSchema,
  type canvasChangeSchema,
  type CanvasOperation,
} from '../../shared/canvas-agent';
import { connectionIssue, snapshotOf } from '../../shared/canvas-graph';
import { defaultMedia, isNano, mediaName, normalizeMedia } from '../../shared/canvas-media';
import {
  gptSizes,
  imageModels,
  nanoRatios,
  videoModels,
  videoRatios,
} from '../../shared/canvas-presets';
import type { StoredNode, StoredProject } from '../../shared/project';

type StoredMedia = Extract<StoredNode, { type: 'media' }>['data'];
const busy = (node: StoredNode) =>
  node.type === 'media' &&
  ['uploading', 'submitting', 'running'].includes(node.data.generation?.status ?? '');

/** Changes whenever a node or edge changes; settings such as the viewport do not count. */
export function graphRevision(project: Pick<StoredProject, 'nodes' | 'edges'>) {
  return createHash('sha256')
    .update(JSON.stringify({ nodes: project.nodes, edges: project.edges }))
    .digest('hex');
}
export function canvasSnapshotOf(project: StoredProject, selectedIds: readonly string[] = []) {
  return snapshotOf(project, selectedIds, graphRevision(project));
}

function checkedData(data: StoredMedia) {
  const models = data.kind === 'image' ? imageModels : videoModels;
  if (!models.includes(data.model)) throw new Error('节点模型不受支持');
  const ratios = data.kind === 'video' ? videoRatios : isNano(data.model) ? nanoRatios : gptSizes;
  if (!ratios.includes(data.size)) throw new Error('节点比例不受支持，请使用画布支持的预设');
  const normalized = normalizeMedia(data);
  if (
    normalized.resolution !== data.resolution ||
    normalized.duration !== data.duration ||
    normalized.quality !== data.quality
  )
    throw new Error('节点参数组合不受支持');
  if (
    data.kind === 'image' &&
    !['auto', 'low', 'medium', 'high', 'max', 'xhigh'].includes(data.quality)
  )
    throw new Error('图像质量不受支持');
  if (
    data.kind === 'video' &&
    !['480p', '720p', '1080p', ...(data.model === 'seedance-2.0' ? ['4k'] : [])].includes(
      data.resolution,
    )
  )
    throw new Error('视频分辨率不受支持');
  return data;
}

/** Applies the canvas Agent's operations to a copy; the whole batch fails on the first bad one. */
export function applyCanvasOperations(project: StoredProject, operations: CanvasOperation[]) {
  const next = { ...project, nodes: [...project.nodes], edges: [...project.edges] };
  const affected = new Set<string>();
  for (const raw of operations) {
    const op = canvasOperationSchema.parse(raw);
    if (op.kind === 'create_node') {
      if (next.nodes.some((n) => n.id === op.nodeId)) throw new Error('节点 ID 已存在');
      const data: StoredMedia = normalizeMedia({
        ...defaultMedia(op.media),
        references: [],
        ...op.patch,
      });
      if (Object.entries(op.patch).some(([key, value]) => Reflect.get(data, key) !== value))
        throw new Error('创建节点的参数组合不受支持');
      checkedData(data);
      next.nodes.push({ id: op.nodeId, type: 'media', position: { x: op.x, y: op.y }, data });
      affected.add(op.nodeId);
    } else if (op.kind === 'update_node' || op.kind === 'move_node') {
      const index = next.nodes.findIndex((n) => n.id === op.nodeId);
      const node = next.nodes[index];
      if (!node) throw new Error('节点已不存在');
      if (busy(node)) throw new Error('生成中的节点暂不可修改');
      if (op.kind === 'move_node') next.nodes[index] = { ...node, position: { x: op.x, y: op.y } };
      else if (node.type === 'asset') {
        if (Object.keys(op.patch).some((k) => k !== 'name'))
          throw new Error('素材节点只允许改名或移动');
        next.nodes[index] = {
          ...node,
          data: { ...node.data, ...(op.patch.name && { name: op.patch.name }) },
        };
      } else next.nodes[index] = { ...node, data: checkedData({ ...node.data, ...op.patch }) };
      affected.add(op.nodeId);
    } else {
      const target = next.nodes.find((n) => n.id === op.target);
      if (target && busy(target)) throw new Error('生成中的节点暂不可修改连线');
      if (op.kind === 'connect') {
        const issue = connectionIssue(next, op);
        if (issue) throw new Error(issue);
        next.edges.push({ id: randomUUID(), source: op.source, target: op.target });
      } else {
        if (!next.edges.some((e) => e.source === op.source && e.target === op.target))
          throw new Error('连线已不存在');
        next.edges = next.edges.filter((e) => e.source !== op.source || e.target !== op.target);
      }
      affected.add(op.source);
      affected.add(op.target);
    }
  }
  return { project: next, nodeIds: [...affected] };
}

/** The field-level changes shown under the reply, as before and after text. */
export function canvasChanges(before: StoredProject, after: StoredProject) {
  const changes: z.infer<typeof canvasChangeSchema>[] = [];
  const labels = {
    name: '名称',
    prompt: '提示词',
    model: '模型',
    size: '比例',
    resolution: '分辨率',
    quality: '质量',
    duration: '时长',
    generateAudio: '生成音频',
  };
  for (const node of after.nodes) {
    const previous = before.nodes.find((n) => n.id === node.id);
    const name = node.type === 'media' ? mediaName(node.data) : node.data.name;
    if (!previous) {
      changes.push({ nodeId: node.id, label: '创建节点', before: '不存在', after: name });
      continue;
    }
    for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
      const a = Reflect.get(previous.data, key);
      const b = Reflect.get(node.data, key);
      if (a !== b)
        changes.push({
          nodeId: node.id,
          label: labels[key],
          before: String(a ?? ''),
          after: String(b ?? ''),
        });
    }
    if (previous.position.x !== node.position.x || previous.position.y !== node.position.y)
      changes.push({
        nodeId: node.id,
        label: '位置',
        before: `${previous.position.x}, ${previous.position.y}`,
        after: `${node.position.x}, ${node.position.y}`,
      });
  }
  for (const [from, to, old, next] of [
    [before, after, '已连接', '未连接'],
    [after, before, '未连接', '已连接'],
  ] as const)
    for (const edge of from.edges)
      if (!to.edges.some((e) => e.source === edge.source && e.target === edge.target))
        changes.push({
          nodeId: edge.target,
          label: `连接 ${edge.source} → ${edge.target}`.slice(0, 200),
          before: old,
          after: next,
        });
  if (changes.length > 200) throw new Error('本轮修改项超过 200，请缩小操作范围');
  return changes;
}

/**
 * One Agent edit as a new project state. Edits in the same round share one entry in
 * `agentEdits`, whose `before` is the graph from before the round, so the canvas offers one undo
 * per round.
 */
export function applyAgentEdit(
  project: StoredProject,
  runId: string,
  operations: CanvasOperation[],
) {
  const result = applyCanvasOperations(project, operations);
  const previous = project.agentEdits.at(-1);
  const sameRun = previous?.runId === runId;
  const entry = {
    id: sameRun ? previous.id : randomUUID(),
    runId,
    createdAt: Date.now(),
    before: sameRun ? previous.before : { nodes: project.nodes, edges: project.edges },
    afterRevision: graphRevision(result.project),
    nodeIds: [...new Set([...(sameRun ? previous.nodeIds : []), ...result.nodeIds])],
  };
  const next: StoredProject = {
    ...result.project,
    agentEdits: [...project.agentEdits.slice(0, sameRun ? -1 : undefined), entry].slice(-20),
  };
  return {
    project: next,
    transactionId: entry.id,
    nodeIds: result.nodeIds,
    changes: canvasChanges(project, next),
  };
}
