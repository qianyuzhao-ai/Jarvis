import { Button } from '@jarvis/ui/components/Button';
import { useEffect, useRef, useState } from 'react';
import { httpUrl } from '../../../../shared/generation';
import type { PlatformLoginStatus } from '../../../../shared/generation-login';
import type { Settings } from './types';

export function PlatformLoginControls({ settings, dirty }: { settings: Settings; dirty: boolean }) {
  const [status, setStatus] = useState<PlatformLoginStatus>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const validEndpoint = httpUrl.safeParse(settings.generateUrl).success;
  useEffect(() => {
    const version = ++revision.current;
    setStatus(undefined);
    setError('');
    setBusy(false);
    const bridge = window.desktop?.generation;
    if (!bridge) {
      setError('平台登录接口不可用，请重新打开应用');
      return;
    }
    if (validEndpoint)
      void bridge
        .getPlatformLogin(settings.generateUrl)
        .then((result) => {
          if (version !== revision.current) return;
          if (result.ok) setStatus(result.value);
          else setError(result.error);
        })
        .catch(() => {
          if (version === revision.current) setError('无法读取平台登录状态，请重新打开应用');
        });
    return () => {
      revision.current++;
    };
  }, [settings.generateUrl, validEndpoint]);
  async function act(action: 'open' | 'verify' | 'logout') {
    const version = ++revision.current;
    setBusy(true);
    setError('');
    try {
      const bridge = window.desktop?.generation;
      if (!bridge) throw new Error('平台登录接口不可用');
      const result = await (action === 'open'
        ? bridge.openPlatformLogin({
            generateUrl: settings.generateUrl,
            loginUrl: settings.loginUrl ?? '',
            loginDomains: settings.loginDomains ?? '',
          })
        : action === 'verify'
          ? bridge.verifyPlatformLogin(settings.generateUrl)
          : bridge.logoutPlatform(settings.generateUrl));
      if (version !== revision.current) return;
      if (result.ok) setStatus(result.value);
      else setError(result.error);
    } catch {
      if (version === revision.current) setError('平台登录操作失败，请重试');
    } finally {
      if (version === revision.current) setBusy(false);
    }
  }
  return (
    <div className="v1-login-row grid items-start gap-4 border-b border-separator py-3">
      <span className="v1-login-label text-body">平台登录</span>
      <div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={dirty || busy || !validEndpoint || !settings.loginUrl}
            onClick={() => void act('open')}
          >
            登录生成平台
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={dirty || busy || !validEndpoint}
            onClick={() => void act('verify')}
          >
            验证连接
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={dirty || busy || !validEndpoint || status?.state === 'empty'}
            onClick={() => void act('logout')}
          >
            退出登录
          </Button>
        </div>
        <p role="status" className="mt-2 text-body-relaxed text-fg-secondary">
          {dirty
            ? '请先保存更改，再登录平台'
            : busy
              ? '正在处理，请完成登录后关闭登录窗口…'
              : (status?.message ?? '尚未检查登录状态')}
        </p>
        {error && (
          <p className="mt-2 text-subheadline text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
