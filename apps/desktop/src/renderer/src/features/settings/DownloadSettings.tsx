import { Button } from '@jarvis/ui/components/Button';
import { Checkbox } from '@jarvis/ui/components/Checkbox';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderOpen } from '@jarvis/ui/icons';
import type { DownloadPreferences } from '../../../../shared/generation';

export function DownloadSettings() {
  const [preferences, setPreferences] = useState<DownloadPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        const generation = window.desktop?.generation;
        if (typeof generation?.getDownloadPreferences !== 'function')
          throw new Error('下载接口尚未加载，请完全退出应用并重新运行 pnpm dev');
        return generation.getDownloadPreferences();
      })
      .then(
        (response) => {
          if (!active) return;
          if (response.ok) {
            setPreferences(response.value);
            setError(false);
            setMessage('');
          } else {
            setError(true);
            setMessage(response.error);
          }
        },
        (failure: unknown) => {
          if (active) {
            setError(true);
            const message = failure instanceof Error ? failure.message : '无法读取下载设置，请重试';
            setMessage(
              message.includes('No handler registered')
                ? '下载接口尚未加载，请完全退出应用并重新运行 pnpm dev'
                : message,
            );
          }
        },
      );
    return () => {
      active = false;
    };
  }, [retry]);
  async function update(
    action: () => Promise<DownloadPreferences | null>,
    optimistic?: DownloadPreferences,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    setError(false);
    const previous = preferences;
    if (optimistic) setPreferences(optimistic);
    try {
      const next = await action();
      if (next) {
        setPreferences(next);
        setMessage('下载设置已保存');
      } else setMessage('已取消选择');
    } catch (failure) {
      if (optimistic) setPreferences(previous);
      setError(true);
      setMessage(failure instanceof Error ? failure.message : '保存失败，请重试');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-2" aria-labelledby="download-heading">
      <div className="flex min-h-13 items-center justify-between gap-4 border-b border-separator pb-3">
        <h2 id="download-heading" className="text-body">
          默认下载位置
        </h2>
        <Button
          variant="ghost"
          type="button"
          className="min-w-0 max-w-3/5"
          aria-label={preferences?.directory ? '更改文件夹' : '选择文件夹'}
          title={preferences?.directory || '选择文件夹'}
          disabled={busy || !preferences}
          onClick={() =>
            void update(async () => {
              const response = await window.desktop!.generation.chooseDownloadDirectory();
              if (!response.ok) throw new Error(response.error);
              return response.value.canceled ? null : response.value.preferences;
            })
          }
        >
          <FolderOpen size={16} />
          <span data-testid="download-directory" className="min-w-0 truncate">
            {preferences?.directory || '选择文件夹'}
          </span>
          <ChevronDown size={14} />
        </Button>
      </div>
      <div className="flex min-h-9 items-center justify-end">
        <Checkbox
          label="下载时不再询问"
          checked={preferences?.dontAskAgain ?? false}
          disabled={busy || !preferences?.directory}
          onCheckedChange={(value) => {
            const checked = value === true;
            void update(
              async () => {
                const response = await window.desktop!.generation.setDownloadDontAsk(checked);
                if (!response.ok) throw new Error(response.error);
                return response.value;
              },
              preferences ? { ...preferences, dontAskAgain: checked } : undefined,
            );
          }}
        />
      </div>
      {message && (
        <p
          role={error ? 'alert' : 'status'}
          className={error ? 'text-subheadline text-danger' : 'text-subheadline text-fg-secondary'}
        >
          {message}
        </p>
      )}
      {!preferences && error && (
        <Button variant="ghost" type="button" onClick={() => setRetry((n) => n + 1)}>
          重试读取下载设置
        </Button>
      )}
    </section>
  );
}
