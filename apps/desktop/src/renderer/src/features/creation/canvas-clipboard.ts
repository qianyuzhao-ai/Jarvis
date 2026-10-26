import { copyGraph } from './copy-graph';
import type { Project } from './types';

type Snapshot = Pick<Project, 'nodes' | 'edges'> & { projectId: string };
let clipboard: { token: string; snapshot: Snapshot } | null = null;

export function captureNodes(project: Project, ids: string[]): Snapshot {
  const selected = new Set(ids);
  return structuredClone({
    projectId: project.id,
    nodes: project.nodes.filter((node) => selected.has(node.id)),
    edges: project.edges.filter(
      (edge) => selected.has(edge.target) && (selected.size === 1 || selected.has(edge.source)),
    ),
  });
}

export function storeCanvasCopy(snapshot: Snapshot): string {
  const token = `jarvis-canvas:${crypto.randomUUID()}`;
  clipboard = { token, snapshot };
  return token;
}

export function readCanvasCopy(token: string): Snapshot | null {
  return clipboard?.token === token ? clipboard.snapshot : null;
}

export function pasteNodes(project: Project, snapshot: Snapshot) {
  const selected = new Set(snapshot.nodes.map((node) => node.id));
  const edges = snapshot.edges.filter(
    (edge) =>
      selected.has(edge.source) ||
      (snapshot.projectId === project.id && project.nodes.some((node) => node.id === edge.source)),
  );
  const offset = { x: 48, y: 48 };
  while (
    snapshot.nodes.some((node) =>
      project.nodes.some(
        (existing) =>
          Math.abs(existing.position.x - node.position.x - offset.x) < 32 &&
          Math.abs(existing.position.y - node.position.y - offset.y) < 32,
      ),
    )
  ) {
    offset.x += 48;
    offset.y += 48;
  }
  const copied = copyGraph({ nodes: snapshot.nodes, edges }, offset);
  return {
    ...copied,
    ids: copied.nodes.map((node) => node.id),
    missingEdges: snapshot.edges.length - edges.length,
  };
}

export function editingText(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
  );
}
