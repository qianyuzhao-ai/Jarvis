import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import type { StoredProject } from '../../src/shared/project';

/**
 * Replaces the workspace the way an older version left it: the record goes into IndexedDB under
 * `current`, saved preferences and main-process projects are cleared, and the migration marker is
 * removed, so the reload migrates the record like a first start after the upgrade.
 */
export async function seedWorkspace(app: ElectronApplication, page: Page, workspace: unknown) {
  await page.evaluate(async (data) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jarvis-workspace', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(data, 'current');
      tx.objectStore('workspace').delete('preferences');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const projects = window.desktop!.projects;
    const listed = await projects.list();
    if (!listed.ok) throw new Error(listed.error);
    for (const { project } of listed.value) {
      const removed = await projects.remove({ projectId: project.id, source: crypto.randomUUID() });
      if (!removed.ok) throw new Error(removed.error);
    }
  }, workspace);
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  await unlink(join(userData, 'projects', 'migration.json')).catch(() => {});
  await page.reload();
}

/** Projects as the main process stores them, newest first; reference files are not included. */
export async function readProjects(page: Page): Promise<StoredProject[]> {
  return page.evaluate(async () => {
    const listed = await window.desktop!.projects.list();
    if (!listed.ok) throw new Error(listed.error);
    return listed.value.map((r) => r.project);
  });
}
