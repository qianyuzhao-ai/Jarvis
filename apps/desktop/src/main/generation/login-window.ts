import { BrowserWindow, type Session } from 'electron';
import { secureLoginHop } from '../../shared/generation-login';

export function createLoginWindow(
  owner: BrowserWindow,
  session: Session,
  address: string,
  origins: Set<string>,
) {
  const window = new BrowserWindow({
    parent: owner,
    width: 1000,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    title: '登录生成平台 · 完成登录后关闭此窗口',
    webPreferences: {
      session,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });
  let failure = '';
  const children = new Set<BrowserWindow>();
  function permitted(value: string) {
    try {
      const url = new URL(value);
      return !url.username && !url.password && origins.has(url.origin);
    } catch {
      return false;
    }
  }
  function blocked(value: string) {
    let origin = '未知地址';
    try {
      origin = new URL(value).origin;
    } catch {
      /* Never display a callback ticket. */
    }
    failure = `登录跳转到未配置的域名 ${origin}，请将该域名加入设置后重新登录`;
    window.close();
  }
  function guard(target: BrowserWindow) {
    function reject(event: Electron.Event, url: string, isMainFrame: boolean) {
      event.preventDefault();
      // SSO pages embed hidden auth iframes; block those quietly instead of ending the login.
      if (!isMainFrame) return;
      const secure = secureLoginHop(url, origins);
      if (secure) void target.webContents.loadURL(secure).catch(() => undefined);
      else blocked(url);
    }
    target.webContents.on('will-frame-navigate', (event) => {
      if (!permitted(event.url)) reject(event, event.url, event.isMainFrame);
    });
    target.webContents.on('will-redirect', (event) => {
      if (!permitted(event.url)) reject(event, event.url, event.isMainFrame);
    });
    target.webContents.on('will-attach-webview', (event) => event.preventDefault());
    target.webContents.on('page-title-updated', (event) => event.preventDefault());
    target.webContents.setWindowOpenHandler(({ url }) =>
      permitted(url)
        ? {
            action: 'allow',
            overrideBrowserWindowOptions: {
              parent: window,
              title: '登录生成平台',
              webPreferences: {
                session,
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                webSecurity: true,
                webviewTag: false,
              },
            },
          }
        : { action: 'deny' },
    );
    target.webContents.on('did-create-window', (child) => {
      children.add(child);
      guard(child);
      child.once('closed', () => children.delete(child));
    });
  }
  guard(window);
  const closeWithOwner = () => {
    if (!window.isDestroyed()) window.close();
  };
  owner.once('closed', closeWithOwner);
  const closed = new Promise<void>((resolve, reject) => {
    window.once('closed', () => {
      owner.removeListener('closed', closeWithOwner);
      for (const child of children) if (!child.isDestroyed()) child.close();
      if (failure) reject(new Error(failure));
      else resolve();
    });
  });
  void window.loadURL(address).catch(() => {
    if (window.isDestroyed()) return;
    failure ||= '无法加载登录页面，请检查内网连接和登录地址';
    window.close();
  });
  return { window, closed };
}
