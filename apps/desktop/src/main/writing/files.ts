import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { WritingEntry, WritingFile, WritingRoot } from '../../shared/writing';

const registrySchema = z.array(
  z.object({ id: z.string(), name: z.string(), directory: z.string() }),
);
const limit = 4 * 1024 * 1024;
const revision = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const normalize = (value: string) => value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
export class WritingConflict extends Error {}

export class WritingFiles {
  private roots: WritingRoot[] = [];
  private queues = new Map<string, Promise<unknown>>();
  constructor(private readonly registry: string) {}

  async initialize() {
    try {
      this.roots = registrySchema.parse(JSON.parse(await readFile(this.registry, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  getRoots() {
    return this.roots.map((root) => ({ ...root }));
  }
  private serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(task);
    this.queues.set(key, next);
    void next
      .finally(() => {
        if (this.queues.get(key) === next) this.queues.delete(key);
      })
      .catch(() => undefined);
    return next;
  }
  async addRoot(directory: string) {
    return this.serial('registry', async () => {
      const canonical = await realpath(directory);
      if (!(await lstat(canonical)).isDirectory()) throw new Error('请选择文件夹');
      await access(canonical);
      const root = {
        id: createHash('sha256').update(canonical).digest('hex').slice(0, 24),
        name: basename(canonical) || canonical,
        directory: canonical,
      };
      const next = [root, ...this.roots.filter((r) => r.id !== root.id)].slice(0, 20);
      await mkdir(dirname(this.registry), { recursive: true });
      await writeFile(this.registry + '.tmp', JSON.stringify(next), { mode: 0o600 });
      await rename(this.registry + '.tmp', this.registry);
      this.roots = next;
      return root;
    });
  }
  private async location(rootId: string, path: string) {
    const root = this.roots.find((r) => r.id === rootId);
    if (!root) throw new Error('该目录尚未授权，请重新打开文件夹');
    if (
      path.includes('\0') ||
      path.includes('\\') ||
      isAbsolute(path) ||
      path.split('/').includes('..')
    )
      throw new Error('文件路径不合法');
    const base = await realpath(root.directory);
    if (base !== root.directory) throw new Error('目录位置已变化，请重新选择');
    const target = resolve(base, path);
    const rel = relative(base, target);
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
      throw new Error('文件不在当前目录内');
    let current = base;
    for (const segment of rel.split(sep).filter(Boolean)) {
      current = join(current, segment);
      if ((await lstat(current)).isSymbolicLink()) throw new Error('暂不读写符号链接');
    }
    return target;
  }
  async list(rootId: string, path: string): Promise<WritingEntry[]> {
    const directory = await this.location(rootId, path);
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          !e.name.startsWith('.') && (e.isDirectory() || (e.isFile() && /\.md$/i.test(e.name))),
      )
      .map((e) => ({
        name: e.name,
        path: [path, e.name].filter(Boolean).join('/'),
        kind: e.isDirectory() ? ('directory' as const) : ('file' as const),
      }))
      .sort(
        (a, b) =>
          Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
          a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
      );
  }
  async search(rootId: string, query: string) {
    const found: WritingEntry[] = [];
    const pending = [''];
    let visited = 0;
    while (pending.length && visited < 20_000 && found.length < 300) {
      const path = pending.shift();
      if (path === undefined) break;
      const entries = await this.list(rootId, path);
      for (const entry of entries) {
        visited++;
        if (entry.kind === 'directory') {
          if (entry.path.split('/').length < 32 && !['node_modules', 'vendor'].includes(entry.name))
            pending.push(entry.path);
        } else if (entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
          found.push(entry);
      }
    }
    return found.slice(0, 300);
  }
  private async bytes(rootId: string, path: string) {
    if (!/\.md$/i.test(path)) throw new Error('仅支持 Markdown 文件');
    const target = await this.location(rootId, path);
    const handle = await open(target, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > limit) throw new Error('仅支持 4 MiB 以内的 Markdown 文件');
      return { target, bytes: await handle.readFile() };
    } finally {
      await handle.close();
    }
  }
  async read(rootId: string, path: string): Promise<WritingFile> {
    const { bytes } = await this.bytes(rootId, path);
    return {
      content: normalize(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      revision: revision(bytes),
    };
  }
  save(rootId: string, path: string, content: string, expected: string) {
    return this.serial(rootId + ':' + path, async () => {
      const original = await this.bytes(rootId, path);
      if (revision(original.bytes) !== expected)
        throw new WritingConflict('文件已在外部修改，已停止自动保存');
      await access(original.target, constants.W_OK);
      const old = original.bytes.toString('utf8');
      const clean = normalize(content);
      const serialized =
        (old.startsWith('\uFEFF') ? '\uFEFF' : '') +
        (old.includes('\r\n') ? clean.replace(/\n/g, '\r\n') : clean);
      const bytes = Buffer.from(serialized);
      if (bytes.length > limit) throw new Error('文档超过 4 MiB，无法保存');
      const temporary = join(dirname(original.target), '.jarvis-' + randomUUID() + '.tmp');
      let exists = false;
      try {
        await writeFile(temporary, bytes, {
          flag: 'wx',
          mode: (await lstat(original.target)).mode & 0o777,
        });
        exists = true;
        const latest = await this.bytes(rootId, path);
        if (revision(latest.bytes) !== expected)
          throw new WritingConflict('文件已在外部修改，已停止自动保存');
        await rename(temporary, latest.target);
        exists = false;
      } finally {
        if (exists) await unlink(temporary);
      }
      return { content: clean, revision: revision(bytes) };
    });
  }
  async create(
    rootId: string,
    path: string,
    input: string,
    kind: 'file' | 'directory',
  ): Promise<WritingEntry> {
    let name = input.trim();
    if (
      !name ||
      name === '.' ||
      name === '..' ||
      /[<>:"/\\|?*]/.test(name) ||
      Array.from(name).some((character) => character.charCodeAt(0) < 32) ||
      /[. ]$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)
    )
      throw new Error('名称包含不支持的字符');
    if (kind === 'file' && !/\.md$/i.test(name)) name += '.md';
    if (Buffer.byteLength(name, 'utf8') > 240) throw new Error('名称过长，请使用更短的文件名');
    const parent = await this.location(rootId, path);
    if (kind === 'directory') await mkdir(join(parent, name));
    else await writeFile(join(parent, name), '', { flag: 'wx' });
    return { name, path: [path, name].filter(Boolean).join('/'), kind };
  }
}
