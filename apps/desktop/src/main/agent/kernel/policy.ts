import type { ExtensionFactory, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import type { PolicyRules } from '../../../shared/agent-os';
import type { CapabilityPack, PackTool } from './capability';

/** A tool call as the policy sees it. */
export type PolicyCall = { tool: PackTool; pack: string; input: Record<string, unknown> };
/** Code that runs before every call; returning a reason denies it in any mode. */
export type PolicyHook = (call: PolicyCall) => string | undefined;
/**
 * Decides an irreversible call without waiting: undefined runs it (the user approved this exact
 * call before), a result blocks it after a decision card was raised.
 */
export type Confirmer = (
  call: PolicyCall & { signal?: AbortSignal },
) => Promise<ToolCallEventResult | undefined>;

export interface PolicyOptions {
  mode?: 'plan' | 'normal' | 'auto';
  rules?: PolicyRules;
  /** Whether a pack's writing tools are mounted; packs not listed in `gated` are always writable. */
  mounted?: (pack: string) => boolean;
  gated?: ReadonlySet<string>;
  hooks?: PolicyHook[];
  confirm?: Confirmer;
  maxCalls?: number;
  /** Counts every call that runs. */
  onRun?: (call: PolicyCall) => void;
}

const matches = (patterns: string[] | undefined, name: string) =>
  !!patterns?.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : p === name));

/** Deleting by pattern, a whole folder or recursively is never allowed: one exact file at a time. */
export const batchDeleteGuard: PolicyHook = ({ tool, input }) => {
  if (!/delete|remove/.test(tool.name)) return undefined;
  const path = input.path;
  if (
    typeof path === 'string' &&
    (!path.trim() || /[*?[\]{}]/.test(path) || path === '.' || path.endsWith('/'))
  )
    return '批量删除、按通配符删除或删除整个目录一律禁止；只能一次删除一个明确路径的文件。';
  if (input.recursive === true || Array.isArray(input.paths))
    return '批量删除一律禁止；只能一次删除一个明确路径的文件。';
  return undefined;
};

/**
 * Decides every tool call before it runs, in a fixed order:
 * 1. hooks (code, deny in any mode) → 2. deny: unknown tools, deny rules, forbidden tools and the
 * per-round call limit → 3. ask rules (treated as irreversible) → 4. mode (`plan` blocks every
 * change) → 5. allow rules and read-only tools run → 6. by risk: reversible tools run once their
 * pack is mounted, irreversible ones go to `confirm`, which raises a decision card.
 */
export function createPolicy(packs: CapabilityPack[], options: PolicyOptions = {}) {
  const {
    mode = 'normal',
    rules,
    mounted,
    gated,
    hooks = [],
    confirm,
    maxCalls = 40,
    onRun,
  } = options;
  const tools = new Map(
    packs.flatMap((pack) =>
      pack.tools.map((tool) => [tool.name, { tool, pack: pack.id }] as const),
    ),
  );
  let calls = 0;
  const block = (reason: string): ToolCallEventResult => ({ block: true, reason });
  async function decide(
    toolName: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolCallEventResult | undefined> {
    const found = tools.get(toolName);
    if (!found) return block('该工具不在当前会话的能力范围内，未执行。');
    const call: PolicyCall = { tool: found.tool, pack: found.pack, input: input ?? {} };
    for (const hook of hooks) {
      const reason = hook(call);
      if (reason) return block(reason);
    }
    if (matches(rules?.deny, toolName)) return block('项目规则禁止使用这个工具，未执行。');
    if (found.tool.risk === 'forbidden') return block('这个操作被禁止，未执行。');
    if (++calls > maxCalls)
      return block('本轮工具调用次数已达上限，未执行；请结束本轮并说明进展。');
    const risk =
      matches(rules?.ask, toolName) && found.tool.risk !== 'read' ? 'confirm' : found.tool.risk;
    const run = () => {
      onRun?.(call);
      return undefined;
    };
    if (risk === 'read') return run();
    if (mode === 'plan' && !matches(rules?.allow, toolName))
      return block('项目处于计划模式：只读取和提出方案，不执行修改。请把方案告诉用户。');
    if (gated?.has(found.pack) && mounted && !mounted(found.pack))
      return block(
        `“${found.pack}”的写能力尚未挂载。需要时先调用 request_capability（pack: "${found.pack}"，写明理由），挂载后再重试。`,
      );
    if (risk === 'reversible') return run();
    if (!confirm) return block('当前会话不能执行需要用户批准的操作；请交给线程处理。');
    const result = await confirm({ ...call, signal });
    return result ?? run();
  }
  const factory: ExtensionFactory = (pi) => {
    pi.on('tool_call', (event, ctx) => decide(event.toolName, event.input, ctx.signal));
  };
  return { decide, factory };
}
