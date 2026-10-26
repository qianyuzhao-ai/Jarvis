import { createHash } from 'node:crypto';

/** One message between Agents may carry at most this much text. */
export const MAILBOX_MESSAGE_LIMIT = 8000;
const WINDOW = 10 * 60_000;
/** Messages one sender may send one receiver per window. */
const BURST = 6;
/** Wakes a session may have queued at once. */
export const INBOX_LIMIT = 50;

/**
 * Limits for messages between Agents (Coordinator ↔ threads, thread ↔ thread): size, bursts from
 * one sender, and repeats of the same text, so two Agents answering each other politely cannot
 * loop. Messages are plain text and never carry the sender's context or authority.
 */
export class Mailbox {
  private sent = new Map<string, { at: number; hash: string }[]>();
  check(from: string, to: string, text: string, now = Date.now()) {
    if (from === to) throw new Error('不能给自己发消息');
    if (text.length > MAILBOX_MESSAGE_LIMIT)
      throw new Error(`消息超过 ${MAILBOX_MESSAGE_LIMIT} 字，请把长内容写成文件后发送引用`);
    const key = `${from}>${to}`;
    const hash = createHash('sha256').update(text.trim()).digest('hex');
    const recent = (this.sent.get(key) ?? []).filter((s) => now - s.at < WINDOW);
    if (recent.some((s) => s.hash === hash)) throw new Error('相同内容刚刚已经发送过，未重复发送');
    if (recent.length >= BURST)
      throw new Error('短时间内给同一对象发送的消息过多，请稍后或合并后再发');
    recent.push({ at: now, hash });
    this.sent.set(key, recent);
  }
  forget(sessionId: string) {
    for (const key of [...this.sent.keys()])
      if (key.startsWith(`${sessionId}>`) || key.endsWith(`>${sessionId}`)) this.sent.delete(key);
  }
}
