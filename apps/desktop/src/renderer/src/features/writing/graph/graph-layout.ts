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
export function layoutGraph(
  dots: GraphDot[],
  links: { source: string; target: string }[],
  current: string,
) {
  const nodes: (SimulationNodeDatum & { id: string })[] = dots.map((dot) => ({
    id: dot.path,
    ...(dot.path === current ? { fx: 0, fy: 0 } : {}),
  }));
  const simulation = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(-220))
    .force('collision', forceCollide(46))
    .force('center', forceCenter())
    .force(
      'links',
      forceLink(links.map((link) => ({ ...link })))
        .id((node) => (node as { id: string }).id)
        .distance(130),
    )
    .stop();
  simulation.tick(dots.length > 2000 ? 40 : 80);
  return new Map(nodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
}
