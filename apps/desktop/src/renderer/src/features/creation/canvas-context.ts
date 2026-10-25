import type { CanvasSnapshot } from '../../../../shared/canvas-agent';
import { snapshotOf } from '../../../../shared/canvas-graph';
import type { Project } from './types';
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
  return snapshotOf(project, selectedIds, await graphRevision(project));
}
