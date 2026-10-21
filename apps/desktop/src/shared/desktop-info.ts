import type { GenerationBridge } from './generation';
import type { WritingBridge } from './writing';
export interface DesktopInfo {
  readonly platform: string;
  readonly generation: GenerationBridge;
  readonly writing: WritingBridge;
  readonly versions: {
    readonly electron: string;
    readonly chromium: string;
    readonly node: string;
  };
}
