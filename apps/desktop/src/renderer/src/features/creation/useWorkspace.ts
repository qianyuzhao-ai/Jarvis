import { useCallback, useRef, useState } from 'react';
import { saveWorkspace } from './storage';
import type { WorkspaceData } from './types';
import { useUpdateGuard } from '../updates/use-update-guard';
export type ChangeWorkspace = (previous: WorkspaceData) => WorkspaceData;
export function useWorkspace(initial: WorkspaceData) {
  const [data, setData] = useState(initial);
  const current = useRef(initial);
  const revision = useRef(0);
  const [status, setStatus] = useState('已保存到本机');
  const [saveError, setSaveError] = useState('');
  const getCurrent = useCallback(() => current.current, []);
  const commit = useCallback(async (change: ChangeWorkspace, rollbackOnFailure = false) => {
    const before = current.current;
    const next = change(before);
    current.current = next;
    setData(next);
    setStatus('正在保存…');
    const version = ++revision.current;
    try {
      await saveWorkspace(next);
      if (version === revision.current) {
        setStatus('已保存到本机');
        setSaveError('');
      }
    } catch (error) {
      if (version === revision.current) {
        if (rollbackOnFailure) {
          current.current = before;
          setData(before);
        }
        setStatus('保存失败');
        setSaveError(error instanceof Error ? error.message : '保存失败');
      }
      throw error;
    }
  }, []);
  const update = useCallback(
    (change: ChangeWorkspace) => {
      void commit(change).catch(() => {});
    },
    [commit],
  );
  useUpdateGuard(async () => {
    const busy = current.current.projects.some((project) =>
      project.nodes.some((node) =>
        node.type === 'asset'
          ? node.data.upload.status === 'uploading'
          : ['uploading', 'submitting', 'running'].includes(node.data.generation?.status ?? ''),
      ),
    );
    if (busy) throw new Error('请先等待素材上传或生成任务完成，再重启安装。');
    await commit((value) => value);
  });
  return { data, update, commit, getCurrent, status, saveError };
}
