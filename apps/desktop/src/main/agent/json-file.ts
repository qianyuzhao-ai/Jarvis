import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('Agent 本地记录无法读取；原文件已保留', { cause: error });
  }
}
export class JsonFile {
  private writes = Promise.resolve();
  constructor(readonly path: string) {}
  write(value: unknown) {
    const content = JSON.stringify(value);
    const pending = this.writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      await writeFile(`${this.path}.tmp`, content, { mode: 0o600 });
      await rename(`${this.path}.tmp`, this.path);
    });
    this.writes = pending.catch(() => {});
    return pending;
  }
  /** Resolves once queued writes have finished, successful or not. */
  settled() {
    return this.writes;
  }
}
