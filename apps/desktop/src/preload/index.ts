import { contextBridge } from 'electron';
import type { DesktopInfo } from '../shared/desktop-info';

const desktop: DesktopInfo = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
  },
};

contextBridge.exposeInMainWorld('desktop', desktop);
