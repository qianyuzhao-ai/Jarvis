import { useCallback, useEffect, useState } from 'react';
import type { UpdateResult, UpdateState } from '../../../../shared/updates';
import { prepareUpdate } from './use-update-guard';

export function useAppUpdates() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [error, setError] = useState('');
  const accept = useCallback((next: UpdateState) => {
    setState((current) => (!current || next.revision >= current.revision ? next : current));
  }, []);
  useEffect(() => {
    const bridge = window.desktop?.updates;
    if (!bridge) {
      setError('更新接口尚未加载，请完全退出后重新打开应用。');
      return;
    }
    let active = true;
    const unsubscribe = bridge.onState((next) => {
      if (active) accept(next);
    });
    const stopPreparing = bridge.onPrepareInstall((id) => {
      void (async () => {
        try {
          await prepareUpdate();
          const response = await bridge.completePreparation({ id, ready: true });
          if (!response.ok) throw new Error(response.error);
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : '内容保存失败，未启动安装。';
          await bridge
            .completePreparation({ id, ready: false, error: message.slice(0, 500) })
            .catch(() => {});
          if (active) setError(message);
        }
      })();
    });
    void bridge
      .getState()
      .then((response) => {
        if (!active) return;
        if (response.ok) accept(response.value);
        else setError(response.error);
      })
      .catch(() => {
        if (active) setError('无法读取更新状态，请重新打开应用。');
      });
    return () => {
      active = false;
      unsubscribe();
      stopPreparing();
    };
  }, [accept]);
  const run = useCallback(
    async (action: 'check' | 'download' | 'install') => {
      const region = document.activeElement?.closest('section[aria-label]');
      setError('');
      try {
        const bridge = window.desktop?.updates;
        if (!bridge) throw new Error('更新接口尚未加载，请重新打开应用。');
        const response: UpdateResult = await bridge[action]();
        if (!response.ok) throw new Error(response.error);
        accept(response.value);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : '更新操作失败，请重试。');
      } finally {
        if (action === 'install')
          requestAnimationFrame(() =>
            region?.querySelector<HTMLButtonElement>('[data-update-install]')?.focus(),
          );
      }
    },
    [accept],
  );
  return { state, error: error || state?.error || '', run };
}
export type AppUpdates = ReturnType<typeof useAppUpdates>;
