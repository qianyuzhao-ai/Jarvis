import { useState } from 'react';
import { osValue, type OsSnapshot, type ThreadTarget } from '../../../../shared/agent-os';
import { osBridge, useAgent, useOsSnapshot } from './use-agent';

export const targetKey = (target: ThreadTarget) =>
  target.kind === 'canvas'
    ? `canvas:${target.canvasId}`
    : `document:${target.rootId}:${target.path}`;
const sameTarget = (a: ThreadTarget, b: ThreadTarget) => targetKey(a) === targetKey(b);

/** The current project's threads bound to a canvas or document, most recent first. */
export function spaceThreads(snapshot: OsSnapshot, target: ThreadTarget) {
  return snapshot.threads
    .filter(
      (t) =>
        t.projectId === snapshot.currentProjectId && t.targets.some((x) => sameTarget(x, target)),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The thread a canvas or document sidebar shows: the one the user picked, else the most recent
 * open one bound to the target. With none, the first message starts a thread bound to it.
 */
export function useSpaceThread(target: ThreadTarget | null) {
  const os = useOsSnapshot();
  const key = target ? targetKey(target) : '';
  // `id: null` is a new thread the user asked for; no choice follows the most recent one.
  const [choice, setChoice] = useState<{ key: string; id: string | null } | null>(null);
  const threads = target ? spaceThreads(os.snapshot, target) : [];
  const latest = threads.find((t) => !t.resolved && t.state !== 'stopped') ?? null;
  const picked =
    choice?.key === key && threads.some((t) => t.id === choice.id) ? choice.id : undefined;
  const id = choice?.key === key && choice.id === null ? null : (picked ?? latest?.id ?? null);
  const agent = useAgent(
    id,
    (created) => setChoice({ key, id: created }),
    target
      ? async (input) => osValue(await osBridge().startSpaceThread({ target, ...input }))
      : undefined,
  );
  return {
    ...agent,
    threads,
    /** A round of this thread is running or queued: the target is being worked on. */
    busy: !!agent.session && agent.session.id in agent.snapshot.runs,
    select: (threadId: string) => setChoice({ key, id: threadId }),
    newThread: () => setChoice({ key, id: null }),
  };
}
