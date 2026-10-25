import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ChatMessage } from '../../../shared/agent';

/**
 * How a tool affects state: `read` never changes anything, `reversible` changes state that the
 * round can undo, `confirm` needs the user's approval before it runs.
 */
export type ToolRisk = 'read' | 'reversible' | 'confirm';

export type PackTool = ToolDefinition & { risk: ToolRisk };

/** What a pack's tools need from the round they run in. */
export interface ToolContext {
  /** WebContents ID of the window that started the round. */
  owner: number;
  runId: string;
  /** The assistant message that collects activity records for this round. */
  output: ChatMessage;
  /** Schedules a snapshot push after an activity record changes. */
  changed: () => void;
}

/**
 * A set of tools plus the system prompt text that explains them. A session's system prompt is its
 * packs' prompts joined in order, and its tool list is their tools in the same order.
 */
export interface CapabilityPack {
  id: string;
  prompt: string;
  tools: PackTool[];
  /** Set when the session never sends images, even on a vision-capable model. */
  textOnly?: boolean;
}
