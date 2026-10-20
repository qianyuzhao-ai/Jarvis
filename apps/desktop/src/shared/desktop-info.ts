import type { GenerationBridge } from './generation';
export interface DesktopInfo {
  readonly platform: string;
  readonly generation: GenerationBridge;
  readonly versions: {
    readonly electron: string;
    readonly chromium: string;
    readonly node: string;
  };
}
