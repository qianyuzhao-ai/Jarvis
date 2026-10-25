import { emptyWorkspace, workspaceSchema, type WorkspaceData } from './types';

/** Settings kept in the renderer; projects live in the main process. */
export type Preferences = Omit<WorkspaceData, 'projects'>;
const preferencesSchema = workspaceSchema.omit({ projects: true });

const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('jarvis-workspace', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('workspace');
  request.onsuccess = () => {
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => reject(new Error('无法打开本地存储，请重新启动应用。'));
  request.onblocked = () =>
    reject(new Error('本地存储被其他窗口占用，请关闭其他 Jarvis 窗口后重试。'));
});
async function read(key: string): Promise<unknown> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspace').objectStore('workspace').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('读取本地数据失败，原数据已保留。'));
  });
}
/**
 * The workspace as earlier versions saved it, projects included, under `current`. It is only
 * read: after the projects moved to the main process it stays as the original copy.
 */
export async function loadLegacyWorkspace(): Promise<WorkspaceData> {
  const raw = await read('current');
  if (raw === undefined) return emptyWorkspace;
  const parsed = workspaceSchema.safeParse(raw);
  if (!parsed.success) throw new Error('本地数据格式无法读取，原数据已保留。请勿清除应用数据。');
  return parsed.data;
}
/** Saved preferences, or those of the earlier workspace record before the first save. */
export async function loadPreferences(): Promise<Preferences> {
  const raw = await read('preferences');
  if (raw !== undefined) {
    const parsed = preferencesSchema.safeParse(raw);
    if (!parsed.success) throw new Error('本地设置格式无法读取，原数据已保留。');
    return parsed.data;
  }
  const { projects: _, ...rest } = await loadLegacyWorkspace();
  return rest;
}
export async function savePreferences(data: Preferences): Promise<void> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite');
    tx.objectStore('workspace').put(preferencesSchema.parse(data), 'preferences');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error('本地保存失败，请检查磁盘空间并重试。'));
  });
}
