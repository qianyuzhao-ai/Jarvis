import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { downloadPreferencesSchema, type DownloadPreferences } from '../../shared/generation';

export async function validateDownloadDirectory(directory: string) {
  try {
    if (!isAbsolute(directory) || !(await stat(directory)).isDirectory()) throw new Error();
    await access(directory, constants.W_OK);
  } catch {
    throw new Error('默认下载目录不可用，请到设置 → 通用重新选择文件夹');
  }
}
export class DownloadPreferencesStore {
  private current: DownloadPreferences = { directory: '', dontAskAgain: false };
  private writes = Promise.resolve();
  constructor(private readonly file: string) {}
  async initialize() {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    this.current = downloadPreferencesSchema.parse(JSON.parse(raw));
    if (this.current.dontAskAgain && !this.current.directory) throw new Error('默认下载目录缺失');
  }
  get() {
    return { ...this.current };
  }
  private update(change: (current: DownloadPreferences) => DownloadPreferences) {
    const task = this.writes.then(async () => {
      const next = change(this.current);
      if (next.directory !== this.current.directory || next.dontAskAgain)
        await validateDownloadDirectory(next.directory);
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + '.tmp', JSON.stringify(next), { mode: 0o600 });
      await rename(this.file + '.tmp', this.file);
      this.current = next;
      return this.get();
    });
    this.writes = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  setDirectory(directory: string) {
    return this.update((current) => ({ ...current, directory }));
  }
  setDontAsk(dontAskAgain: boolean) {
    return this.update((current) => ({ ...current, dontAskAgain }));
  }
}
