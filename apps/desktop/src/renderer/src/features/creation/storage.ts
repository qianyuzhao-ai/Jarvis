import { emptyWorkspace, workspaceSchema, type WorkspaceData } from './types';

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
export async function loadWorkspace(): Promise<WorkspaceData> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspace').objectStore('workspace').get('current');
    request.onsuccess = () => {
      if (request.result === undefined) return resolve(emptyWorkspace);
      const parsed = workspaceSchema.safeParse(request.result);
      if (parsed.success) {
        for (const project of parsed.data.projects)
          for (const node of project.nodes)
            if (node.type === 'asset' && node.data.upload.status === 'uploading')
              node.data.upload = { status: 'failed', error: '上传已中断，尚未保存资源 URL' };
        resolve(parsed.data);
      } else reject(new Error('本地数据格式无法读取，原数据已保留。请勿清除应用数据。'));
    };
    request.onerror = () => reject(new Error('读取本地数据失败，原数据已保留。'));
  });
}
export async function saveWorkspace(data: WorkspaceData): Promise<void> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite');
    tx.objectStore('workspace').put(data, 'current');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error('本地保存失败，请检查磁盘空间并重试。'));
  });
}
