import { join, posix } from 'node:path';
import { z } from 'zod';
import { JsonFile, readJson } from '../agent/json-file';
import type { WritingFiles } from './files';
import type { GraphDot, WritingGraph, WritingBacklinks } from '../../shared/writing-graph';
import { markdownMetadata, resolveReference } from './graph-markdown';

const cached = z.object({
  path: z.string(),
  name: z.string(),
  fileType: z.enum(['markdown', 'text', 'image', 'pdf', 'audio', 'video', 'binary']),
  size: z.number(),
  mtime: z.number(),
  firstSeen: z.number(),
  title: z.string(),
  tags: z.array(z.string()),
  summary: z.string().max(200),
  inbound: z.number(),
  refs: z.array(
    z.object({
      kind: z.enum(['wiki', 'relative']),
      reference: z.string(),
      from: z.number(),
      to: z.number(),
      context: z.string().max(120),
    }),
  ),
});
type Cached = z.infer<typeof cached>;
const cacheSchema = z.object({ version: z.literal(1), entries: z.array(cached).max(20000) });
export class GraphIndex {
  private cache = new Map<string, Map<string, Cached>>();
  private pending = new Map<string, Promise<WritingGraph>>();
  private snapshots = new Map<string, WritingGraph>();
  constructor(
    private files: WritingFiles,
    private directory: string,
    private maximum = 20000,
  ) {}
  async graph(rootId: string): Promise<WritingGraph> {
    if (!this.files.getRoots().some((r) => r.id === rootId)) throw new Error('该目录尚未授权');
    const pending = this.pending.get(rootId);
    if (pending) return pending;
    const scan = this.scan(rootId);
    this.pending.set(rootId, scan);
    try {
      return await scan;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code)
        throw new Error('星图索引失败，请检查文件夹访问权限后重试', { cause: error });
      throw error;
    } finally {
      this.pending.delete(rootId);
    }
  }
  async backlinks(rootId: string, path: string): Promise<WritingBacklinks> {
    const graph = await this.graph(rootId);
    return {
      backlinks: graph.links.filter((link) => link.target === path),
      broken: graph.links.filter((link) => link.source === path && !link.target),
    };
  }
  async related(rootId: string, path: string, limit = 200) {
    const graph = await this.graph(rootId);
    if (!graph.dots.some((d) => d.path === path && d.fileType === 'markdown'))
      throw new Error('请选择当前文件夹的 Markdown 文档');
    return graph.dots
      .filter(
        (d) =>
          d.fileType === 'markdown' &&
          d.path !== path &&
          posix.dirname(d.path) === posix.dirname(path),
      )
      .slice(0, limit)
      .map(({ path, title, tags, summary, mtime }) => ({ path, title, tags, summary, mtime }));
  }
  private async scan(rootId: string): Promise<WritingGraph> {
    let previous = this.cache.get(rootId);
    const file = new JsonFile(join(this.directory, rootId + '.json'));
    if (!previous) {
      const raw = await readJson(file.path);
      const saved = cacheSchema.safeParse(raw);
      previous = new Map(saved.success ? saved.data.entries.map((e) => [e.path, e]) : []);
    }
    const entries = new Map<string, Cached>();
    const directories = [''];
    let visited = 0,
      truncated = false;
    while (directories.length && visited < this.maximum) {
      const directory = directories.shift()!;
      const children = await this.files.list(rootId, directory);
      for (const entry of children) {
        if (++visited > this.maximum) {
          truncated = true;
          break;
        }
        if (entry.kind === 'directory') directories.push(entry.path);
        else {
          if (entry.fileType === 'markdown' && (entry.size ?? 0) > 4 * 1024 * 1024)
            truncated = true;
          const old = previous.get(entry.path);
          if (old && old.mtime === entry.mtime && old.size === entry.size)
            entries.set(entry.path, old);
          else {
            const dot: Cached = {
              path: entry.path,
              name: entry.name,
              fileType: entry.fileType!,
              size: entry.size ?? 0,
              mtime: entry.mtime ?? 0,
              firstSeen:
                old?.firstSeen ??
                (entry.birthtime && entry.birthtime > 0 ? entry.birthtime : Date.now()),
              title: entry.name.replace(/\.(md|markdown)$/i, ''),
              tags: [],
              summary: '',
              inbound: 0,
              refs: [],
            };
            if (dot.fileType === 'markdown') {
              if (dot.size > 4 * 1024 * 1024) truncated = true;
              else {
                const document = await this.files.read(rootId, entry.path);
                const metadata = markdownMetadata(document.content);
                Object.assign(dot, metadata, { title: metadata.title.slice(0, 200) || dot.title });
              }
            }
            entries.set(entry.path, dot);
          }
        }
        if (visited % 200 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    if (directories.length) truncated = true;
    const dots: GraphDot[] = [...entries.values()].map(({ refs: _refs, ...dot }) => ({
      ...dot,
      inbound: 0,
    }));
    const byPath = new Map(dots.map((dot) => [dot.path, dot]));
    const links = [...entries.values()].flatMap((entry) =>
      entry.refs.map((ref) => ({
        ...ref,
        source: entry.path,
        target: resolveReference(dots, entry.path, ref.reference, ref.kind),
        firstSeen: entry.mtime,
      })),
    );
    for (const link of links) if (link.target) byPath.get(link.target)!.inbound++;
    const tags = new Map<string, string[]>();
    for (const dot of dots)
      for (const tag of dot.tags) tags.set(tag, [...(tags.get(tag) ?? []), dot.path]);
    const graph = {
      dots,
      links,
      tags: [...tags].map(([tag, paths]) => ({ tag, paths })),
      truncated,
      indexing: false,
    };
    if (JSON.stringify(this.snapshots.get(rootId)) !== JSON.stringify(graph))
      await file.write({ version: 1, entries: [...entries.values()] });
    this.cache.set(rootId, entries);
    this.snapshots.set(rootId, graph);
    return graph;
  }
}
