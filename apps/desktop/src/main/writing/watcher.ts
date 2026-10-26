import { watch, type FSWatcher } from 'node:fs';
import type { WritingFiles } from './files';

export class WritingWatcher {
  private roots = new Map<
    string,
    {
      watcher: FSWatcher;
      owners: Set<number>;
      timer?: ReturnType<typeof setTimeout>;
      paths: Set<string>;
    }
  >();
  constructor(
    private readonly files: WritingFiles,
    private readonly changed: (rootId: string, paths: string[], owners: Set<number>) => void,
  ) {}
  subscribe(rootId: string, owner: number) {
    const existing = this.roots.get(rootId);
    if (existing) {
      existing.owners.add(owner);
      return true;
    }
    const root = this.files.getRoots().find((r) => r.id === rootId);
    if (!root) throw new Error('该目录尚未授权');
    try {
      const watcher = watch(root.directory, { recursive: true }, (_event, name) => {
        const path = name?.toString().replaceAll('\\', '/') ?? '';
        if (path.split('/').some((part) => part.startsWith('.'))) return;
        const entry = this.roots.get(rootId);
        if (!entry) return;
        entry.paths.add(path);
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          this.changed(rootId, [...entry.paths], entry.owners);
          entry.paths.clear();
        }, 300);
      });
      watcher.on('error', () => this.close(rootId));
      this.roots.set(rootId, { watcher, owners: new Set([owner]), paths: new Set() });
      return true;
    } catch {
      return false;
    }
  }
  unsubscribe(rootId: string, owner: number) {
    const entry = this.roots.get(rootId);
    entry?.owners.delete(owner);
    if (entry && !entry.owners.size) this.close(rootId);
  }
  removeOwner(owner: number) {
    for (const rootId of this.roots.keys()) this.unsubscribe(rootId, owner);
  }
  private close(rootId: string) {
    const entry = this.roots.get(rootId);
    clearTimeout(entry?.timer);
    entry?.watcher.close();
    this.roots.delete(rootId);
  }
}
