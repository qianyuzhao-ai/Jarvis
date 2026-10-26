import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

type Message = { role: string; content: unknown };
type Body = { messages: Message[] };
type Step = (results: string[]) => [string, unknown];

const text = (m?: Message) =>
  typeof m?.content === 'string'
    ? m.content
    : Array.isArray(m?.content)
      ? (m.content as { text?: string }[]).map((p) => p.text ?? '').join('')
      : '';

/**
 * A mock model that plays both Agent OS roles for window tests. The Coordinator opens one thread
 * for each user message and repeats the thread's result summary when it hears back; the thread
 * runs `steps` in order. When a step is held for the user's approval (a decision card), the
 * thread ends its round and, once approved, runs that step again and carries on, then reports
 * `done` as its result.
 */
export async function osRelay(options: {
  title: string;
  capabilities: string[];
  steps: Step[];
  done: string;
}) {
  const results: string[] = [];
  let blocked = -1;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: Body = JSON.parse(Buffer.concat(chunks).toString());
    const system = text(body.messages.find((m) => m.role === 'system'));
    const lastUser = body.messages.findLastIndex((m) => m.role === 'user');
    const prompt = text(body.messages[lastUser]);
    const wake = prompt.slice(Math.max(0, prompt.lastIndexOf('[唤醒')));
    const round = body.messages
      .slice(lastUser + 1)
      .filter((m) => m.role === 'tool')
      .map(text);
    const step = round.length;
    let reply: { text: string } | { call: [string, unknown] };
    if (system.includes('协调者（Coordinator）')) {
      if (wake.includes('线程状态通知'))
        reply = { text: /"summary":"([^"]*)"/.exec(wake)?.[1] ?? '线程完成了。' };
      else if (step === 0)
        reply = {
          call: [
            'spawn_thread',
            {
              title: options.title,
              objective:
                /<user_message[^>]*>\n([\s\S]*?)\n<\/user_message>/.exec(wake)?.[1] ?? wake,
              outputFormat: '完成后汇报结果',
              capabilities: options.capabilities,
              citeUserMessageIds: [/<user_message id="([0-9a-f-]{36})"/.exec(wake)?.[1]].filter(
                Boolean,
              ),
            },
          ],
        };
      else reply = { text: `已交给线程「${options.title}」。` };
    } else {
      const resumed = wake.includes('决策结果');
      if (!resumed && round.at(-1)?.includes('决策卡')) {
        blocked = step - 1;
        reply = { text: '我需要你批准这一步。' };
      } else {
        const index = (resumed ? blocked : 0) + step;
        if (round.length) results.push(round.at(-1) as string);
        const next = options.steps[index];
        if (next) reply = { call: next(results) };
        else if (index === options.steps.length)
          reply = {
            call: ['report_result', { status: 'done', summary: options.done, resolved: false }],
          };
        else reply = { text: options.done };
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(
      ('call' in reply
        ? chunk({
            tool_calls: [
              {
                index: 0,
                id: randomUUID(),
                type: 'function',
                function: { name: reply.call[0], arguments: JSON.stringify(reply.call[1]) },
              },
            ],
          }) + chunk({}, 'tool_calls')
        : chunk({ content: reply.text }) + chunk({}, 'stop')) + 'data: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  return { server, url: `http://127.0.0.1:${address.port}/v1` };
}
