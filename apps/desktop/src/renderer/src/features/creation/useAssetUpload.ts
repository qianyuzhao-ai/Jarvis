import { useCallback } from 'react';
import { inspectAsset, uploadSettings } from './asset-upload';
import type { AssetData, AssetNode, WorkspaceData } from './types';
import type { ChangeWorkspace } from './useWorkspace';

export function useAssetUpload(
  commit: (change: ChangeWorkspace) => Promise<void>,
  getCurrent: () => WorkspaceData,
) {
  return useCallback(
    async (
      projectId: string,
      files: File[],
      point: { x: number; y: number },
      onNotice: (message: string) => void,
    ) => {
      const settings = getCurrent().settings;
      const issues: string[] = [];
      const prepared = files.flatMap((file) => {
        try {
          const { kind, mime } = inspectAsset(file);
          uploadSettings(settings, kind);
          return [{ file, kind, mime, id: crypto.randomUUID() }];
        } catch (error) {
          issues.push(`${file.name}：${error instanceof Error ? error.message : '无法导入文件'}`);
          return [];
        }
      });
      onNotice(issues.join('；'));
      if (!prepared.length) return;
      const nodes: AssetNode[] = prepared.map(({ file, kind, id }, index) => ({
        id,
        type: 'asset',
        position: { x: point.x + (index % 3) * 384, y: point.y + Math.floor(index / 3) * 288 },
        data: { kind, name: file.name, upload: { status: 'uploading' } },
      }));
      const patch = (id: string, upload: AssetData['upload']) =>
        commit((s) => ({
          ...s,
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  updatedAt: Date.now(),
                  nodes: p.nodes.map((n) =>
                    n.id === id && n.type === 'asset' ? { ...n, data: { ...n.data, upload } } : n,
                  ),
                },
          ),
        }));
      try {
        await commit((s) => ({
          ...s,
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, updatedAt: Date.now(), nodes: [...p.nodes, ...nodes] } : p,
          ),
        }));
      } catch {
        for (const node of nodes)
          await patch(node.id, { status: 'failed', error: '本地保存失败，尚未上传' }).catch(
            () => {},
          );
        onNotice('本地保存失败，恢复保存后请重新拖入文件');
        return;
      }
      for (const { file, kind, mime, id } of prepared) {
        if (
          !getCurrent()
            .projects.find((p) => p.id === projectId)
            ?.nodes.some((n) => n.id === id)
        )
          continue;
        let url: string;
        try {
          const response = await window.desktop!.generation.upload({
            settings,
            file: { name: file.name, kind, mime, bytes: new Uint8Array(await file.arrayBuffer()) },
          });
          if (!response.ok) throw new Error(response.error);
          url = response.value.url;
        } catch (error) {
          await patch(id, {
            status: 'failed',
            error: error instanceof Error ? error.message : '上传失败',
          }).catch(() => {});
          continue;
        }
        await patch(id, { status: 'ready', url }).catch(() => {});
      }
    },
    [commit, getCurrent],
  );
}
