import { useEffect } from 'react';
import { useAgent } from '../agent/use-agent';
import { ChatPage } from '../agent/ChatPage';
export function ChatTab({
  sessionId,
  onSession,
  onConfigure,
}: {
  sessionId: string | null;
  onSession: (id: string, title: string) => void;
  onConfigure: () => void;
}) {
  const agent = useAgent(sessionId);
  const id = agent.session?.id,
    title = agent.session?.title;
  useEffect(() => {
    if (id && title) onSession(id, title);
  }, [id, title, onSession]);
  return (
    <ChatPage
      key={`${agent.session?.id ?? 'draft'}-${agent.draftKey}`}
      agent={agent}
      onConfigure={onConfigure}
    />
  );
}
