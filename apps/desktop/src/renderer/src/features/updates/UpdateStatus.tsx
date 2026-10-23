import { ProgressField } from '@jarvis/ui/components/Progress';
import { Button } from '@jarvis/ui/components/Button';
import type { AppUpdates } from './use-app-updates';

export function UpdateStatus({
  updates,
  settings = false,
}: {
  updates: AppUpdates;
  settings?: boolean;
}) {
  const { state, error, run } = updates;
  const Action = settings ? Button : 'button';
  const actionProps = settings
    ? { variant: 'secondary' as const }
    : { className: 'secondary-button' };
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
  return (
    <section
      className={
        settings
          ? 'v1-update-settings border-t border-separator pt-6 text-body-relaxed text-fg-secondary'
          : 'update-notice'
      }
      aria-label={settings ? '应用更新' : '更新提醒'}
      data-platform={window.desktop?.platform}
    >
      <div className={settings ? 'flex items-start justify-between gap-4' : 'update-heading'}>
        <div>
          {settings && <h2 className="mb-2 text-title-3 text-fg">应用更新</h2>}
          {settings && state && <p>当前版本 {state.currentVersion} · 包含预发布版本</p>}
          <p role="status">{message}</p>
        </div>
        <div className={settings ? 'flex items-center gap-2' : 'update-actions'}>
          {settings && (
            <Action
              {...actionProps}
              type="button"
              disabled={phase !== 'idle' && phase !== 'available'}
              onClick={() => void run('check')}
            >
              {phase === 'checking' ? '正在检查…' : '检查更新'}
            </Action>
          )}
          {phase === 'available' && (
            <Action {...actionProps} type="button" onClick={() => void run('download')}>
              {error && state?.errorAction === 'download' ? '重试下载' : '下载更新'}
            </Action>
          )}
          {phase === 'downloaded' && (
            <Action
              {...actionProps}
              data-update-install=""
              type="button"
              onClick={() => void run('install')}
            >
              重启并安装
            </Action>
          )}
        </div>
      </div>
      {phase === 'downloading' && (
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
      )}
      {settings && <p>启动后及每 4 小时自动检查。点击下载后显示进度，下载完成不会自动安装。</p>}
      {settings && state?.checkedAt && (
        <p>上次成功检查：{new Date(state.checkedAt).toLocaleString()}</p>
      )}
      {error && (
        <p role="alert" className={settings ? 'mt-2 text-danger' : undefined}>
          {error}
        </p>
      )}
    </section>
  );
}
