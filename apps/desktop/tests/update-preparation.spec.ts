import { expect, test } from '@playwright/test';
import { InstallPreparation } from '../src/main/updates/preparation';

test('installation requires a fresh, single-use acknowledgement from the requesting window', async () => {
  const preparation = new InstallPreparation();
  let id = '';
  const waiting = preparation.request(1, (value) => {
    id = value;
  });
  expect(() => preparation.complete(2, { id, ready: true })).toThrow('来源不匹配');
  expect(() => preparation.complete(1, { id: 'stale', ready: true })).toThrow('过期');
  preparation.complete(1, { id, ready: true });
  await waiting;
  expect(() => preparation.complete(1, { id, ready: true })).toThrow('过期');
});
test('save failure, window loss and timeout reject installation', async () => {
  const preparation = new InstallPreparation();
  let id = '';
  const rejected = preparation.request(1, (value) => {
    id = value;
  });
  preparation.complete(1, { id, ready: false, error: '文档保存冲突' });
  await expect(rejected).rejects.toThrow('文档保存冲突');
  const closed = preparation.request(1, () => {});
  preparation.cancel(1);
  await expect(closed).rejects.toThrow('窗口已关闭');
  await expect(preparation.request(1, () => {}, 5)).rejects.toThrow('超时');
});
