import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { normalizeAccentColor, type AppearanceBridge } from '../src/shared/appearance';
import {
  applyAccentColor,
  subscribeAccentColor,
} from '../src/renderer/src/features/settings/appearance';

test('accent subscription rejects invalid colors, falls back and cannot apply stale results after cleanup', async () => {
  const values = new Map<string, string>();
  const root = {
    dataset: {} as DOMStringMap,
    style: {
      setProperty: (key: string, value: string | null) => {
        values.set(key, value ?? '');
      },
      removeProperty: (key: string) => {
        const value = values.get(key);
        values.delete(key);
        return value ?? '';
      },
    },
  };
  expect(normalizeAccentColor('AABBCCDD')).toBe('aabbccdd');
  expect(normalizeAccentColor('not-a-color')).toBeNull();
  let finish: (value: string | null) => void = () => {};
  let receive: (value: string | null) => void = () => {};
  let disposed = false;
  const bridge: AppearanceBridge = {
    getAccentColor: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    onAccentColor: (listener) => {
      receive = listener;
      return () => {
        disposed = true;
      };
    },
  };
  const stop = subscribeAccentColor(bridge, root);
  receive('aa33bbff');
  finish('000000ff');
  await Promise.resolve();
  expect(values.get('--color-accent')).toBe('#aa33bbff');
  stop();
  receive('112233ff');
  expect(disposed).toBe(true);
  expect(values.get('--color-accent')).toBe('#aa33bbff');
  applyAccentColor(root, 'invalid');
  expect(values.size).toBe(0);
  expect(root.dataset.systemAccent).toBeUndefined();
  const stopFailed = subscribeAccentColor(
    { ...bridge, getAccentColor: () => Promise.reject(new Error('unavailable')) },
    root,
  );
  await Promise.resolve();
  expect(values.size).toBe(0);
  stopFailed();
  subscribeAccentColor(undefined, root)();
});

test('appearance bridge reads, pushes, falls back, unsubscribes and tracks real window focus', async () => {
  const app = await electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId('theme-root')).toBeVisible();
    await app.evaluate(({ systemPreferences }) => {
      systemPreferences.getAccentColor = () => 'aa33bbff';
    });
    expect(await page.evaluate(() => window.desktop!.appearance.getAccentColor())).toBe('aa33bbff');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('appearance:accent-changed', 'aa33bbff');
    });
    await expect(page.locator('html')).toHaveCSS('--color-accent', '#aa33bbff');
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-accent-hover'),
      ),
    ).toContain('color-mix');
    await page.evaluate(() => {
      const stop = window.desktop!.appearance.onAccentColor(() => {
        document.documentElement.dataset.unsubscribedCalled = 'true';
      });
      stop();
    });
    await app.evaluate(({ BrowserWindow, systemPreferences }) => {
      systemPreferences.getAccentColor = () => {
        throw new Error('unavailable');
      };
      BrowserWindow.getAllWindows()[0]?.webContents.send('appearance:accent-changed', null);
    });
    expect(await page.evaluate(() => window.desktop!.appearance.getAccentColor())).toBeNull();
    await expect(page.locator('html')).not.toHaveAttribute('data-system-accent');
    await expect(page.locator('html')).not.toHaveAttribute('data-unsubscribed-called');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await app.evaluate(({ BrowserWindow }) => {
      const other = new BrowserWindow({ width: 300, height: 200, show: true });
      other.setTitle('Appearance focus target');
      other.focus();
    });
    await expect(page.locator('html')).toHaveAttribute('data-window-active', 'false');
    await app.evaluate(({ BrowserWindow, app }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Appearance focus target')
        ?.destroy();
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0]?.focus();
    });
    await expect(page.locator('html')).toHaveAttribute('data-window-active', 'true');
    const untrusted = await app.evaluate(async ({ BrowserWindow }) => {
      const window = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
      });
      try {
        await window.loadURL('about:blank');
        return await window.webContents.executeJavaScript(
          "require('electron').ipcRenderer.invoke('appearance:accent').then(() => false, () => true)",
        );
      } finally {
        window.destroy();
      }
    });
    expect(untrusted).toBe(true);
  } finally {
    await app.close();
  }
});
