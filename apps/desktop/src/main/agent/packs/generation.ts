import { z } from 'zod';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { mediaName } from '../../../shared/canvas-media';
import type { GenerationRunner } from '../../generation/agent-runner';
import type { ProjectStore } from '../../projects/project-store';
import type { CapabilityPack, PackTool, ToolContext, ToolRisk } from '../kernel/capability';

const nodes = z.object({ nodeIds: z.array(z.string().min(1).max(100)).min(1).max(4) }).strict();

/**
 * Starts image and video generation for nodes of the conversation's project. Jobs run in the main
 * process; the round ends and a completion notice wakes the conversation when each job ends.
 */
export function generationPack(
  { sessionId, output, changed }: ToolContext,
  projectId: string,
  deps: { runner: GenerationRunner; store?: ProjectStore },
): CapabilityPack {
  let calls = 0;
  const log = (label: string, nodeIds?: string[]) => {
    output.activities ??= [];
    output.activities.push({
      id: crypto.randomUUID(),
      label: label.slice(0, 500),
      files: [],
      nodeIds,
      projectId,
    });
    changed();
  };
  const project = () => {
    if (!deps.store) throw new Error('项目存储不可用，请重启应用');
    return deps.store.get(projectId).project;
  };
  function tool(
    name: string,
    label: string,
    risk: ToolRisk,
    execute: (ids: string[]) => Promise<unknown>,
  ): PackTool {
    return {
      name,
      label,
      description: label,
      risk,
      executionMode: 'sequential',
      parameters: z.toJSONSchema(nodes, { io: 'input' }) as ToolDefinition['parameters'],
      async execute(_id, raw, signal) {
        if (signal?.aborted || ++calls > 10) throw new Error('生成操作已停止或达到上限');
        let ids: string[];
        try {
          ids = nodes.parse(raw).nodeIds;
        } catch {
          throw new Error('生成工具参数不正确');
        }
        const result = await execute(ids);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: {} };
      },
    };
  }
  return {
    id: 'generation',
    prompt:
      '\n生成：节点提示词与参数准备好后用 start_generation 发起图像/视频生成（公司资源，无需确认费用）。生成是异步的：发起后告诉用户已开始生成并结束本轮，不要等待或反复查询；每个任务结束后系统会发来“生成任务完成通知”（数据）唤醒你继续，例如把生成好的图片连到视频节点再生成。连入视频节点的上游图片须已有生成结果。结果未知的节点不要重新生成，请用户确认。',
    tools: [
      tool(
        'start_generation',
        '为指定节点发起图像或视频生成（每次最多 4 个），完成后会收到通知',
        'reversible',
        async (ids) => {
          const started: { nodeId: string; requestId: string }[] = [];
          const failed: { nodeId: string; error: string }[] = [];
          for (const nodeId of ids)
            try {
              started.push({ nodeId, ...(await deps.runner.start(sessionId, projectId, nodeId)) });
            } catch (error) {
              failed.push({
                nodeId,
                error: error instanceof Error ? error.message : '生成请求失败',
              });
            }
          const names = (list: { nodeId: string }[]) =>
            list
              .map(({ nodeId }) => {
                const node = project().nodes.find((n) => n.id === nodeId);
                return node?.type === 'media' ? mediaName(node.data) : nodeId;
              })
              .join('、');
          if (started.length)
            log(
              `已发起生成 · ${names(started)}`,
              started.map((s) => s.nodeId),
            );
          if (failed.length) log(`生成未发起 · ${failed.map((f) => f.error).join('；')}`);
          if (!started.length) throw new Error(failed.map((f) => f.error).join('；'));
          return { started, failed, note: '生成在后台进行；请结束本轮，完成后会收到通知。' };
        },
      ),
      tool('get_generation_status', '读取节点的生成状态与是否已有结果', 'read', async (ids) => {
        const current = project();
        return {
          nodes: ids.map((nodeId) => {
            const node = current.nodes.find((n) => n.id === nodeId);
            if (!node || node.type !== 'media')
              return { nodeId, error: '节点不存在或不是生成节点' };
            return {
              nodeId,
              status: node.data.generation?.status ?? 'idle',
              error: node.data.generation?.error,
              hasResult: !!node.data.result,
            };
          }),
        };
      }),
    ],
  };
}
