import { useEffect, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
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
    <section className="download-settings" aria-labelledby="download-heading">
      <div>
        <h2 id="download-heading">下载</h2>
        <p>设置图像和视频的默认保存位置。</p>
      </div>
      <div className="download-directory-row">
        <div>
          <span>默认下载位置</span>
          <p className="download-directory" title={preferences?.directory || undefined}>
            {preferences?.directory || '尚未选择文件夹'}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
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
          {preferences?.directory ? '更改文件夹' : '选择文件夹'}
        </button>
      </div>
      <label className="download-dont-ask">
        <input
          type="checkbox"
          checked={preferences?.dontAskAgain ?? false}
          disabled={busy || !preferences?.directory}
          onChange={(event) => {
            const checked = event.target.checked;
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
        不再提醒，直接保存到默认位置
      </label>
      <p>未勾选时，每次下载仍会弹出保存位置选择框。设置即时保存。</p>
      {message && <p role={error ? 'alert' : 'status'}>{message}</p>}
      {!preferences && error && (
        <button type="button" className="secondary-button" onClick={() => setRetry((n) => n + 1)}>
          重试读取下载设置
        </button>
      )}
    </section>
  );
}
