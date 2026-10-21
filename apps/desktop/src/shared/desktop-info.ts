import type { GenerationBridge } from './generation';
import type { WritingBridge } from './writing';
import type { AgentBridge } from './agent';
export interface DesktopInfo {
  readonly platform: string;
  readonly generation: GenerationBridge;
  readonly writing: WritingBridge;
  readonly agent: AgentBridge;
  readonly versions: {
    readonly electron: string;
    readonly chromium: string;
    readonly node: string;
  };
}
