import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceCenter,
  type SimulationNodeDatum,
} from 'd3-force';
import type { GraphDot, WritingGraph } from '../../../../../shared/writing-graph';
export function graphSubset(graph: WritingGraph, current: string, mini: boolean) {
  if (!mini) return graph.dots;
  if (!current) return graph.dots.slice(0, 40);
  const wanted = new Set([current]);
  for (let depth = 0; depth < 2; depth++) {
    const next = new Set(wanted);
    for (const link of graph.links)
      if (link.target && (wanted.has(link.source) || wanted.has(link.target))) {
        next.add(link.source);
        next.add(link.target);
      }
    for (const group of graph.tags)
      if (group.paths.some((path) => wanted.has(path)))
        for (const path of group.paths) next.add(path);
    for (const path of next) wanted.add(path);
  }
  const connected = new Set(
    graph.links.flatMap((link) => (link.target ? [link.source, link.target] : [])),
  );
  const neighbors = graph.dots.filter((dot) => wanted.has(dot.path));
  return graph.dots.length > 2000
    ? neighbors
    : [
        ...neighbors,
        ...graph.dots
          .filter((dot) => !wanted.has(dot.path) && !connected.has(dot.path))
          .slice(0, 8),
      ];
}
/**
 * Force layout around the current document, which stays at the origin. `compact` is the
 * sidebar view: shorter links, and documents with no relation are placed on a ring outside
 * the connected neighborhood instead of drifting away and shrinking the whole view.
 */
export function layoutGraph(
  dots: GraphDot[],
  links: { source: string; target: string }[],
  current: string,
  compact = false,
) {
  const related = new Set(links.flatMap((link) => [link.source, link.target]));
  related.add(current);
  const simulated = compact ? dots.filter((dot) => related.has(dot.path)) : dots;
  const nodes: (SimulationNodeDatum & { id: string })[] = simulated.map((dot) => ({
    id: dot.path,
    ...(dot.path === current ? { fx: 0, fy: 0 } : {}),
  }));
  const simulation = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(compact ? -90 : -220))
    .force('collision', forceCollide(compact ? 30 : 46))
    .force('center', forceCenter())
    .force(
      'links',
      forceLink(links.map((link) => ({ ...link })))
        .id((node) => (node as { id: string }).id)
        .distance(compact ? 64 : 130),
    )
    .stop();
  simulation.tick(dots.length > 2000 ? 40 : 80);
  const positions = new Map(nodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
  if (compact) {
    const outside = dots.filter((dot) => !related.has(dot.path));
    const radius =
      Math.max(72, ...[...positions.values()].map((point) => Math.hypot(point.x, point.y))) + 40;
    outside.forEach((dot, index) => {
      const angle = -Math.PI / 2 + ((index + 0.5) * 2 * Math.PI) / outside.length;
      positions.set(dot.path, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  }
  return positions;
}
