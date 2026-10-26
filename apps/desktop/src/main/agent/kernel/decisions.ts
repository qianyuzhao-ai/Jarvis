import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { decisionSchema, type Decision } from '../../../shared/agent-os';
import { JsonFile, readJson } from '../json-file';

/** An unanswered card is brought up again once after this long, then left alone. */
export const DECISION_REMINDER = 2 * 60 * 60_000;
const KEEP_CLOSED = 200;
const fileSchema = z.object({ version: z.literal(1), decisions: z.array(decisionSchema) });

/** The hash an approval binds to: the tool and its exact input, keys sorted. */
export function callHash(toolName: string, input: unknown) {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
          )
        : value;
  return createHash('sha256')
    .update(JSON.stringify([toolName, canonical(input ?? {})]))
    .digest('hex');
}

export const APPROVE = 0;

/**
 * Decision cards of one project. Only `answer`, which the IPC handler calls for the user's click,
 * can approve anything; an approval is a single-use grant for one exact tool call.
 */
export class DecisionStore {
  onChange: () => void = () => {};
  private decisions: Decision[] = [];
  private file: JsonFile;
  constructor(
    path: string,
    readonly projectId: string,
  ) {
    this.file = new JsonFile(path);
  }
  async initialize() {
    const raw = await readJson(this.file.path);
    if (raw) this.decisions = fileSchema.parse(raw).decisions;
  }
  list() {
    return this.decisions;
  }
  open(threadId?: string) {
    return this.decisions.filter(
      (d) => d.status === 'open' && (!threadId || d.threadId === threadId),
    );
  }
  get(id: string) {
    return this.decisions.find((d) => d.id === id);
  }
  async create(
    input: Pick<Decision, 'threadId' | 'question' | 'options' | 'recommended' | 'irreversible'> &
      Partial<Pick<Decision, 'reason' | 'tool' | 'budget'>>,
  ) {
    const now = Date.now();
    const decision: Decision = decisionSchema.parse({
      ...input,
      id: randomUUID(),
      projectId: this.projectId,
      status: 'open',
      remindAt: now + DECISION_REMINDER,
      createdAt: now,
    });
    this.decisions.push(decision);
    await this.save();
    return decision;
  }
  /** The open card already waiting for this exact call, if any. */
  pendingCall(threadId: string, toolName: string, inputHash: string) {
    return this.decisions.find(
      (d) =>
        d.status === 'open' &&
        d.threadId === threadId &&
        d.tool?.name === toolName &&
        d.tool.inputHash === inputHash,
    );
  }
  /** Takes the user's approval for this exact call, once. */
  async consumeGrant(threadId: string, toolName: string, inputHash: string) {
    const grant = this.decisions.find(
      (d) =>
        d.status === 'answered' &&
        d.threadId === threadId &&
        d.tool?.name === toolName &&
        d.tool.inputHash === inputHash &&
        d.answer?.option === APPROVE &&
        !d.consumedAt,
    );
    if (!grant) return false;
    grant.consumedAt = Date.now();
    await this.save();
    return true;
  }
  /** The user's answer; the caller must only pass clicks from the user's window. */
  async answer(id: string, option: number) {
    const decision = this.get(id);
    if (!decision || decision.status !== 'open') throw new Error('这张决策卡已处理或已撤回');
    if (option < 0 || option >= decision.options.length) throw new Error('没有这个选项');
    decision.status = 'answered';
    decision.answer = { option, at: Date.now() };
    await this.save();
    return decision;
  }
  async withdraw(id: string, threadId?: string) {
    const decision = this.get(id);
    if (!decision || decision.status !== 'open') return;
    if (threadId && decision.threadId !== threadId) throw new Error('只能撤回本线程的决策卡');
    decision.status = 'withdrawn';
    await this.save();
  }
  async withdrawThread(threadId: string) {
    let changed = false;
    for (const d of this.decisions)
      if (d.threadId === threadId && d.status === 'open') {
        d.status = 'withdrawn';
        changed = true;
      }
    if (changed) await this.save();
  }
  /** Cards due for their one reminder; they are marked so it never repeats. */
  async dueReminders(now = Date.now()) {
    const due = this.decisions.filter(
      (d) => d.status === 'open' && !d.remindedAt && d.remindAt !== undefined && d.remindAt <= now,
    );
    for (const d of due) d.remindedAt = now;
    if (due.length) await this.save();
    return due;
  }
  nextReminder() {
    return Math.min(
      ...this.decisions
        .filter((d) => d.status === 'open' && !d.remindedAt && d.remindAt !== undefined)
        .map((d) => d.remindAt as number),
    );
  }
  async removeThread(threadId: string) {
    this.decisions = this.decisions.filter((d) => d.threadId !== threadId);
    await this.save();
  }
  private async save() {
    const open = this.decisions.filter((d) => d.status === 'open');
    const closed = this.decisions.filter((d) => d.status !== 'open').slice(-KEEP_CLOSED);
    this.decisions = [...closed, ...open].sort((a, b) => a.createdAt - b.createdAt);
    await this.file.write({ version: 1, decisions: this.decisions });
    this.onChange();
  }
}
