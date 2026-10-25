import { registerAppearance, trustAppearanceWindow } from './appearance/bridge';
import { app, BrowserWindow, Menu, session, protocol } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { registerGeneration, trustGenerationWindow } from './generation/bridge';
import { registerWriting, trustWritingWindow } from './writing/bridge';
import { registerAgent, trustAgentWindow } from './agent/bridge';
import { registerProjects, trustProjectsWindow } from './projects/bridge';
import { registerUpdates, trustUpdateWindow, isUpdateInstalling } from './updates/bridge';
export { configureUpdates } from './updates/bridge';
export { createElectronBackend } from './updates/backend';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'jarvis-media',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
app.setName('Jarvis');

const appIcon = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(import.meta.dirname, '../../resources/icon.png');

function reportStartupError(error: unknown): void {
  console.error('Jarvis failed to start:', error);
  app.exit(1);
}

async function createWindow(): Promise<void> {
  const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  if (developmentUrl && new URL(developmentUrl).origin !== 'http://127.0.0.1:5173') {
    throw new Error('The development renderer must use http://127.0.0.1:5173');
  }

  const rendererFile = join(import.meta.dirname, '../renderer/index.html');
  const trustedUrl = developmentUrl ?? pathToFileURL(rendererFile).href;
  const window = new BrowserWindow({
    title: 'Jarvis',
    icon: appIcon,
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f0f1f2',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 16 },
          vibrancy: 'sidebar' as const,
          visualEffectState: 'followWindow' as const,
        }
      : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });

  trustAppearanceWindow(window.webContents, trustedUrl);
  trustGenerationWindow(window.webContents, trustedUrl);
  trustWritingWindow(window.webContents, trustedUrl);
  trustAgentWindow(window.webContents, trustedUrl);
  trustProjectsWindow(window.webContents, trustedUrl);
  trustUpdateWindow(window.webContents, trustedUrl);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== trustedUrl) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());

  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(rendererFile);
  }
}

void app
  .whenReady()
  .then(async () => {
    if (!app.isPackaged && process.platform === 'darwin') {
      app.dock?.setIcon(appIcon);
    }
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
      ]),
    );

    await registerGeneration(join(app.getPath('userData'), 'generation-jobs.json'));
    await registerWriting();
    await registerAgent();
    await registerProjects();
    registerUpdates(createWindow);
    registerAppearance();
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow().catch(reportStartupError);
      }
    });
  })
  .catch(reportStartupError);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isUpdateInstalling()) app.quit();
});
