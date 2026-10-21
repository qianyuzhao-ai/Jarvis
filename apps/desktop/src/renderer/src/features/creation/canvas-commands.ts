import { canvasOperationSchema, type CanvasOperation } from '../../../../shared/canvas-agent';
import { connectionIssue } from './connections';
import { createMedia, type Project, type MediaData } from './types';
import {
  gptSizes,
  imageModels,
  isNano,
  nanoRatios,
  normalizeMedia,
  videoModels,
  videoRatios,
} from './models';

function checkedData(data: MediaData) {
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
export function applyCanvasOperations(project: Project, operations: CanvasOperation[]) {
  const next = { ...project, nodes: [...project.nodes], edges: [...project.edges] };
  const affected = new Set<string>();
  for (const raw of operations) {
    const op = canvasOperationSchema.parse(raw);
    if (op.kind === 'create_node') {
      if (next.nodes.some((n) => n.id === op.nodeId)) throw new Error('节点 ID 已存在');
      const data = normalizeMedia({ ...createMedia(op.media), ...op.patch });
      if (Object.entries(op.patch).some(([key, value]) => Reflect.get(data, key) !== value))
        throw new Error('创建节点的参数组合不受支持');
      checkedData(data);
      next.nodes.push({ id: op.nodeId, type: 'media', position: { x: op.x, y: op.y }, data });
      affected.add(op.nodeId);
    } else if (op.kind === 'update_node' || op.kind === 'move_node') {
      const index = next.nodes.findIndex((n) => n.id === op.nodeId),
        node = next.nodes[index];
      if (!node) throw new Error('节点已不存在');
      if (
        node.type === 'media' &&
        ['uploading', 'submitting', 'running'].includes(node.data.generation?.status ?? '')
      )
        throw new Error('生成中的节点暂不可修改');
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
      if (
        target?.type === 'media' &&
        ['uploading', 'submitting', 'running'].includes(target.data.generation?.status ?? '')
      )
        throw new Error('生成中的节点暂不可修改连线');
      if (op.kind === 'connect') {
        const issue = connectionIssue(next, op);
        if (issue) throw new Error(issue);
        next.edges.push({ id: crypto.randomUUID(), source: op.source, target: op.target });
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
