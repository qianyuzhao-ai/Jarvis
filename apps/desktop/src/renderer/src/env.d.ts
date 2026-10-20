import type { DesktopInfo } from '../../shared/desktop-info';

declare global {
  interface Window {
    readonly desktop?: DesktopInfo;
  }
}
