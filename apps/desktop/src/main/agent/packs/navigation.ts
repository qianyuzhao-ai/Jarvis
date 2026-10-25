import { z } from 'zod';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { NavigationTarget } from '../../../shared/agent';
import type { CapabilityPack, PackTool, ToolContext, ToolRisk } from '../kernel/capability';

export interface Navigator {
  createProject(name: string): Promise<string>;
  hasProject(id: string): boolean;
  hasFolder(id: string): boolean;
  /** Shows a project or document in the user's window. */
  open(target: NavigationTarget): void;
}

/** The main Agent's tools to create canvas projects and open projects or documents for the user. */
export function navigationPack(
  { output, changed }: ToolContext,
  navigator: Navigator,
): CapabilityPack {
  const log = (label: string) => {
    output.activities ??= [];
    output.activities.push({ id: crypto.randomUUID(), label: label.slice(0, 500), files: [] });
    changed();
  };
  function tool(
    name: string,
    description: string,
    risk: ToolRisk,
    schema: z.ZodType,
    execute: (input: never) => Promise<unknown> | unknown,
  ): PackTool {
    return {
      name,
      label: description,
      description,
      risk,
      executionMode: 'sequential',
      parameters: z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'],
      async execute(_id, raw, signal) {
        if (signal?.aborted) throw new Error('操作已停止');
        let input: unknown;
        try {
          input = schema.parse(raw);
        } catch {
          throw new Error('导航工具参数不正确');
        }
        const result = await execute(input as never);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: {} };
      },
    };
  }
  return {
    id: 'navigation',
    prompt:
      '\n项目与导航：create_project 新建空白画布项目（再用 delegate_task 让画布子 Agent 搭建节点、发起生成）；open_project、open_document 在用户的窗口中打开项目或文档，只在用户想看时使用。',
    tools: [
      tool(
        'create_project',
        '新建一个空白画布项目，返回项目 ID',
        'reversible',
        z.object({ name: z.string().trim().min(1).max(80) }).strict(),
        async ({ name }: { name: string }) => {
          const projectId = await navigator.createProject(name);
          log(`已新建项目 · ${name}`);
          return { projectId, name };
        },
      ),
      tool(
        'open_project',
        '在用户的窗口中打开一个画布项目',
        'read',
        z.object({ projectId: z.string().uuid() }).strict(),
        ({ projectId }: { projectId: string }) => {
          if (!navigator.hasProject(projectId)) throw new Error('这个项目不存在或已删除');
          navigator.open({ kind: 'canvas', projectId });
          return { opened: true };
        },
      ),
      tool(
        'open_document',
        '在用户的写作空间中打开一个 Markdown 文档',
        'read',
        z.object({ rootId: z.string().min(1).max(64), path: z.string().min(1).max(4096) }).strict(),
        ({ rootId, path }: { rootId: string; path: string }) => {
          if (!navigator.hasFolder(rootId)) throw new Error('没有这个写作文件夹');
          if (!/\.md$/i.test(path)) throw new Error('只能打开 Markdown 文档');
          navigator.open({ kind: 'writing', rootId, path });
          return { opened: true };
        },
      ),
    ],
  };
}
