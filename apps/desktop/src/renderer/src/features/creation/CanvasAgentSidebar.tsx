import { AssistantPanel, AssistantEmpty } from '@jarvis/ui/components/AssistantPanel';
import { IconButton } from '@jarvis/ui/components/Button';
import { Sparkles, X } from '@jarvis/ui/icons';
import type { Project } from './types';

/**
 * The canvas assistant while the V1.0.0 Agent OS is introduced: canvas work comes back as a
 * capability pack threads mount (batch 2); until then this panel says so.
 */
export function CanvasAgentSidebar({
  open,
  width,
  onClose,
}: {
  width: number;
  onWidth: (n: number) => void;
  onClose: () => void;
  project: Project;
  selectedIds: string[];
  open: boolean;
  focus: (ids: string[]) => void;
  configure: () => void;
}) {
  const panelWidth = Math.min(width, window.innerWidth - 360);
  return (
    <div
      data-testid="canvas-agent-shell"
      className="canvas-agent-shell"
      style={{ width: open ? panelWidth : 0 }}
    >
      <AssistantPanel
        id="canvas-agent"
        data-testid="canvas-agent"
        className="canvas-agent"
        aria-label="画布助手"
        aria-hidden={!open}
        inert={!open}
        data-open={open}
        style={{ width: panelWidth }}
        title="画布助手"
        actions={
          <IconButton variant="ghost" size="icon-sm" aria-label="关闭画布助手" onClick={onClose}>
            <X size={16} />
          </IconButton>
        }
      >
        <AssistantEmpty icon={<Sparkles size={32} />} title="画布助手即将接入">
          Jarvis 正在升级为新的 Agent 架构，画布能力会在下一批接回。现在可以在首页把任务交给
          Jarvis。
        </AssistantEmpty>
      </AssistantPanel>
    </div>
  );
}
