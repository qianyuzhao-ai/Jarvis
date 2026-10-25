import { ProgressField } from '@jarvis/ui/components/Progress';
import { Button } from '@jarvis/ui/components/Button';
import { Alert } from '@jarvis/ui/components/Alert';
import type { AppUpdates } from './use-app-updates';

export function UpdateStatus({
  updates,
  settings = false,
}: {
  updates: AppUpdates;
  settings?: boolean;
}) {
  const { state, error, run } = updates;
  const phase = state?.phase;
  if (!settings && !['available', 'downloading', 'downloaded', 'installing'].includes(phase || ''))
    return null;
  const message = !state
    ? '正在读取更新状态…'
    : phase === 'disabled'
      ? state.message
      : phase === 'checking'
        ? '正在检查更新…'
        : phase === 'available'
          ? `发现新版本 ${state.nextVersion}`
          : phase === 'downloading'
            ? `正在下载 ${state.nextVersion} · ${Math.floor(state.progress?.percent ?? 0)}%`
            : phase === 'downloaded'
              ? `${state.nextVersion} 已下载，等待重启安装`
              : phase === 'installing'
                ? '正在确认并保存内容，准备重启…'
                : state.error && state.errorAction === 'check'
                  ? '本次检查未完成'
                  : state.checkedAt
                    ? '当前已是最新版本'
                    : '尚未检查更新';
  const progress = phase === 'downloading' && (
    <ProgressField
      className="my-2"
      label="更新下载进度"
      value={state?.progress?.percent ?? 0}
      valueLabel={`${Math.floor(state?.progress?.percent ?? 0)}%`}
      hint={
        <>
          {((state?.progress?.transferred ?? 0) / 1048576).toFixed(1)} /{' '}
          {((state?.progress?.total ?? 0) / 1048576).toFixed(1)} MB ·{' '}
          {((state?.progress?.bytesPerSecond ?? 0) / 1048576).toFixed(1)} MB/s
        </>
      }
    />
  );
  if (!settings)
    return (
      <section className="shrink-0 border-b border-separator px-5 py-3" aria-label="更新提醒">
        <Alert
          title={message}
          action={
            phase === 'available' ? (
              <Button variant="secondary" size="sm" onClick={() => void run('download')}>
                {error && state?.errorAction === 'download' ? '重试下载' : '下载更新'}
              </Button>
            ) : phase === 'downloaded' ? (
              <Button
                variant="secondary"
                size="sm"
                data-update-install=""
                onClick={() => void run('install')}
              >
                重启并安装
              </Button>
            ) : undefined
          }
        >
          {progress}
          {error && (
            <p role="alert" className="mt-2 text-danger">
              {error}
            </p>
          )}
        </Alert>
      </section>
    );
  return (
    <section
      className="v1-update-settings border-t border-separator pt-6 text-body-relaxed text-fg-secondary"
      aria-label="应用更新"
      data-platform={window.desktop?.platform}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-2 text-title-3 text-fg">应用更新</h2>
          {state && <p>当前版本 {state.currentVersion} · 包含预发布版本</p>}
          <p role="status">{message}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={phase !== 'idle' && phase !== 'available'}
            onClick={() => void run('check')}
          >
            {phase === 'checking' ? '正在检查…' : '检查更新'}
          </Button>
          {phase === 'available' && (
            <Button variant="secondary" type="button" onClick={() => void run('download')}>
              {error && state?.errorAction === 'download' ? '重试下载' : '下载更新'}
            </Button>
          )}
          {phase === 'downloaded' && (
            <Button
              variant="secondary"
              data-update-install=""
              type="button"
              onClick={() => void run('install')}
            >
              重启并安装
            </Button>
          )}
        </div>
      </div>
      {progress}

      <p>启动后及每 4 小时自动检查。点击下载后显示进度，下载完成不会自动安装。</p>
      {state?.checkedAt && <p>上次成功检查：{new Date(state.checkedAt).toLocaleString()}</p>}
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
