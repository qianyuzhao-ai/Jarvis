import { z } from 'zod';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { PackTool, ToolRisk } from './capability';

/**
 * A pack tool whose input is checked against `schema` and whose result goes to the model as JSON.
 * Errors reach the model as their message only.
 */
export function defineTool<S extends z.ZodType>(
  name: string,
  description: string,
  risk: ToolRisk,
  schema: S,
  execute: (input: z.output<S>, signal?: AbortSignal) => Promise<unknown> | unknown,
  options: { label?: string; describe?: (input: Record<string, unknown>) => string } = {},
): PackTool {
  return {
    name,
    label: options.label ?? description,
    description,
    risk,
    describe: options.describe,
    executionMode: 'sequential',
    parameters: z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'],
    async execute(_id, raw, signal) {
      if (signal?.aborted) throw new Error('操作已停止');
      const parsed = schema.safeParse(raw);
      if (!parsed.success)
        throw new Error(
          `参数不正确：${parsed.error.issues
            .map((i) => `${i.path.join('.')} ${i.message}`)
            .join('；')
            .slice(0, 500)}`,
        );
      const result = await execute(parsed.data, signal);
      return {
        content: [{ type: 'text', text: JSON.stringify(result ?? { success: true }) }],
        details: {},
      };
    },
  };
}
