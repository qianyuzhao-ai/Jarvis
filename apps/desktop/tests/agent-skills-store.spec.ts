import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { SkillStore } from '../src/main/agent/skill-store';
import { JsonFile } from '../src/main/agent/json-file';

test('skills import copies a standard package, persists enablement and updates by name', async () => {
  const directory = test.info().outputPath('package');
  await mkdir(join(directory, 'references'), { recursive: true });
  await writeFile(
    join(directory, 'SKILL.md'),
    '---\nname: shot-plan\ndescription: Build a shot plan\ndisable-model-invocation: true\n---\nUse references/rules.md.',
  );
  await writeFile(join(directory, 'references/rules.md'), 'Keep subject consistent.');
  const file = new JsonFile(test.info().outputPath('skills.json'));
  const store = new SkillStore(file);
  await store.initialize();
  const [skill] = await store.importDirectory(directory);
  if (!skill) throw new Error('Missing imported skill');
  expect(skill.manualOnly).toBe(true);
  expect(store.snapshot()[0]?.body).toContain('references/rules.md');
  await store.setEnabled(skill.id, false);
  const restored = new SkillStore(file);
  await restored.initialize();
  expect(restored.snapshot()).toEqual([]);
  const updated = await restored.importDirectory(directory);
  expect(updated).toHaveLength(1);
  expect(updated[0]).toMatchObject({ id: skill.id, enabled: false });
  await restored.setEnabled(skill.id, true);
  expect(
    Buffer.from(restored.snapshot()[0]?.files['references/rules.md'] ?? '', 'base64').toString(),
  ).toContain('subject');
});

test('invalid skill packages do not replace existing records', async () => {
  const directory = test.info().outputPath('bad');
  await mkdir(directory, { recursive: true });
  const store = new SkillStore(new JsonFile(test.info().outputPath('skills.json')));
  await store.initialize();
  await expect(store.importDirectory(directory)).rejects.toThrow('SKILL.md');
  await writeFile(join(directory, 'SKILL.md'), '---\nname: invalid\n---\nBody');
  await expect(store.importDirectory(directory)).rejects.toThrow();
  expect(store.list()).toEqual([]);
});
