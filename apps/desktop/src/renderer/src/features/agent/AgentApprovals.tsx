import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogIcon,
  AlertDialogTitle,
} from '@jarvis/ui/components/AlertDialog';
import { Button } from '@jarvis/ui/components/Button';
import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequest } from '../../../../shared/agent-approval';

/**
 * Asks about Agent tool calls that need the user's approval, one at a time. The main process owns
 * the list: a request disappears when it is answered, times out or its round stops.
 */
export function AgentApprovals() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const answered = useRef(new Set<string>());
  useEffect(() => {
    const bridge = window.desktop?.agent;
    if (!bridge) return;
    let mounted = true;
    const unsubscribe = bridge.onApprovals((next) => setRequests(next));
    void bridge.listApprovals().then((result) => {
      if (mounted && result.ok) setRequests(result.value);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  const current = requests[0];
  if (!current) return null;
  const answer = (approved: boolean) => {
    if (answered.current.has(current.id)) return;
    answered.current.add(current.id);
    setRequests((list) => list.filter((r) => r.id !== current.id));
    void window.desktop?.agent.respondApproval({ id: current.id, approved });
  };
  return (
    <AlertDialog
      key={current.id}
      open
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogIcon />
        <AlertDialogTitle>允许 Jarvis 执行“{current.title}”？</AlertDialogTitle>
        <AlertDialogDescription className="max-h-40 overflow-auto break-all whitespace-pre-wrap">
          {current.detail}
        </AlertDialogDescription>
        <p className="w-full text-footnote text-fg-secondary">
          5 分钟内未确认将自动拒绝，不会执行此操作。
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary" onClick={() => answer(false)}>
              拒绝
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={() => answer(true)}>允许</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
