import type { ExtensionFactory, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import type { ApprovalOutcome } from '../../../shared/agent-approval';
import type { CapabilityPack, PackTool } from './capability';

/** Asks the user about one `confirm` tool call. Missing means the session cannot ask. */
export type Approver = (call: {
  tool: PackTool;
  input: Record<string, unknown>;
  signal?: AbortSignal;
}) => Promise<ApprovalOutcome>;

const reasons: Record<Exclude<ApprovalOutcome, 'approved'>, string> = {
  denied: '用户拒绝了此操作，未执行。请向用户说明，不要重复尝试。',
  expired: '用户未在时限内确认此操作，未执行。请向用户说明，需要时请用户重新发起。',
};

/**
 * Decides every tool call before it runs: tools outside the session's packs are blocked, `read`
 * and `reversible` tools run, and `confirm` tools run only after the user approves.
 */
export function createPolicy(packs: CapabilityPack[], approve?: Approver) {
  const tools = new Map(packs.flatMap((pack) => pack.tools).map((tool) => [tool.name, tool]));
  async function decide(
    toolName: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolCallEventResult | undefined> {
    const tool = tools.get(toolName);
    if (!tool) return { block: true, reason: '该工具不在当前会话的能力范围内，未执行。' };
    if (tool.risk !== 'confirm') return undefined;
    if (!approve) return { block: true, reason: '当前会话无法请求用户确认，未执行。' };
    const outcome = await approve({ tool, input, signal });
    return outcome === 'approved' ? undefined : { block: true, reason: reasons[outcome] };
  }
  const factory: ExtensionFactory = (pi) => {
    pi.on('tool_call', (event, ctx) => decide(event.toolName, event.input, ctx.signal));
  };
  return { decide, factory };
}
