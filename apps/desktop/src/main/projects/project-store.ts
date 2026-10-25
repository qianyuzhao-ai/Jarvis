import { mkdir, readdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  blobId,
  projectOpsSchema,
  storedProjectSchema,
  type ProjectOp,
  type StoredProject,
} from '../../shared/project';
import { applyProjectOps } from './apply-ops';

const fileSchema = z
  .object({
    format: z.literal(1),
    version: z.number().int().positive(),
    project: storedProjectSchema,
  })
  .strict();
const MAX_BLOB = 100 * 1024 * 1024;
const MAX_FILE = 32 * 1024 * 1024;

/** A write based on an older version; `version` is the current one to re-read and retry from. */
export class ProjectConflictError extends Error {
  constructor(readonly version: number) {
    super('项目已被修改，请读取最新版本后重试');
  }
}
type Entry = { version: number; project: StoredProject; blobs: Set<string> };
export type ProjectChange = {
  projectId: string;
  version: number;
  ops: ProjectOp[];
  project: StoredProject;
};

/**
 * Canvas projects in the main process, one directory each: `project.json` holds the version and
 * data, `blobs/` holds reference files. Every change goes through `applyOps`, which checks the base
 * version, validates the result and replaces the file atomically. Writes to one project run one at
 * a time; different projects write independently. Unreadable projects are reported and left as is.
 */
export class ProjectStore {
  onChange: (change: ProjectChange) => void = () => {};
  private entries = new Map<string, Entry>();
  private locks = new Map<string, Promise<unknown>>();
  constructor(private dir: string) {}
  /** Loads every readable project; returns the directories that could not be read. */
  async initialize() {
    this.entries.clear();
    const skipped: string[] = [];
    let names: string[] = [];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    for (const name of names) {
      if (!z.string().uuid().safeParse(name).success) continue;
      try {
        const raw = await readFile(this.file(name), 'utf8');
        const parsed = fileSchema.parse(JSON.parse(raw));
        if (parsed.project.id !== name) throw new Error('项目 ID 与目录不符');
        const blobs = new Set(
          (await readdir(this.blobDir(name)).catch(() => [])).filter(
            (b) => blobId.safeParse(b).success,
          ),
        );
        this.entries.set(name, { version: parsed.version, project: parsed.project, blobs });
      } catch {
        skipped.push(name);
      }
    }
    return { skipped };
  }
  list() {
    return [...this.entries.values()]
      .map(({ version, project }) => ({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        version,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  get(id: string) {
    const entry = this.entry(id);
    return { version: entry.version, project: structuredClone(entry.project) };
  }
  /** Adds a project at version 1 together with the reference files its nodes point to. */
  async create(input: StoredProject, blobs = new Map<string, Uint8Array>()) {
    const project = storedProjectSchema.parse(input);
    return this.locked(project.id, async () => {
      if (this.entries.has(project.id)) throw new Error('项目已存在');
      for (const [id, bytes] of blobs) this.checkBlob(id, bytes);
      const names = new Set(blobs.keys());
      this.checkReferences(project, names);
      for (const [id, bytes] of blobs)
        await this.writeAtomic(join(this.blobDir(project.id), id), bytes);
      await this.writeProject(project.id, 1, project);
      this.entries.set(project.id, { version: 1, project, blobs: names });
      return { version: 1 };
    });
  }
  /**
   * Applies ops written against `baseVersion` as one change. Returns the new version, the project
   * and the ops that undo the change. Nothing is saved if any op fails or the result is invalid.
   */
  async applyOps(
    id: string,
    baseVersion: number,
    input: unknown,
    { touch = true }: { touch?: boolean } = {},
  ) {
    const ops = projectOpsSchema.parse(input);
    return this.locked(id, async () => {
      const entry = this.entry(id);
      if (entry.version !== baseVersion) throw new ProjectConflictError(entry.version);
      const applied = applyProjectOps(entry.project, ops);
      if (touch) applied.project.updatedAt = Date.now();
      const project = storedProjectSchema.parse(applied.project);
      this.checkReferences(project, entry.blobs);
      const version = entry.version + 1;
      await this.writeProject(id, version, project);
      entry.version = version;
      entry.project = project;
      const change = { projectId: id, version, ops, project: structuredClone(project) };
      this.onChange(change);
      return { version, project: structuredClone(project), inverse: applied.inverse };
    });
  }
  /** Stores a reference file before the op that points to it; existing files are never replaced. */
  async putBlob(id: string, ref: string, bytes: Uint8Array) {
    this.checkBlob(ref, bytes);
    return this.locked(id, async () => {
      const entry = this.entry(id);
      if (entry.blobs.has(ref)) throw new Error('参考文件已存在');
      await this.writeAtomic(join(this.blobDir(id), ref), bytes);
      entry.blobs.add(ref);
    });
  }
  async readBlob(id: string, ref: string) {
    const entry = this.entry(id);
    if (!blobId.safeParse(ref).success || !entry.blobs.has(ref)) throw new Error('参考文件不存在');
    return readFile(join(this.blobDir(id), ref));
  }
  /** Deletes a project's files one by one, then its directories. */
  async remove(id: string) {
    return this.locked(id, async () => {
      const entry = this.entry(id);
      this.entries.delete(id);
      for (const ref of entry.blobs) await unlink(join(this.blobDir(id), ref)).catch(() => {});
      await rmdir(this.blobDir(id)).catch(() => {});
      await unlink(this.file(id));
      await rmdir(join(this.dir, id)).catch(() => {});
    });
  }
  private entry(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('项目不存在或已删除');
    return entry;
  }
  private checkBlob(ref: string, bytes: Uint8Array) {
    if (!blobId.safeParse(ref).success) throw new Error('参考文件标识不正确');
    if (bytes.byteLength > MAX_BLOB) throw new Error('参考文件过大');
  }
  /** Every reference, including those in saved agent edits, must have its file. */
  private checkReferences(project: StoredProject, blobs: Set<string>) {
    const nodes = [...project.nodes, ...project.agentEdits.flatMap((e) => e.before.nodes)];
    for (const node of nodes)
      if (node.type === 'media')
        for (const ref of node.data.references)
          if (!blobs.has(ref.id)) throw new Error(`参考文件缺失：${ref.name}`);
  }
  /** Runs one change at a time per project, in call order; a failed change does not block the next. */
  private locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (!z.string().uuid().safeParse(id).success)
      return Promise.reject(new Error('项目标识不正确'));
    const pending = (this.locks.get(id) ?? Promise.resolve()).then(action);
    const tail = pending.catch(() => {});
    this.locks.set(id, tail);
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return pending;
  }
  private async writeProject(id: string, version: number, project: StoredProject) {
    const content = JSON.stringify({ format: 1, version, project });
    if (content.length > MAX_FILE) throw new Error('项目数据过大');
    await this.writeAtomic(this.file(id), content);
  }
  private async writeAtomic(path: string, content: string | Uint8Array) {
    await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, content, { mode: 0o600 });
    await rename(temp, path);
  }
  private file(id: string) {
    return join(this.dir, id, 'project.json');
  }
  private blobDir(id: string) {
    return join(this.dir, id, 'blobs');
  }
}
