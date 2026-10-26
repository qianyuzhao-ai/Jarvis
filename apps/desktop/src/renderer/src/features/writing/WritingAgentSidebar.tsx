import { AssistantPanel, AssistantEmpty } from '@jarvis/ui/components/AssistantPanel';
import { IconButton } from '@jarvis/ui/components/Button';
import { Sparkles, X } from '@jarvis/ui/icons';
import type { DocumentSession } from './useWriting';
import type { useWritingHost } from './use-writing-host';

/**
 * The writing assistant while the V1.0.0 Agent OS is introduced: document editing comes back as a
 * capability pack threads mount (batch 2); until then this panel says so.
 */
export function WritingAgentSidebar({
  close,
}: {
  document: DocumentSession;
  host: ReturnType<typeof useWritingHost>;
  selectedParagraphs: number;
  configure: () => void;
  close: () => void;
}) {
  return (
    <AssistantPanel
      aria-label="写作助手"
      className="writing-agent-panel"
      title="写作助手"
      actions={
        <IconButton variant="ghost" aria-label="关闭写作助手" onClick={close}>
          <X />
        </IconButton>
      }
    >
      <AssistantEmpty icon={<Sparkles size={32} />} title="写作助手即将接入">
        Jarvis 正在升级为新的 Agent 架构，文档编辑能力会在下一批接回。现在可以在首页把任务交给
        Jarvis。
      </AssistantEmpty>
    </AssistantPanel>
  );
}
