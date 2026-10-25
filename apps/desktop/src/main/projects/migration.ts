import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { z } from 'zod';
import type { StoredProject } from '../../shared/project';
import { JsonFile } from '../agent/json-file';
import { ProjectStore } from './project-store';

const markerSchema = z
  .object({ format: z.literal(1), migratedAt: z.number(), projects: z.array(z.string()) })
  .strict();
export type MigrationInput = {
  project: StoredProject;
  blobs: { id: string; bytes: Uint8Array }[];
}[];

/**
 * Copies the projects the renderer kept in IndexedDB into the store, once. Projects left by an
 * interrupted earlier attempt are written again. A fresh store then reads everything back from
 * disk, and only if every project and reference file matches is `migration.json` written. The
 * renderer keeps its IndexedDB data untouched.
 */
export class ProjectMigration {
  private marker: JsonFile;
  private running?: Promise<void>;
  constructor(
    private store: ProjectStore,
    private dir: string,
  ) {
    this.marker = new JsonFile(join(dir, 'migration.json'));
  }
  async done() {
    try {
      return markerSchema.safeParse(JSON.parse(await readFile(this.marker.path, 'utf8'))).success;
    } catch {
      return false;
    }
  }
  /** Runs once even if several windows ask at the same time. */
  migrate(input: MigrationInput) {
    this.running ??= this.run(input).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async run(input: MigrationInput) {
    if (await this.done()) return;
    const ids = new Set<string>();
    for (const { project } of input) {
      if (ids.has(project.id)) throw new Error('迁移数据中有重复的项目');
      ids.add(project.id);
    }
    for (const { project, blobs } of input) {
      if (this.store.list().some((p) => p.id === project.id)) await this.store.remove(project.id);
      await this.store.create(project, new Map(blobs.map((b) => [b.id, b.bytes])));
    }
    const check = new ProjectStore(this.dir);
    const { skipped } = await check.initialize();
    for (const { project, blobs } of input) {
      if (skipped.includes(project.id)) throw new Error('迁移后的项目无法读取，原数据已保留');
      const read = check.get(project.id);
      if (read.version !== 1 || !isDeepStrictEqual(read.project, project))
        throw new Error('迁移后的项目与原数据不一致，原数据已保留');
      for (const blob of blobs)
        if (!Buffer.from(blob.bytes).equals(await check.readBlob(project.id, blob.id)))
          throw new Error('迁移后的参考文件与原数据不一致，原数据已保留');
    }
    await this.marker.write({ format: 1, migratedAt: Date.now(), projects: [...ids] });
  }
}
