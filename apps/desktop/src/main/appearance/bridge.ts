import { app, ipcMain, systemPreferences, type WebContents } from 'electron';
import { normalizeAccentColor } from '../../shared/appearance';

const trusted = new Map<number, { contents: WebContents; url: string }>();
export function trustAppearanceWindow(contents: WebContents, url: string) {
  trusted.set(contents.id, { contents, url: new URL(url).href });
  contents.once('destroyed', () => trusted.delete(contents.id));
}
function readAccentColor(): string | null {
  try {
    return normalizeAccentColor(systemPreferences.getAccentColor());
  } catch {
    return null;
  }
}
export function registerAppearance() {
  ipcMain.handle('appearance:accent', (event) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame?.url !== trusted.get(event.sender.id)?.url
    )
      throw new Error('外观请求来源不可信。');
    return readAccentColor();
  });
  const notify = () => {
    const color = readAccentColor();
    for (const { contents, url } of trusted.values())
      if (!contents.isDestroyed() && contents.getURL() === url)
        contents.send('appearance:accent-changed', color);
  };
  if (process.platform === 'darwin') {
    const id = systemPreferences.subscribeNotification(
      'AppleColorPreferencesChangedNotification',
      notify,
    );
    app.once('will-quit', () => systemPreferences.unsubscribeNotification(id));
  } else if (process.platform === 'win32') {
    systemPreferences.on('accent-color-changed', notify);
    app.once('will-quit', () => systemPreferences.removeListener('accent-color-changed', notify));
  }
}
