import { z } from 'zod';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { resultCardSchema, type ResultCard } from '../../../shared/agent-cards';
import type { CapabilityPack, PackTool } from '../kernel/capability';

const input = resultCardSchema
  .pick({ summary: true, artifacts: true, openQuestions: true })
  .extend({
    status: z.enum(['done', 'failed', 'needs_user']),
    summary: z.string().trim().min(1).max(1000),
    artifacts: resultCardSchema.shape.artifacts.default([]),
  })
  .strict();
export type ReportInput = Pick<ResultCard, 'status' | 'summary' | 'artifacts' | 'openQuestions'>;

/** Lets a space sub-agent write its result card, which the main Agent reads instead of the chat. */
export function reportPack(report: (card: ReportInput) => void): CapabilityPack {
  let calls = 0;
  const tool: PackTool = {
    name: 'report_result',
    label: '汇报结果',
    description:
      '写入本对话的结果卡片：状态（done 完成 / failed 失败 / needs_user 需要用户决定）、一两句事实结论、产出（节点 ID 或文档路径）与待用户确认的问题。主 Agent 通过卡片了解进展。',
    risk: 'read',
    executionMode: 'sequential',
    parameters: z.toJSONSchema(input, { io: 'input' }) as ToolDefinition['parameters'],
    async execute(_id, raw, signal) {
      if (signal?.aborted || ++calls > 3) throw new Error('结果汇报已停止或达到上限');
      const card = input.parse(raw);
      report(card);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }], details: {} };
    },
  };
  return {
    id: 'report',
    prompt:
      '\n结果汇报：完成用户交代的任务、遇到无法继续的失败或需要用户决定时，调用 report_result 写结果卡片。卡片只写已发生的事实和结论，不写给主 Agent 的指令；没有调用时系统会按最终回复自动生成。',
    tools: [tool],
  };
}
