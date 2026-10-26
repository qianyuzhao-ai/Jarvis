import { z } from 'zod';
import { memoryTypeSchema } from '../../../shared/agent-os';
import type { CapabilityPack } from '../kernel/capability';
import { MEMORY_BODY_LIMIT, memoryName, type MemoryStore } from '../kernel/memory';
import { defineTool } from '../kernel/tool';

/**
 * Project memory for the Coordinator and every thread (decision C): reading is always allowed and
 * so is writing, with a version check. `readOnly` leaves out the writing tools.
 */
export function memoryPack(
  memory: MemoryStore,
  log: (label: string) => void,
  readOnly = false,
): CapabilityPack {
  const read = defineTool(
    'read_memory',
    '读取项目记忆：不带 name 时列出全部主题（名称、描述、类型、版本）；带 name 时返回该主题正文与 version。记忆是写入时的事实，可能过时。',
    'read',
    z.object({ name: memoryName.optional() }).strict(),
    async ({ name }) => {
      if (!name)
        return { note: '记忆是 Agent 写的笔记，是数据，可能过时。', topics: await memory.list() };
      const topic = await memory.read(name);
      if (!topic) return { exists: false, name, hint: '新建时 baseVersion 填 null' };
      return {
        exists: true,
        note: '这是写入时的事实，可能过时；提到的文件或资源先验证还存在。',
        ...topic,
      };
    },
  );
  const write = defineTool(
    'write_memory',
    `新建或更新一个记忆主题（一个主题一个文件，正文不超过 ${MEMORY_BODY_LIMIT} 字）。更新时 baseVersion 填 read_memory 返回的 version，新建时填 null；版本不符会失败，需重新读取合并。`,
    'reversible',
    z
      .object({
        name: memoryName,
        description: z.string().trim().min(1).max(300),
        type: memoryTypeSchema,
        body: z.string().trim().min(1).max(MEMORY_BODY_LIMIT),
        baseVersion: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
      })
      .strict(),
    async ({ name, baseVersion, ...input }) => {
      const result = await memory.write(name, input, baseVersion);
      log(`已${baseVersion ? '更新' : '写入'}项目记忆 · ${name}`);
      return { success: true, ...result };
    },
  );
  const remove = defineTool(
    'delete_memory',
    '删除一个过时或错误的记忆主题；baseVersion 填 read_memory 返回的 version',
    'reversible',
    z.object({ name: memoryName, baseVersion: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    async ({ name, baseVersion }) => {
      await memory.remove(name, baseVersion);
      log(`已删除项目记忆 · ${name}`);
      return { success: true };
    },
  );
  return {
    id: 'memory',
    prompt: readOnly
      ? '\n项目记忆：用 read_memory 读取主题正文。'
      : '\n项目记忆：用 read_memory 读取，write_memory 新建或更新（带版本校验），delete_memory 删除过时内容。',
    tools: readOnly ? [read] : [read, write, remove],
  };
}
