import { z } from 'zod';
import {
  effortSchema,
  osId,
  threadTargetsSchema,
  writablePackSchema,
} from '../../../shared/agent-os';
import type { CapabilityPack } from '../kernel/capability';
import { defineTool } from '../kernel/tool';

export const spawnInput = z
  .object({
    title: z.string().trim().min(1).max(40),
    objective: z.string().trim().min(1).max(4000),
    outputFormat: z.string().trim().min(1).max(1000),
    toolsAndSources: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    boundaries: z.string().max(2000).default(''),
    effortHint: effortSchema.default('normal'),
    capabilities: z.array(writablePackSchema).max(10).default([]),
    citeUserMessageIds: z.array(osId).max(10).default([]),
    dependsOn: z.array(osId).max(10).default([]),
    /** A canvas (canvasId) and/or a document (rootId + path) the thread works on. */
    targets: threadTargetsSchema.default([]),
  })
  .strict();
export type SpawnInput = z.infer<typeof spawnInput>;

/** What the Coordinator's tools ask of the OS for one round. */
export interface Coordination {
  spawn(input: SpawnInput): Promise<unknown>;
  message(threadId: string, text: string, cite: string[]): Promise<unknown>;
  list(includeResolved: boolean): unknown;
  read(threadId: string, offset: number): unknown;
  stop(threadId: string): Promise<unknown>;
}

/** The Coordinator's tools: start, brief and follow threads. It never does the work itself. */
export function coordinatorPack(control: Coordination): CapabilityPack {
  return {
    id: 'coordination',
    prompt:
      '\n线程管理：spawn_thread 开线程（返回 threadId，不等待结果）；message_thread 给已有线程补充信息或转达用户的话（附 citeUserMessageIds）；list_threads、read_thread 了解进展；stop_thread 停止线程。',
    tools: [
      defineTool(
        'spawn_thread',
        '按任务书开一个新线程去做一件事；只写清目标、交付、工具与来源、边界、投入、所需写能力，并附上用户原话的消息 id。要改画布或文档时在 targets 里写明（画布 canvasId；文档 rootId + path），并在 capabilities 里声明 canvas / generation / writing；画布和文档都不需要用户打开',
        'read',
        spawnInput,
        (input) => control.spawn(input),
      ),
      defineTool(
        'message_thread',
        '给已有线程发消息：转达用户的补充（用 citeUserMessageIds 附上原话）或回答它的问题；线程正在工作时在两次工具调用之间送达',
        'read',
        z
          .object({
            threadId: osId,
            text: z.string().trim().min(1).max(8000),
            citeUserMessageIds: z.array(osId).max(10).default([]),
          })
          .strict(),
        ({ threadId, text, citeUserMessageIds }) =>
          control.message(threadId, text, citeUserMessageIds),
      ),
      defineTool(
        'list_threads',
        '列出本项目的线程：标题、状态、进度、结果卡摘要；默认不含已解决的',
        'read',
        z.object({ includeResolved: z.boolean().default(false) }).strict(),
        ({ includeResolved }) => control.list(includeResolved),
      ),
      defineTool(
        'read_thread',
        '读取一个线程的结果卡和对话记录的一段（每段最多 8000 字）；next 不为空时用它作为 offset 继续',
        'read',
        z.object({ threadId: osId, offset: z.number().int().min(0).default(0) }).strict(),
        ({ threadId, offset }) => control.read(threadId, offset),
      ),
      defineTool(
        'stop_thread',
        '停止一个线程正在进行的工作并取消它的定时唤醒；只在用户要求或任务已无意义时使用',
        'read',
        z.object({ threadId: osId }).strict(),
        ({ threadId }) => control.stop(threadId),
      ),
    ],
  };
}
