import type { CanvasSnapshot } from '../../../../shared/canvas-agent';
import { canvasSnapshotSchema } from '../../../../shared/canvas-agent';
import { mediaName, type Project } from './types';
export async function graphRevision(project: Pick<Project, 'nodes' | 'edges'>) {
  const value = JSON.stringify({ nodes: project.nodes, edges: project.edges }, (key, value) =>
    key === 'selected' || key === 'measured' || key === 'dragging' ? undefined : value,
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('');
}
export async function canvasSnapshot(
  project: Project,
  selectedIds: string[],
): Promise<CanvasSnapshot> {
  const snapshot = canvasSnapshotSchema.parse({
    projectId: project.id,
    name: project.name,
    revision: await graphRevision(project),
    selectedIds: selectedIds.filter((id) => project.nodes.some((n) => n.id === id)),
    nodes: project.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      kind: n.data.kind,
      name: n.type === 'media' ? mediaName(n.data) : n.data.name,
      x: n.position.x,
      y: n.position.y,
      ...(n.type === 'media'
        ? {
            prompt: n.data.prompt,
            model: n.data.model,
            size: n.data.size,
            resolution: n.data.resolution,
            quality: n.data.quality,
            duration: n.data.duration,
            generateAudio: n.data.generateAudio,
          }
        : {}),
      status: n.type === 'media' ? (n.data.generation?.status ?? 'idle') : n.data.upload.status,
      referenceCount: n.type === 'media' ? n.data.references.length : 0,
    })),
    edges: project.edges.map(({ source, target }) => ({ source, target })),
  });
  if (JSON.stringify(snapshot).length > 250000) throw new Error('画布内容较多，请精简后重试');
  return snapshot;
}
