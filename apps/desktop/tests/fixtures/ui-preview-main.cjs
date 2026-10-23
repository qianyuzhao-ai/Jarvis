const { app, BrowserWindow } = require('electron');
const url = new URL(process.env.UI_PREVIEW_URL);
if (url.hostname !== '127.0.0.1') throw new Error('Preview must use loopback');
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.loadURL(url.href);
});
app.on('window-all-closed', () => app.quit());
