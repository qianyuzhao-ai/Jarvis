import { expect, test } from '@playwright/test';
import { UpdateService, type UpdateBackend, type UpdateEvent } from '../src/main/updates/service';

class Backend implements UpdateBackend {
  checks = 0;
  downloads = 0;
  installs = 0;
  listener: (event: UpdateEvent) => void = () => {};
  async check() {
    this.checks++;
  }
  async download() {
    this.downloads++;
  }
  quitAndInstall() {
    this.installs++;
  }
  subscribe(listener: (event: UpdateEvent) => void) {
    this.listener = listener;
    return () => {
      this.listener = () => {};
    };
  }
}

test('checks are single flight, report current version, and recover after a network failure', async () => {
  const backend = new Backend();
  const service = new UpdateService(backend, '0.1.8');
  await Promise.all([service.check(), service.check()]);
  expect(backend.checks).toBe(1);
  backend.listener({ type: 'error', message: '网络连接失败' });
  expect(service.snapshot()).toMatchObject({ phase: 'idle', error: '网络连接失败' });
  await service.check();
  backend.listener({ type: 'current' });
  expect(service.snapshot()).toMatchObject({ phase: 'idle', error: undefined });
  expect(service.snapshot().checkedAt).toBeGreaterThan(0);
  service.dispose();
});

test('downloads require user action and show bounded real progress without duplicate downloads', async () => {
  const backend = new Backend();
  const service = new UpdateService(backend, '0.1.8');
  await service.download();
  expect(backend.downloads).toBe(0);
  await service.check();
  backend.listener({ type: 'available', version: '0.1.9' });
  expect(backend.downloads).toBe(0);
  await Promise.all([service.download(), service.download()]);
  expect(backend.downloads).toBe(1);
  backend.listener({
    type: 'progress',
    progress: { percent: 40, transferred: 40, total: 100, bytesPerSecond: 10 },
  });
  expect(service.snapshot().progress?.percent).toBe(40);
  backend.listener({
    type: 'progress',
    progress: { percent: Number.NaN, transferred: 0, total: 0, bytesPerSecond: 0 },
  });
  expect(service.snapshot().progress?.percent).toBe(40);
  backend.listener({ type: 'downloaded' });
  expect(service.snapshot().phase).toBe('downloaded');
  expect(backend.installs).toBe(0);
  await service.check();
  expect(backend.checks).toBe(1);
  service.dispose();
});

test('failed download retains the available version for a deliberate retry', async () => {
  const backend = new Backend();
  const service = new UpdateService(backend, '0.1.8');
  await service.check();
  backend.listener({ type: 'available', version: '0.1.9' });
  await service.download();
  backend.listener({ type: 'error', message: '安装包校验失败' });
  expect(service.snapshot()).toMatchObject({
    phase: 'available',
    nextVersion: '0.1.9',
    error: '安装包校验失败',
  });
  await service.download();
  expect(backend.downloads).toBe(2);
  service.dispose();
});

test('installation requires a downloaded update, restores on cancellation or save failure, and runs once', async () => {
  const backend = new Backend();
  const service = new UpdateService(backend, '0.1.8');
  let installs = 0;
  await service.install(async () => {
    installs++;
    return true;
  });
  expect(installs).toBe(0);
  await service.check();
  backend.listener({ type: 'available', version: '0.1.9' });
  await service.download();
  backend.listener({ type: 'downloaded' });
  await service.install(async () => false);
  expect(service.snapshot().phase).toBe('downloaded');
  await service.install(async () => {
    throw new Error('文档保存冲突');
  });
  expect(service.snapshot()).toMatchObject({ phase: 'downloaded', error: '文档保存冲突' });
  await Promise.all([
    service.install(async () => {
      installs++;
      return true;
    }),
    service.install(async () => {
      installs++;
      return true;
    }),
  ]);
  expect(installs).toBe(1);
  expect(service.snapshot().phase).toBe('installing');
  service.dispose();
});

test('automatic checks run after startup and periodically, and stop on disposal', async () => {
  const backend = new Backend();
  backend.check = async () => {
    backend.checks++;
    backend.listener({ type: 'current' });
  };
  const service = new UpdateService(backend, '0.1.8');
  service.startAutomaticChecks(5, 30);
  await expect.poll(() => backend.checks).toBeGreaterThanOrEqual(2);
  service.dispose();
  const count = backend.checks;
  await new Promise((resolve) => setTimeout(resolve, 70));
  expect(backend.checks).toBe(count);
  const disabled = new UpdateService(backend, '0.1.8', '开发模式');
  disabled.startAutomaticChecks(1, 10);
  await disabled.check();
  await disabled.download();
  expect(disabled.snapshot().phase).toBe('disabled');
  expect(backend.checks).toBe(count);
  disabled.dispose();
});

test('installer backend failure invalidates the ready state and permits a fresh download', async () => {
  const backend = new Backend();
  const service = new UpdateService(backend, '0.1.8');
  await service.check();
  backend.listener({ type: 'available', version: '0.1.9' });
  await service.download();
  backend.listener({ type: 'downloaded' });
  await service.install(async () => {
    backend.listener({ type: 'error', message: '签名校验失败，请重试下载' });
    return true;
  });
  expect(service.snapshot()).toMatchObject({ phase: 'available', errorAction: 'download' });
  await service.download();
  expect(backend.downloads).toBe(2);
  service.dispose();
});
