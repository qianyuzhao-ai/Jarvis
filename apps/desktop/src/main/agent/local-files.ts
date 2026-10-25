import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { AuthorizedFolder, FileOp } from '../../shared/agent-files';
import { JsonFile, readJson } from './json-file';

const registrySchema = z
  .object({
    version: z.literal(1),
    folders: z.array(
      z
        .object({ id: z.string(), name: z.string(), directory: z.string(), addedAt: z.number() })
        .strict(),
    ),
  })
  .strict();
const TEXT_LIMIT = 4 * 1024 * 1024;
const SNAPSHOT_LIMIT = 50 * 1024 * 1024;
const SNAPSHOT_DAYS = 30;
export const OUTSIDE = '路径不在授权文件夹内，已拦截';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

type Located = {
  folder: AuthorizedFolder;
  root: string;
  target: string;
  path: string;
  display: string;
};

/**
 * Local files for the main Agent, confined to folders the user authorized in settings. Every path
 * is relative to one folder and checked after resolving symlinks, so nothing outside it can be
 * read or changed. Overwritten and deleted files are kept as snapshots so a round can be undone;
 * snapshots older than 30 days are removed at start.
 */
export class LocalFiles {
  private folders: AuthorizedFolder[] = [];
  private registry: JsonFile;
  constructor(
    registry: string,
    private snapshots: string,
  ) {
    this.registry = new JsonFile(registry);
  }
  async initialize() {
    const parsed = registrySchema.safeParse(await readJson(this.registry.path));
    if (parsed.success) this.folders = parsed.data.folders;
    const cutoff = Date.now() - SNAPSHOT_DAYS * 86_400_000;
    for (const name of await readdir(this.snapshots).catch(() => [] as string[])) {
      const file = join(this.snapshots, name);
      const info = await stat(file).catch(() => null);
      if (info?.isFile() && info.mtimeMs < cutoff) await unlink(file).catch(() => {});
    }
  }
  list() {
    return this.folders.map((f) => ({ ...f }));
  }
  async add(directory: string) {
    const canonical = await realpath(directory);
    if (!(await stat(canonical)).isDirectory()) throw new Error('请选择文件夹');
    if (dirname(canonical) === canonical)
      throw new Error('不能授权整个磁盘根目录，请选择具体的文件夹');
    const folder = {
      id: createHash('sha256').update(canonical).digest('hex').slice(0, 24),
      name: basename(canonical),
      directory: canonical,
      addedAt: Date.now(),
    };
    const next = [folder, ...this.folders.filter((f) => f.id !== folder.id)].slice(0, 50);
    await this.registry.write({ version: 1, folders: next });
    this.folders = next;
    return this.list();
  }
  async remove(id: string) {
    const next = this.folders.filter((f) => f.id !== id);
    await this.registry.write({ version: 1, folders: next });
    this.folders = next;
    return this.list();
  }
  folderName(id: string) {
    return this.folders.find((f) => f.id === id)?.name ?? id;
  }
  /** Resolves a path inside a folder; `create` allows a target that does not exist yet. */
  private async locate(folderId: string, path: string, create = false): Promise<Located> {
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder) throw new Error('没有这个授权文件夹');
    if (isAbsolute(path) || path.includes('\0') || /^[a-zA-Z]:/.test(path))
      throw new Error('只能使用授权文件夹内的相对路径');
    let root: string;
    try {
      root = await realpath(folder.directory);
    } catch (cause) {
      throw new Error('授权文件夹已不存在或无法访问，请在设置中重新添加', { cause });
    }
    const inside = (p: string) => p === root || p.startsWith(root + sep);
    const target = resolve(root, path);
    if (!inside(target)) throw new Error(OUTSIDE);
    try {
      if (!inside(await realpath(target))) throw new Error(OUTSIDE);
    } catch (error) {
      if (!missing(error)) throw error;
      if (!create) throw new Error('文件或目录不存在', { cause: error });
      let parent: string;
      try {
        parent = await realpath(dirname(target));
      } catch (cause) {
        throw new Error('上级目录不存在，请先创建', { cause });
      }
      if (!inside(parent)) throw new Error(OUTSIDE, { cause: error });
    }
    const rel = relative(root, target).split(sep).join('/');
    return { folder, root, target, path: rel, display: `${folder.name}/${rel}` };
  }
  /** A regular file (not a link or directory) inside the folder. */
  private async file(folderId: string, path: string) {
    const located = await this.locate(folderId, path);
    const info = await lstat(located.target);
    if (!info.isFile()) throw new Error('只能操作普通文件，不能操作目录或链接');
    return { ...located, size: info.size };
  }
  async listDir(folderId: string, path = '') {
    const { target } = await this.locate(folderId, path);
    const entries = await readdir(target, { withFileTypes: true });
    const shown = entries.filter((e) => !e.name.startsWith('.') && (e.isDirectory() || e.isFile()));
    const result = await Promise.all(
      shown.slice(0, 500).map(async (e) => {
        const info = await lstat(join(target, e.name)).catch(() => null);
        return {
          name: e.name,
          path: [path, e.name].filter(Boolean).join('/'),
          kind: e.isDirectory() ? ('directory' as const) : ('file' as const),
          ...(e.isFile() && info
            ? { size: info.size, modifiedAt: new Date(info.mtimeMs).toISOString() }
            : {}),
        };
      }),
    );
    return result.sort(
      (a, b) =>
        Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
        a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
    );
  }
  async search(folderId: string, query: string) {
    await this.locate(folderId, '');
    const found: { name: string; path: string; kind: 'file' | 'directory' }[] = [];
    const pending = [''];
    let visited = 0;
    const needle = query.toLocaleLowerCase();
    while (pending.length && visited < 20_000 && found.length < 300) {
      const path = pending.shift() as string;
      const entries = await this.listDir(folderId, path).catch(() => []);
      for (const entry of entries) {
        visited++;
        if (entry.name.toLocaleLowerCase().includes(needle))
          found.push({ name: entry.name, path: entry.path, kind: entry.kind });
        if (entry.kind === 'directory' && !['node_modules', 'vendor'].includes(entry.name))
          pending.push(entry.path);
      }
    }
    return found.slice(0, 300);
  }
  async readText(folderId: string, path: string) {
    const { target, size, display } = await this.file(folderId, path);
    if (size > TEXT_LIMIT) throw new Error('只能读取 4 MiB 以内的文本文件');
    const bytes = await readFile(target);
    try {
      return { display, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
    } catch {
      throw new Error('不是 UTF-8 文本文件，无法读取');
    }
  }
  async createFile(folderId: string, path: string, content: string) {
    const located = await this.locate(folderId, path, true);
    const bytes = Buffer.from(content);
    await writeFile(located.target, bytes, { flag: 'wx' });
    const op: FileOp = { op: 'create', folderId, path: located.path, hash: hash(bytes) };
    return { op, display: located.display };
  }
  async createFolder(folderId: string, path: string) {
    const located = await this.locate(folderId, path, true);
    await mkdir(located.target);
    const op: FileOp = { op: 'mkdir', folderId, path: located.path };
    return { op, display: located.display };
  }
  /** Replaces a file's content, keeping the old bytes as a snapshot. */
  async overwrite(folderId: string, path: string, content: string) {
    const located = await this.file(folderId, path);
    if (located.size > SNAPSHOT_LIMIT) throw new Error('文件超过 50 MiB，无法保留快照，未修改');
    const before = await readFile(located.target);
    const snapshot = await this.snapshot(before);
    const bytes = Buffer.from(content);
    await this.replace(located.target, bytes);
    const op: FileOp = {
      op: 'overwrite',
      folderId,
      path: located.path,
      hash: hash(bytes),
      snapshot,
    };
    return { op, display: located.display, before: before.toString('utf8') };
  }
  /** Deletes a file, keeping its bytes as a snapshot. */
  async delete(folderId: string, path: string) {
    const located = await this.file(folderId, path);
    if (located.size > SNAPSHOT_LIMIT) throw new Error('文件超过 50 MiB，无法保留快照，未删除');
    const before = await readFile(located.target);
    const snapshot = await this.snapshot(before);
    await unlink(located.target);
    const op: FileOp = { op: 'delete', folderId, path: located.path, snapshot };
    return { op, display: located.display, before: before.toString('utf8') };
  }
  /** Moves or renames a file within one folder; the destination must not exist. */
  async move(folderId: string, path: string, to: string) {
    const source = await this.file(folderId, path);
    const target = await this.locate(folderId, to, true);
    if (
      await lstat(target.target).then(
        () => true,
        () => false,
      )
    )
      throw new Error('目标位置已有同名文件，未移动');
    await rename(source.target, target.target);
    const op: FileOp = { op: 'move', folderId, path: source.path, to: target.path };
    return { op, display: `${source.display} → ${target.path}` };
  }
  /**
   * Undoes a round's operations, latest first. Each step checks that nothing changed the file
   * since; the first step that cannot be undone stops the rest, which are returned.
   */
  async undo(ops: FileOp[]) {
    const remaining = [...ops];
    while (remaining.length) {
      const op = remaining[remaining.length - 1] as FileOp;
      try {
        await this.undoOne(op);
      } catch (error) {
        return { remaining, error: error instanceof Error ? error.message : '撤销失败' };
      }
      remaining.pop();
    }
    return { remaining, error: null };
  }
  private async undoOne(op: FileOp) {
    const changed = (path: string) =>
      `${this.folderName(op.folderId)}/${path} 之后又被修改，未撤销`;
    if (op.op === 'create' || op.op === 'overwrite') {
      const { target } = await this.file(op.folderId, op.path).catch(() => {
        throw new Error(changed(op.path));
      });
      if (hash(await readFile(target)) !== op.hash) throw new Error(changed(op.path));
      if (op.op === 'create') await unlink(target);
      else await this.replace(target, await this.restore(op));
    } else if (op.op === 'delete') {
      const located = await this.locate(op.folderId, op.path, true);
      await writeFile(located.target, await this.restore(op), { flag: 'wx' }).catch((error) => {
        throw (error as NodeJS.ErrnoException).code === 'EEXIST'
          ? new Error(changed(op.path))
          : error;
      });
    } else if (op.op === 'move' && op.to) {
      const moved = await this.file(op.folderId, op.to).catch(() => {
        throw new Error(changed(op.to as string));
      });
      const back = await this.locate(op.folderId, op.path, true);
      if (
        await lstat(back.target).then(
          () => true,
          () => false,
        )
      )
        throw new Error(changed(op.path));
      await rename(moved.target, back.target);
    } else if (op.op === 'mkdir') {
      const { target } = await this.locate(op.folderId, op.path);
      if ((await readdir(target)).length)
        throw new Error(`${this.folderName(op.folderId)}/${op.path} 里已有文件，未撤销`);
      await rmdir(target);
    }
  }
  private async snapshot(bytes: Buffer) {
    const id = randomUUID();
    await mkdir(this.snapshots, { recursive: true, mode: 0o700 });
    await writeFile(join(this.snapshots, id), bytes, { mode: 0o600, flag: 'wx' });
    return id;
  }
  private async restore(op: FileOp) {
    if (!op.snapshot) throw new Error('缺少快照，无法撤销');
    try {
      return await readFile(join(this.snapshots, op.snapshot));
    } catch {
      throw new Error('快照已过期或丢失，无法撤销');
    }
  }
  /** Writes through a temporary file in the same directory, keeping the file's mode. */
  private async replace(target: string, bytes: Uint8Array) {
    const mode = (await stat(target)).mode & 0o777;
    const temporary = join(dirname(target), `.jarvis-${randomUUID()}.tmp`);
    await writeFile(temporary, bytes, { flag: 'wx', mode });
    try {
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
}
