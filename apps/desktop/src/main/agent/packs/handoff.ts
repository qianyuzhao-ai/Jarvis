import { z } from 'zod';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { CapabilityPack, PackTool, ToolContext } from '../kernel/capability';

const input = z
  .object({
    request: z.string().trim().min(1).max(4000),
    context: z.string().max(4000).optional(),
    expected: z.string().max(1000).optional(),
  })
  .strict();
export type HandoffInput = z.infer<typeof input>;

/**
 * Lets a space sub-agent pass a request outside its space to the main Agent. The request joins the
 * main Agent's current segment as a queued message; the sub-agent's round goes on.
 */
export function handoffPack(
  { output, changed }: ToolContext,
  handoff: (request: HandoffInput) => Promise<{ handoffId: string; sessionId: string }>,
): CapabilityPack {
  let calls = 0;
  const tool: PackTool = {
    name: 'handoff_to_main',
    label: '交给 Jarvis 处理',
    description:
      '把超出本空间能力的请求交给 Jarvis 主 Agent：request 填用户原话，context 填完成它需要的事实（项目、文档、已做的事），expected 填用户期望的结果。交出后告诉用户已交给 Jarvis 处理，不要声称已完成。',
    risk: 'read',
    executionMode: 'sequential',
    parameters: z.toJSONSchema(input) as ToolDefinition['parameters'],
    async execute(_id, raw, signal) {
      if (signal?.aborted || ++calls > 2) throw new Error('转交已停止或达到上限');
      const result = await handoff(input.parse(raw));
      output.activities ??= [];
      output.activities.push({ id: crypto.randomUUID(), label: '已交给 Jarvis 处理', files: [] });
      changed();
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, ...result }) }],
        details: {},
      };
    },
  };
  return {
    id: 'handoff',
    prompt:
      '\n越界请求：用户要求本空间工具做不到的事（其他项目或文档、跨空间整理、日程、文件、生成等）时，不要拒绝了事，调用 handoff_to_main 交给 Jarvis 主 Agent，并告诉用户“已交给 Jarvis 处理”。本空间能做的部分照常完成。',
    tools: [tool],
  };
}
