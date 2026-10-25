import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  copyFile,
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
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  isWritingText,
  validateEntryName,
  writingFileType,
  type WritingEntry,
  type WritingFile,
  type WritingRoot,
} from '../../shared/writing';

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
  constructor(
    private readonly registry: string,
    private readonly native?: {
      trash(path: string): Promise<void>;
      reveal(path: string): void;
    },
  ) {}

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
  async asset(rootId: string, path: string) {
    if (!['image', 'pdf', 'audio', 'video'].includes(writingFileType(path)))
      throw new Error('不支持预览这个格式');
    const target = await this.location(rootId, path);
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error('不是普通文件');
      return { handle, size: info.size };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async list(rootId: string, path: string): Promise<WritingEntry[]> {
    const directory = await this.location(rootId, path);
    const entries = await readdir(directory, { withFileTypes: true });
    const result: WritingEntry[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const itemPath = [path, entry.name].filter(Boolean).join('/');
      const info = await lstat(await this.location(rootId, itemPath));
      if (!info.isFile() && !info.isDirectory()) continue;
      result.push({
        name: entry.name,
        path: itemPath,
        kind: info.isDirectory() ? 'directory' : 'file',
        ...(info.isFile()
          ? { fileType: writingFileType(entry.name), size: info.size, mtime: info.mtimeMs }
          : {}),
      });
    }
    return result.sort(
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
    if (!isWritingText(path)) throw new Error('这个格式不能作为文本打开');
    const target = await this.location(rootId, path);
    const handle = await open(target, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > limit) throw new Error('仅支持 4 MiB 以内的文本文件');
      return { target, bytes: await handle.readFile(), mtime: info.mtimeMs };
    } finally {
      await handle.close();
    }
  }
  private decode(bytes: Buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('文件不是 UTF-8 文本');
    }
  }
  async read(rootId: string, path: string): Promise<WritingFile> {
    const { bytes, mtime } = await this.bytes(rootId, path);
    return {
      mtime,
      content: normalize(this.decode(bytes)),
      revision: revision(bytes),
    };
  }
  save(rootId: string, path: string, content: string, expected: string) {
    return this.serial(rootId, async () => {
      const original = await this.bytes(rootId, path);
      if (revision(original.bytes) !== expected)
        throw new WritingConflict('文件已在外部修改，已停止自动保存');
      await access(original.target, constants.W_OK);
      this.decode(original.bytes);
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
      return {
        content: clean,
        revision: revision(bytes),
        mtime: (await lstat(original.target)).mtimeMs,
      };
    });
  }
  async create(
    rootId: string,
    path: string,
    input: string,
    kind: 'file' | 'directory',
  ): Promise<WritingEntry> {
    let name = validateEntryName(input);
    if (kind === 'file' && !extname(name)) name += '.md';
    name = validateEntryName(name);
    if (kind === 'file' && !isWritingText(name)) throw new Error('这个格式不能作为文本新建');
    return this.serial(rootId, async () => {
      const parent = await this.location(rootId, path);
      if (kind === 'directory') await mkdir(join(parent, name));
      else await writeFile(join(parent, name), '', { flag: 'wx' });
      return this.entry(rootId, [path, name].filter(Boolean).join('/'));
    });
  }
  private async entry(rootId: string, path: string): Promise<WritingEntry> {
    const info = await lstat(await this.location(rootId, path));
    return {
      name: basename(path),
      path,
      kind: info.isDirectory() ? 'directory' : 'file',
      ...(info.isFile()
        ? { fileType: writingFileType(path), size: info.size, mtime: info.mtimeMs }
        : {}),
    };
  }
  private async absent(path: string) {
    try {
      await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    throw new WritingConflict('已存在同名文件');
  }
  private async relocate(rootId: string, path: string, directory: string, name: string) {
    if (!path) throw new Error('不能移动授权文件夹本身');
    const source = await this.location(rootId, path);
    const parent = await this.location(rootId, directory);
    const target = join(parent, validateEntryName(name));
    if (target === source || target.startsWith(source + sep))
      throw new Error('不能移到自身或子目录');
    await this.absent(target);
    await rename(source, target);
    return this.entry(rootId, [directory, name].filter(Boolean).join('/'));
  }
  rename(rootId: string, path: string, name: string) {
    return this.serial(rootId, () =>
      this.relocate(rootId, path, path.split('/').slice(0, -1).join('/'), validateEntryName(name)),
    );
  }
  move(rootId: string, path: string, targetDir: string) {
    return this.serial(rootId, () => this.relocate(rootId, path, targetDir, basename(path)));
  }
  duplicate(rootId: string, path: string) {
    return this.serial(rootId, async () => {
      const source = await this.location(rootId, path);
      if (!(await lstat(source)).isFile()) throw new Error('文件夹不支持创建副本');
      const extension = extname(path),
        stem = basename(path, extension);
      for (let index = 1; index <= 1000; index++) {
        const name = validateEntryName(
          stem + ' 副本' + (index === 1 ? '' : ' ' + index) + extension,
        );
        try {
          await copyFile(source, join(dirname(source), name), constants.COPYFILE_EXCL);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
          throw error;
        }
        return this.entry(rootId, [...path.split('/').slice(0, -1), name].join('/'));
      }
      throw new Error('副本过多，请先更换名称');
    });
  }
  trash(rootId: string, path: string) {
    return this.serial(rootId, async () => {
      if (!path) throw new Error('不能移除授权文件夹本身');
      const target = await this.location(rootId, path);
      const info = await lstat(target);
      if (info.isDirectory() && (await readdir(target)).length) throw new Error('文件夹不为空');
      if (!info.isFile() && !info.isDirectory()) throw new Error('不支持这个文件类型');
      if (!this.native) throw new Error('废纸篓不可用');
      await this.native.trash(target);
    });
  }
  async reveal(rootId: string, path: string) {
    const target = await this.location(rootId, path);
    if (!this.native) throw new Error('文件管理器不可用');
    this.native.reveal(target);
  }
  saveAsset(rootId: string, documentPath: string, mime: string, input: Uint8Array) {
    return this.serial(rootId, async () => {
      const document = await this.location(rootId, documentPath);
      if (writingFileType(documentPath) !== 'markdown' || !(await lstat(document)).isFile())
        throw new Error('请选择 Markdown 文档');
      const bytes = Buffer.from(input);
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MiB');
      const format =
        mime === 'image/png' &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'png'
          : mime === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            ? 'jpg'
            : mime === 'image/gif' &&
                ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
              ? 'gif'
              : mime === 'image/webp' &&
                  bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
                  bytes.subarray(8, 12).toString('ascii') === 'WEBP'
                ? 'webp'
                : '';
      if (!format) throw new Error('图片内容与格式不匹配');
      const folder = [...documentPath.split('/').slice(0, -1), 'assets'].join('/');
      try {
        await mkdir(join(dirname(document), 'assets'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      const directory = await this.location(rootId, folder);
      const name =
        new Date().toISOString().slice(0, 10).replaceAll('-', '') +
        '-' +
        revision(bytes).slice(0, 8) +
        '.' +
        format;
      const target = join(directory, name);
      try {
        await writeFile(target, bytes, { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await this.location(rootId, folder + '/' + name);
        if (!bytes.equals(await readFile(existing)))
          throw new WritingConflict('图片名称冲突', { cause: error });
      }
      return './assets/' + name;
    });
  }
}
