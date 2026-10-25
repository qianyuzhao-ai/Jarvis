import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectRecord } from '../../../../shared/project';
import { ProjectSync } from './project-sync';
import { savePreferences, type Preferences } from './storage';
import type { WorkspaceData } from './types';
import { useUpdateGuard } from '../updates/use-update-guard';
export type ChangeWorkspace = (previous: WorkspaceData) => WorkspaceData;
const preferences = ({ projects: _, ...rest }: WorkspaceData): Preferences => rest;
export function useWorkspace(initial: { data: WorkspaceData; records: ProjectRecord[] }) {
  const [data, setData] = useState(initial.data);
  const current = useRef(initial.data);
  const revision = useRef(0);
  const [status, setStatus] = useState('已保存到本机');
  const [saveError, setSaveError] = useState('');
  const getCurrent = useCallback(() => current.current, []);
  const [sync] = useState(() => {
    const bridge = window.desktop?.projects;
    if (!bridge) throw new Error('项目接口尚未加载');
    return new ProjectSync(bridge, initial.records, () => current.current.projects);
  });
  useEffect(() => {
    sync.onRemote = (id, project) => {
      const before = current.current;
      const next = {
        ...before,
        projects: project
          ? before.projects.some((p) => p.id === id)
            ? before.projects.map((p) => (p.id === id ? project : p))
            : [...before.projects, project]
          : before.projects.filter((p) => p.id !== id),
      };
      current.current = next;
      setData(next);
    };
    return window.desktop?.projects.onChange((change) => sync.receive(change));
  }, [sync]);
  /** Projects go to the main process, everything else to IndexedDB; only what changed is saved. */
  const commit = useCallback(
    async (change: ChangeWorkspace, rollbackOnFailure = false) => {
      const before = current.current;
      const next = change(before);
      current.current = next;
      setData(next);
      setStatus('正在保存…');
      const version = ++revision.current;
      try {
        const prefs = preferences(next);
        await Promise.all([
          JSON.stringify(prefs) === JSON.stringify(preferences(before))
            ? undefined
            : savePreferences(prefs),
          sync.sync(before.projects, next.projects),
        ]);
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
    },
    [sync],
  );
  const update = useCallback(
    (change: ChangeWorkspace) => {
      void commit(change).catch(() => {});
    },
    [commit],
  );
  /** Holds a project's saves during a drag and saves its final state once when released. */
  const hold = useCallback(
    (id: string, held: boolean) => {
      void sync.hold(id, held).catch((error: unknown) => {
        setStatus('保存失败');
        setSaveError(error instanceof Error ? error.message : '保存失败');
      });
    },
    [sync],
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
    await sync.flushAll();
    await commit((value) => value);
  });
  return { data, update, commit, hold, getCurrent, status, saveError };
}
