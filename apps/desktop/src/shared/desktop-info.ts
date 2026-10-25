import type { AppearanceBridge } from './appearance';
import type { GenerationBridge } from './generation';
import type { WritingBridge } from './writing';
import type { AgentBridge } from './agent';
import type { ModelsBridge } from './models';
import type { UpdateBridge } from './updates';
import type { ProjectsBridge } from './project';
export interface DesktopInfo {
  readonly platform: string;
  readonly appearance: AppearanceBridge;
  readonly generation: GenerationBridge;
  readonly writing: WritingBridge;
  readonly projects: ProjectsBridge;
  readonly agent: AgentBridge;
  readonly models: ModelsBridge;
  readonly updates: UpdateBridge;
  readonly versions: {
    readonly electron: string;
    readonly chromium: string;
    readonly node: string;
  };
}
