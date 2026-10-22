import { createHash } from 'node:crypto';
import { BrowserWindow, session, type Session } from 'electron';
import { httpUrl } from '../../shared/generation';
import {
  loginAddress,
  loginOrigins,
  type PlatformLogin,
  type PlatformLoginStatus,
} from '../../shared/generation-login';
import { getQuota, type TaskFetch } from './task-protocol';
import { createLoginWindow } from './login-window';
import { ServiceError } from './protocol';

export class GenerationSessions {
  private sessions = new Map<string, Session>();
  private windows = new Map<string, BrowserWindow>();
  private states = new Map<string, PlatformLoginStatus>();
  constructor(private readonly authenticated: (origin: string) => Promise<void>) {}
  get isBusy() {
    return this.windows.size > 0;
  }
  private getSession(endpoint: string) {
    const origin = new URL(httpUrl.parse(endpoint)).origin;
    let current = this.sessions.get(origin);
    if (!current) {
      const id = createHash('sha256').update(origin).digest('hex');
      current = session.fromPartition(`persist:generation-${id}`);
      current.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      current.setPermissionCheckHandler(() => false);
      current.on('will-download', (event) => event.preventDefault());
      this.sessions.set(origin, current);
    }
    return { origin, current };
  }
  readonly fetch: TaskFetch = async (url, init) => {
    const { origin, current } = this.getSession(url);
    let response: Awaited<ReturnType<Session['fetch']>>;
    try {
      const options = {
        ...init,
        credentials: 'include' as const,
        cache: 'no-store' as const,
        headers: { ...init.headers, Origin: origin, Referer: `${origin}/` },
      };
      response = await current.fetch(url, options);
    } catch (error) {
      // Electron rejects manual redirects instead of returning a 3xx Response.
      if (error instanceof Error && error.message === 'Redirect was cancelled') {
        this.states.set(origin, {
          state: 'expired',
          message: '平台要求登录，请重新登录并验证连接',
        });
        throw new ServiceError('平台要求登录，请在设置中登录生成平台并验证连接', {
          cause: error,
          authRequired: true,
          unknown: init.method === 'POST',
        });
      }
      throw error;
    }
    if (
      [401, 403].includes(response.status) ||
      (response.status >= 300 && response.status < 400) ||
      (response.ok && response.headers.get('content-type')?.includes('text/html'))
    )
      this.states.set(origin, { state: 'expired', message: '需要重新登录或检查账号访问权限' });
    return response;
  };
  async status(endpoint: string): Promise<PlatformLoginStatus> {
    const { origin, current } = this.getSession(endpoint);
    if (this.windows.has(origin))
      return { state: 'open', message: '登录窗口已打开，请完成登录后关闭窗口' };
    const state = this.states.get(origin);
    if (state) return state;
    const cookies = await current.cookies.get({ url: endpoint });
    return cookies.length
      ? { state: 'unverified', message: '已有平台会话，请验证连接' }
      : { state: 'empty', message: '尚未登录生成平台' };
  }
  async verify(endpoint: string): Promise<PlatformLoginStatus> {
    const { origin } = this.getSession(endpoint);
    let result: PlatformLoginStatus;
    try {
      await getQuota(endpoint, 'seedance', this.fetch);
      await this.authenticated(origin);
      result = { state: 'verified', message: '平台连接已验证' };
    } catch (error) {
      result = {
        state: error instanceof ServiceError && error.authRequired ? 'expired' : 'unverified',
        message:
          error instanceof ServiceError && error.authRequired
            ? '平台要求登录或账号无权限，请完成统一登录后重试'
            : '暂时无法验证平台连接，请检查内网连接后重试',
      };
    }
    this.states.set(origin, result);
    return result;
  }
  async open(config: PlatformLogin, owner: BrowserWindow): Promise<PlatformLoginStatus> {
    const origins = loginOrigins(config.generateUrl, config.loginUrl, config.loginDomains);
    const { origin, current } = this.getSession(config.generateUrl);
    const existing = this.windows.get(origin);
    if (existing) {
      existing.focus();
      return this.status(config.generateUrl);
    }
    const login = createLoginWindow(owner, current, loginAddress(config.loginUrl).href, origins);
    this.windows.set(origin, login.window);
    try {
      await login.closed;
      await current.cookies.flushStore();
    } finally {
      this.windows.delete(origin);
      this.states.delete(origin);
    }
    return this.verify(config.generateUrl);
  }
  async logout(endpoint: string): Promise<PlatformLoginStatus> {
    const { origin, current } = this.getSession(endpoint);
    if (this.windows.has(origin)) throw new Error('请先关闭登录窗口');
    await current.clearStorageData();
    await current.clearCache();
    await current.clearAuthCache();
    await current.cookies.flushStore();
    const result: PlatformLoginStatus = { state: 'empty', message: '已退出本应用中的平台登录' };
    this.states.set(origin, result);
    return result;
  }
}
