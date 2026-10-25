import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { skillRuntime } from '../src/main/agent/skill-runtime';
import { openAgent } from '../src/main/agent/runtime';
import type { ChatMessage } from '../src/shared/agent';
import { relayModel } from './helpers/models';
import type { StoredSkill } from '../src/main/agent/skill-store';

const skill: StoredSkill = {
  id: randomUUID(),
  name: 'shot-plan',
  description: 'Use when planning shots',
  enabled: true,
  manualOnly: false,
  importedAt: 1,
  body: 'Make a shot list. Read references/rules.md.',
  files: {
    'references/rules.md': Buffer.from('RULE: keep the subject consistent.').toString('base64'),
  },
};
function output(): ChatMessage {
  return { id: randomUUID(), role: 'assistant', text: '', status: 'running' };
}
test('skill activation honors explicit-only rules and restricts reference reads to loaded packages', async () => {
  const manual = { ...skill, name: 'manual-plan', manualOnly: true };
  const normal = skillRuntime([skill, manual], 'plan shots', output(), () => {});
  const [load, read] = normal.tools;
  if (!load || !read) throw new Error('Missing skill tools');
  expect(normal.context).toContain('shot-plan');
  expect(normal.context).not.toContain('manual-plan');
  await expect(load.execute('id', { name: 'manual-plan' }, undefined)).rejects.toThrow('主动选择');
  await expect(
    read.execute('id', { name: 'shot-plan', path: 'references/rules.md' }, undefined),
  ).rejects.toThrow('先加载');
  await load.execute('id', { name: 'shot-plan' }, undefined);
  await expect(
    read.execute('id', { name: 'shot-plan', path: '../secrets' }, undefined),
  ).rejects.toThrow('清单');
  const explicit = skillRuntime(
    [manual],
    '/skill:manual-plan make three shots',
    output(),
    () => {},
  );
  expect(explicit.prompt).toContain('make three shots');
  expect(explicit.prompt).toContain('Make a shot list');
  expect(() => skillRuntime([], '/missing', output(), () => {})).toThrow('未知');
});

test('Pi can choose a skill, load its references and answer while filesystem tools stay disabled', async () => {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const step = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    const delta =
      step < 2
        ? {
            tool_calls: [
              {
                index: 0,
                id: `skill-${step}`,
                type: 'function',
                function: {
                  name: step === 0 ? 'load_skill' : 'read_skill_resource',
                  arguments: JSON.stringify(
                    step === 0
                      ? { name: 'shot-plan' }
                      : { name: 'shot-plan', path: 'references/rules.md' },
                  ),
                },
              },
            ],
          }
        : { content: '按技能规则保持主体一致。' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [d, finish] of [
      [delta, null],
      [{}, step < 2 ? 'tool_calls' : 'stop'],
    ])
      res.write(
        `data: ${JSON.stringify({ id: 'skills', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta: d, finish_reason: finish }] })}\n\n`,
      );
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server');
  const out = output();
  const skills = skillRuntime([skill], 'Plan shots', out, () => {});
  const runtime = await openAgent(
    test.info().outputPath('agent'),
    randomUUID(),
    relayModel({ model: 'mock', baseUrl: `http://127.0.0.1:${address.port}/v1` }),
    false,
    undefined,
    skills,
  );
  try {
    expect(runtime.session.getActiveToolNames().sort()).toEqual([
      'load_skill',
      'read_skill_resource',
    ]);
    await runtime.session.prompt(skills.prompt);
    expect(requests).toHaveLength(3);
    expect(JSON.stringify(requests[1])).toContain('Make a shot list');
    expect(JSON.stringify(requests[2])).toContain('RULE: keep the subject consistent');
    expect(out.activities?.map((a) => a.label).join(' ')).toContain('自动匹配');
  } finally {
    runtime.session.dispose();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
