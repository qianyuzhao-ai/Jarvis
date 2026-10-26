import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { memoryTypeSchema, type MemoryTopic, type MemoryType } from '../../../shared/agent-os';

export const memoryName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '主题名只能用小写字母、数字和连字符');
/** A topic file's body; longer topics should be split or summarized. */
export const MEMORY_BODY_LIMIT = 4096;
/** The index loaded every round stays within these, like MEMORY.md elsewhere. */
const INDEX_LINES = 200;
const INDEX_BYTES = 25_000;
const SECRET =
  /(sk-[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})/;

export class MemoryConflict extends Error {}

const header = /^---\nname: (.+)\ndescription: (.*)\ntype: (.+)\nupdated: (\d+)\n---\n/;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * A project's memory: one Markdown file per topic with a small header, and `MEMORY.md`, an index
 * the kernel rebuilds from those headers after every change. Every thread and the Coordinator may
 * write; a write names the version it read, so two writers never overwrite each other silently.
 */
export class MemoryStore {
  private queue = Promise.resolve();
  constructor(readonly dir: string) {}
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(task);
    this.queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  private path(name: string) {
    return join(this.dir, `${memoryName.parse(name)}.md`);
  }
  private async readTopic(name: string) {
    let content: string;
    try {
      content = await readFile(this.path(name), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const match = header.exec(content);
    const type = memoryTypeSchema.safeParse(match?.[3]);
    return {
      name,
      description: match?.[2] ?? '',
      type: (type.success ? type.data : 'fact') as MemoryType,
      updatedAt: Number(match?.[4] ?? 0),
      body: match ? content.slice(match[0].length) : content,
      version: hash(content),
      size: content.length,
    };
  }
  async list(): Promise<MemoryTopic[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const topics: MemoryTopic[] = [];
    for (const file of names.sort()) {
      if (!file.endsWith('.md') || file === 'MEMORY.md') continue;
      const name = file.slice(0, -3);
      if (!memoryName.safeParse(name).success) continue;
      const topic = await this.readTopic(name);
      if (topic) {
        const { body: _body, ...meta } = topic;
        topics.push(meta);
      }
    }
    return topics;
  }
  read(name: string) {
    return this.readTopic(name);
  }
  /** The index the model sees every round, cut to its budget. */
  async index() {
    try {
      const text = await readFile(join(this.dir, 'MEMORY.md'), 'utf8');
      return text.split('\n').slice(0, INDEX_LINES).join('\n').slice(0, INDEX_BYTES);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  }
  /**
   * Creates (`baseVersion` null) or replaces a topic. A topic that changed since `baseVersion`, or
   * one that already exists when creating, is a conflict: read it again and merge.
   */
  write(
    name: string,
    input: { description: string; type: MemoryType; body: string },
    baseVersion: string | null,
  ) {
    return this.serial(async () => {
      if (input.body.length > MEMORY_BODY_LIMIT)
        throw new Error(`主题正文超过 ${MEMORY_BODY_LIMIT} 字，请拆分或总结后再写`);
      if (SECRET.test(input.body) || SECRET.test(input.description))
        throw new Error('记忆中不能保存密钥、令牌或凭据');
      const current = await this.readTopic(name);
      if (current ? current.version !== baseVersion : baseVersion !== null)
        throw new MemoryConflict(
          current
            ? '这个主题已被更新，请先用 read_memory 重新读取再合并写入'
            : '这个主题不存在或已删除，新建时 baseVersion 填 null',
        );
      const description = input.description.replace(/\s+/g, ' ').trim().slice(0, 300);
      const content = `---\nname: ${name}\ndescription: ${description}\ntype: ${input.type}\nupdated: ${Date.now()}\n---\n${input.body.trim()}\n`;
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      await writeFile(`${this.path(name)}.tmp`, content, { mode: 0o600 });
      await rename(`${this.path(name)}.tmp`, this.path(name));
      await this.rebuild();
      return { name, version: hash(content) };
    });
  }
  remove(name: string, baseVersion: string) {
    return this.serial(async () => {
      const current = await this.readTopic(name);
      if (!current) return;
      if (current.version !== baseVersion)
        throw new MemoryConflict('这个主题已被更新，请先重新读取再决定是否删除');
      await unlink(this.path(name));
      await this.rebuild();
    });
  }
  private async rebuild() {
    const topics = await this.list();
    const lines = [
      '# 项目记忆索引',
      '',
      ...topics.map(
        (t) =>
          `- ${t.name}（${t.type}，${new Date(t.updatedAt).toISOString().slice(0, 10)}）：${t.description}`,
      ),
    ];
    await writeFile(join(this.dir, 'MEMORY.md'), `${lines.join('\n')}\n`, { mode: 0o600 });
  }
}
