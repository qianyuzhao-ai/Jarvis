import { linkedReferences, validateReferences } from '../../../../shared/generation-refs';
import type { Project } from './types';
import { acceptsSource, connectionIssue } from '../../../../shared/canvas-graph';

type Link = Project['edges'][number];
export type { LinkedReference } from '../../../../shared/generation-refs';
export { acceptsSource, connectionIssue };
export function connectSelected(
  project: Project,
  sourceIds: string[],
  target: string,
): {
  project: Project;
  issue: string | null;
} {
  let next = project;
  for (const source of sourceIds) {
    const issue = connectionIssue(next, { source, target });
    if (issue) return { project, issue };
    next = {
      ...next,
      edges: [...next.edges, { id: crypto.randomUUID(), source, target }],
    };
  }
  return { project: next, issue: null };
}
export function relatedWorkflow(edges: Link[], selected: string | null) {
  const nodes = new Set<string>();
  const links = new Set<string>();
  if (!selected) return { nodes, links };
  nodes.add(selected);
  for (const edge of edges) {
    if (edge.source !== selected && edge.target !== selected) continue;
    links.add(edge.id);
    nodes.add(edge.source);
    nodes.add(edge.target);
  }
  return { nodes, links };
}
export { linkedReferences, validateReferences };
