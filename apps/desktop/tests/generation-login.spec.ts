import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import {
  loginAddress,
  loginOrigins,
  platformLoginSchema,
  secureLoginHop,
} from '../src/shared/generation-login';

test('login configuration accepts explicit origins and rejects credentials, wildcards and unsafe schemes', () => {
  expect(loginAddress('sso.example.com').href).toBe('https://sso.example.com/');
  expect([
    ...loginOrigins(
      'https://api.example.com/api/mr/tasks',
      'https://platform.example.com/login',
      'sso.example.com\nhttps://identity.example.com',
    ),
  ]).toEqual([
    'https://api.example.com',
    'https://platform.example.com',
    'https://sso.example.com',
    'https://identity.example.com',
  ]);
  for (const loginUrl of [
    'file:///tmp/test',
    'javascript:alert(1)',
    'http://platform.example.com',
    'https://name:password@example.com',
    'https://example.com/?ticket=secret',
  ])
    expect(
      platformLoginSchema.safeParse({
        generateUrl: 'https://api.example.com/tasks',
        loginUrl,
        loginDomains: '',
      }).success,
    ).toBe(false);
  expect(() =>
    loginOrigins('https://api.example.com/tasks', 'https://platform.example.com', '*.example.com'),
  ).toThrow();
  expect(() =>
    loginOrigins(
      'https://api.example.com/tasks',
      'https://platform.example.com',
      'sso.example.com/path',
    ),
  ).toThrow();
  const origins = loginOrigins(
    'https://api.example.com/tasks',
    'https://platform.example.com',
    'sso.example.com',
  );
  expect(secureLoginHop('http://platform.example.com/cb?ticket=t', origins)).toBe(
    'https://platform.example.com/cb?ticket=t',
  );
  expect(secureLoginHop('http://other.example.com/', origins)).toBeUndefined();
  expect(secureLoginHop('http://platform.example.com:8080/', origins)).toBeUndefined();
  expect(secureLoginHop('http://user:pw@platform.example.com/', origins)).toBeUndefined();
  expect(secureLoginHop('https://other.example.com/', origins)).toBeUndefined();
});

