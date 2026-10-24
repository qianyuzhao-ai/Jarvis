import { useEffect } from 'react';
import { useAgent } from '../agent/use-agent';
import { ChatPage } from '../agent/ChatPage';
import type { RelayView } from '../../../../shared/agent';
export function ChatTab({
  sessionId,
  configuration,
  onSession,
  onConfigure,
}: {
  sessionId: string | null;
  configuration: RelayView;
  onSession: (id: string, title: string) => void;
  onConfigure: () => void;
}) {
  const agent = useAgent(undefined, sessionId);
  useEffect(() => {
    agent.setConfiguration(configuration);
  }, [configuration, agent.setConfiguration]);
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
