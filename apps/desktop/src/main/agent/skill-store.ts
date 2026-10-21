import { randomUUID } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { skillInfoSchema, type SkillInfo } from '../../shared/agent-skills';
import { JsonFile, readJson } from './json-file';

const storedSkill = skillInfoSchema.extend({
  body: z.string().min(1).max(128000),
  files: z.record(z.string(), z.string()),
});
export type StoredSkill = z.infer<typeof storedSkill>;
export class SkillStore {
  private records: StoredSkill[] = [];
  private writes = Promise.resolve();
  constructor(private file: JsonFile) {}
  async initialize() {
    const saved = await readJson(this.file.path);
    this.records = saved === null ? [] : z.array(storedSkill).max(100).parse(saved);
  }
  list(): SkillInfo[] {
    return this.records.map(({ body: _body, files: _files, ...info }) => ({ ...info }));
  }
  snapshot() {
    return structuredClone(this.records.filter((s) => s.enabled));
  }
  private mutate(change: (current: StoredSkill[]) => StoredSkill[]) {
    const pending = this.writes.then(async () => {
      const next = change(this.records);
      await this.file.write(next);
      this.records = next;
      return this.list();
    });
    this.writes = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  setEnabled(id: string, enabled: boolean) {
    return this.mutate((current) => {
      if (!current.some((s) => s.id === id)) throw new Error('技能已不存在');
      return current.map((s) => (s.id === id ? { ...s, enabled } : s));
    });
  }
  async importDirectory(directory: string) {
    const files: Record<string, string> = {};
    let bytes = 0;
    async function visit(relative: string, depth: number) {
      if (depth > 6) throw new Error('技能包目录过深');
      const path = join(directory, relative);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error('技能包不能包含符号链接');
      if (stat.isDirectory()) {
        for (const name of await readdir(path)) {
          if (name.startsWith('.') || name === 'node_modules') continue;
          await visit(relative ? `${relative}/${name}` : name, depth + 1);
        }
      } else {
        if (!stat.isFile() || stat.size > 256000) throw new Error('技能包单个文件不能超过 256KB');
        if (Object.keys(files).length >= 100 || bytes + stat.size > 2000000)
          throw new Error('技能包不能超过 100 个文件或 2MB');
        const buffer = await readFile(path);
        bytes += buffer.length;
        if (bytes > 2000000) throw new Error('技能包超过 2MB');
        files[relative] = buffer.toString('base64');
      }
    }
    await visit('', 0);
    if (!files['SKILL.md']) throw new Error('请选择根目录包含 SKILL.md 的技能文件夹');
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.from(files['SKILL.md'], 'base64'),
    );
    const { parseFrontmatter } = await import('@earendil-works/pi-coding-agent');
    const { frontmatter, body } = parseFrontmatter(raw);
    const parsed = skillInfoSchema.safeParse({
      id: randomUUID(),
      name: frontmatter.name,
      description: frontmatter.description,
      manualOnly: frontmatter['disable-model-invocation'] === true,
      enabled: true,
      importedAt: Date.now(),
    });
    if (
      !parsed.success ||
      !body.trim() ||
      body.length > 128000 ||
      (frontmatter['disable-model-invocation'] !== undefined &&
        typeof frontmatter['disable-model-invocation'] !== 'boolean')
    )
      throw new Error(
        'SKILL.md 需要有效的 name、description 和非空正文；仅手动调用标记必须是布尔值',
      );
    const record = storedSkill.parse({ ...parsed.data, body: body.trim(), files });
    return this.mutate((current) => {
      const previous = current.find((s) => s.name === record.name);
      if (!previous && current.length >= 100) throw new Error('最多导入 100 个技能');
      return previous
        ? current.map((s) =>
            s.id === previous.id ? { ...record, id: previous.id, enabled: previous.enabled } : s,
          )
        : [...current, record];
    });
  }
}
