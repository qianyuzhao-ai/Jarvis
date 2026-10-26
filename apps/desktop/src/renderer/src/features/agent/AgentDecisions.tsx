import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogIcon,
  AlertDialogTitle,
} from '@jarvis/ui/components/AlertDialog';
import { Button } from '@jarvis/ui/components/Button';
import { useEffect, useRef, useState } from 'react';
import { osValue, type Decision, type OsEvent } from '../../../../shared/agent-os';

/**
 * Decision cards of the Agent OS, one at a time, until the V1.0.0 decision card UI lands. Nothing
 * waits on a timer: "稍后" hides a card in this window and the thread keeps waiting for it.
 */
export function AgentDecisions() {
  const [decisions, setDecisions] = useState<(Decision & { threadTitle: string })[]>([]);
  const [later, setLater] = useState<string[]>([]);
  const answered = useRef(new Set<string>());
  useEffect(() => {
    const bridge = window.desktop?.os;
    if (!bridge) return;
    let mounted = true;
    const receive = ({ snapshot }: OsEvent) =>
      setDecisions(
        snapshot.threads.flatMap((t) => t.decisions.map((d) => ({ ...d, threadTitle: t.title }))),
      );
    const unsubscribe = bridge.onEvent(receive);
    void bridge.getSnapshot().then((result) => {
      if (mounted && result.ok) receive(result.value);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  const current = decisions.find((d) => !later.includes(d.id) && !answered.current.has(d.id));
  if (!current) return null;
  const answer = async (option: number) => {
    answered.current.add(current.id);
    setDecisions((list) => list.filter((d) => d.id !== current.id));
    try {
      osValue(await window.desktop!.os.answerDecision({ decisionId: current.id, option }));
    } catch {
      answered.current.delete(current.id);
    }
  };
  return (
    <AlertDialog
      key={current.id}
      open
      onOpenChange={(open) => {
        if (!open) setLater((ids) => [...ids, current.id]);
      }}
    >
      <AlertDialogContent>
        <AlertDialogIcon />
        <AlertDialogTitle>{current.question}</AlertDialogTitle>
        <AlertDialogDescription className="max-h-48 overflow-auto break-all whitespace-pre-wrap">
          {`线程：${current.threadTitle}`}
          {current.reason ? `\n${current.reason}` : ''}
          {current.tool ? `\n\n${current.tool.detail}` : ''}
          {current.options
            .map(
              (o, i) =>
                `\n· ${o.label}${i === current.recommended ? '（推荐）' : ''}：${o.consequence}`,
            )
            .join('')}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={() => setLater((ids) => [...ids, current.id])}>
            稍后
          </Button>
          {current.options.map((o, i) => (
            <Button
              key={o.label}
              variant={i === current.recommended ? 'default' : 'secondary'}
              onClick={() => void answer(i)}
            >
              {o.label}
            </Button>
          ))}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
