import type { z } from 'zod';
import type { canvasChangeSchema } from '../../../../shared/canvas-agent';
import { mediaName, type Project } from './types';
export function canvasChanges(before: Project, after: Project) {
  const changes: z.infer<typeof canvasChangeSchema>[] = [];
  const keys = [
    'name',
    'prompt',
    'model',
    'size',
    'resolution',
    'quality',
    'duration',
    'generateAudio',
  ] as const;
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
    for (const key of keys) {
      const a = key in previous.data ? previous.data[key as keyof typeof previous.data] : undefined;
      const b = key in node.data ? node.data[key as keyof typeof node.data] : undefined;
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