test('SSO login is isolated, supplies task cookies, pauses on expiration and resumes without resubmitting', async () => {
  test.setTimeout(100_000);
  let expired = false;
  let complete = false;
  let ssoVisits = 0;
  const cookie = 'session_token=mock-secret-cookie';
  const calls: { method: string; path: string; cookie: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, base);
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    if (url.pathname === '/portal') {
      res.writeHead(302, { Location: `${sso}/sso` });
      res.end();
      return;
    }
    if (url.pathname === '/sso') {
      ssoVisits++;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        `<iframe hidden src="${hidden}/hidden-auth"></iframe>` +
          '<form action="/sso-login" method="post"><button>模拟统一登录</button></form>',
      );
      return;
    }
    if (url.pathname === '/sso-login') {
      res.writeHead(302, { Location: `${base}/callback?ticket=mock-ticket` });
      res.end();
      return;
    }
    if (url.pathname === '/callback') {
      expired = false;
      res.setHeader('Set-Cookie', `${cookie}; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<h1>登录完成</h1>');
      return;
    }
    calls.push({ method: req.method!, path: url.pathname, cookie: req.headers.cookie ?? '', body });
    if (expired || !req.headers.cookie?.includes(cookie)) {
      res.writeHead(302, { Location: `${sso}/sso?ticket=should-not-follow` });
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (url.pathname.endsWith('/model-quota'))
      res.end(JSON.stringify({ granted: true, items: [] }));
    else if (url.pathname === '/upload')
      res.end(JSON.stringify({ files: [{ url: `${base}/uploaded.png` }] }));
    else if (req.method === 'POST')
      res.end(JSON.stringify({ task_id: 'logged-in-task', status: 'pending' }));
    else
      res.end(
        JSON.stringify({
          task_id: 'logged-in-task',
          status: complete ? 'success' : 'running',
          response: complete
            ? {
                request_id: 'logged-in-task',
                result: { status: 'success', content: [`${base}/result.png`] },
              }
            : null,
        }),
      );
  });
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const base = `http://127.0.0.1:${address.port}`;
  const sso = `http://localhost:${address.port}`;
  // An unlisted loopback origin standing in for SSO pages' hidden auth iframes.
  const hidden = `http://127.0.0.2:${address.port}`;
  // A second listed domain, like a zero-trust gateway callback.
  const gateway = 'https://gateway.example.com';
  const endpoint = `${base}/api/mr/tasks`;
  const profile = test.info().outputPath('profile');
  const launch = () =>
    electron.launch({
      args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${profile}`],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] =>
            entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
        ),
      ),
    });
  let app: ElectronApplication | undefined;
  async function settings(page: Page) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
  }
  async function signIn(page: Page) {
    const opened = app!.waitForEvent('window');
    await page.getByRole('button', { name: '登录生成平台', exact: true }).click();
    const login = await opened;
    await expect(login).toHaveURL(`${sso}/sso`);
    await expect(login.getByRole('button', { name: '模拟统一登录' })).toBeVisible();
    expect(
      await login.evaluate(() => ({ desktop: 'desktop' in window, node: 'require' in window })),
    ).toEqual({ desktop: false, node: false });
    await login.getByRole('button', { name: '模拟统一登录' }).click();
    await expect(login.getByRole('heading', { name: '登录完成' })).toBeVisible();
    expect(calls.some((call) => call.path === '/hidden-auth')).toBe(false);
    await login.evaluate(() => window.open('https://example.invalid/blocked'));
    expect(app!.windows()).toHaveLength(2);
    await login.close();
    await expect(page.getByText('平台连接已验证', { exact: true })).toBeVisible();
  }
  try {
    app = await launch();
    let page = await app.firstWindow();
    await settings(page);
    await page.getByLabel('req_from', { exact: true }).fill('test');
    await page.getByLabel('生成任务地址', { exact: true }).fill(endpoint);
    await page.getByLabel('平台登录地址', { exact: true }).fill(`${base}/portal`);
    await expect(page.getByRole('button', { name: '登录生成平台', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '保存更改' }).click();
    await page.getByRole('button', { name: '登录生成平台', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('未配置的域名');
    expect(ssoVisits).toBe(0);
    await page.getByRole('button', { name: '验证连接', exact: true }).click();
    await expect(
      page.getByText(`上次登录未完成，登录跳转到未配置的域名 ${sso}`, { exact: false }),
    ).toBeVisible();
    await page.getByLabel('允许的统一登录域名', { exact: true }).fill(`${sso}\n${gateway}`);
    const domains = page.getByLabel('允许的统一登录域名', { exact: true });
    expect(
      await domains.evaluate(
        (node) => node.clientHeight >= 2 * Number.parseFloat(getComputedStyle(node).lineHeight),
      ),
    ).toBe(true);
    await page.getByRole('button', { name: '保存更改' }).click();
    await signIn(page);
    await page.screenshot({ path: test.info().outputPath('platform-login-light.png') });
    const defaultCookies = await app.evaluate(
      async ({ session }, endpoint) =>
        (await session.defaultSession.cookies.get({ url: endpoint })).length,
      endpoint,
    );
    expect(defaultCookies).toBe(0);
    const uploadImage = () =>
      page.evaluate(
        (base) =>
          window.desktop!.generation.upload({
            requestId: crypto.randomUUID(),
            projectId: crypto.randomUUID(),
            nodeId: crypto.randomUUID(),
            settings: {
              reqFrom: 'test',
              generateUrl: `${base}/api/mr/tasks`,
              imageUploadUrl: `${base}/upload`,
              audioUploadUrl: `${base}/upload-media`,
            },
            file: {
              name: 'cat.png',
              mime: 'image/png',
              kind: 'image',
              bytes: new Uint8Array([137, 80, 78, 71]),
            },
          }),
        base,
      );
    expect(await uploadImage()).toEqual({ ok: true, value: { url: `${base}/uploaded.png` } });
    const uploadCall = calls.find((call) => call.path === '/upload')!;
    expect(uploadCall.cookie).toContain(cookie);
    expect(uploadCall.body).toContain('name="req_from"');
    expect(uploadCall.body).toContain('filename="cat.png"');
    const requestId = await page.evaluate(async (endpoint) => {
      const requestId = crypto.randomUUID();
      const result = await window.desktop!.generation.start({
        requestId,
        projectId: crypto.randomUUID(),
        nodeId: crypto.randomUUID(),
        settings: {
          reqFrom: 'test',
          generateUrl: endpoint,
          imageUploadUrl: '',
          audioUploadUrl: '',
        },
        input: {
          kind: 'image',
          model: 'gpt-image-2',
          prompt: 'a cat',
          size: '3:2',
          quality: 'high',
          resolution: '1080p',
          duration: 5,
          generateAudio: true,
          imageList: [],
          videoList: [],
          audioList: [],
        },
      });
      if (!result.ok) throw new Error(result.error);
      return requestId;
    }, endpoint);
    await expect
      .poll(() => calls.filter((call) => call.method === 'POST' && call.path !== '/upload').length)
      .toBe(1);
    expect(
      calls.find((call) => call.method === 'POST' && call.path !== '/upload')?.cookie,
    ).toContain(cookie);
    expired = true;
    expect(
      await page.evaluate(
        (endpoint) => window.desktop!.generation.verifyPlatformLogin(endpoint),
        endpoint,
      ),
    ).toMatchObject({ ok: true, value: { state: 'expired' } });
    const expiredUpload = await uploadImage();
    expect(expiredUpload.ok).toBe(false);
    expect(expiredUpload.ok ? '' : expiredUpload.error).toContain('平台要求登录');
    const getJob = () => page.evaluate((id) => window.desktop!.generation.get(id), requestId);
    await expect
      .poll(
        async () => {
          const r = await getJob();
          return r.ok && r.value?.authRequired;
        },
        { timeout: 12_000 },
      )
      .toBe(true);
    const stoppedAt = calls.length;
    await new Promise((resolve) => setTimeout(resolve, 5500));
    expect(calls.length).toBe(stoppedAt);
    expect(ssoVisits).toBe(1);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await settings(page);
    expect(await getJob()).toMatchObject({
      ok: true,
      value: { status: 'running', authRequired: true },
    });
    complete = true;
    await signIn(page);
    await expect
      .poll(
        async () => {
          const r = await getJob();
          return r.ok && r.value?.status;
        },
        { timeout: 12_000 },
      )
      .toBe('succeeded');
    expect(calls.filter((call) => call.method === 'POST' && call.path !== '/upload')).toHaveLength(
      1,
    );
    expect(JSON.stringify(await getJob())).not.toContain('mock-secret-cookie');
    expect(await readFile(resolve(profile, 'generation-jobs.json'), 'utf8')).not.toContain(
      'mock-secret-cookie',
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await settings(page);
    await expect(page.getByLabel('平台登录地址', { exact: true })).toHaveValue(`${base}/portal`);
    await expect(page.getByLabel('允许的统一登录域名', { exact: true })).toHaveValue(
      `${sso}\n${gateway}`,
    );
    await page.getByRole('button', { name: '验证连接', exact: true }).click();
    await expect(page.getByText('平台连接已验证', { exact: true })).toBeVisible();
    const otherOrigin = await page.evaluate(
      (endpoint) => window.desktop!.generation.verifyPlatformLogin(endpoint),
      `${sso}/api/mr/tasks`,
    );
    expect(otherOrigin).toMatchObject({ ok: true, value: { state: 'expired' } });
    expect(calls.at(-1)?.cookie).toBe('');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: test.info().outputPath('platform-login-dark.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    await page.getByRole('button', { name: '登录生成平台', exact: true }).scrollIntoViewIfNeeded();
    expect(
      await page
        .getByTestId('settings-form')
        .evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBe(0);
    await page.screenshot({ path: test.info().outputPath('platform-login-compact.png') });
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    // After a blocked subframe navigation, Chromium's clearStorageData takes about 5s on Windows.
    await expect(page.getByText('已退出本应用中的平台登录', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: '验证连接', exact: true }).click();
    await expect(
      page.getByText('平台要求登录或账号无权限，请完成统一登录后重试', { exact: true }),
    ).toBeVisible();
  } finally {
    await app?.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
