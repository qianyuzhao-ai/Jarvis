import type { ResultCard } from '../../../shared/agent-cards';

export type BusEvent = { type: 'card'; sessionId: string; card: ResultCard };

/** Events between Agent threads; the main Agent reacts to them from A1b-3 on. */
export class AgentBus {
  private listeners = new Set<(event: BusEvent) => void>();
  publish(event: BusEvent) {
    for (const listener of this.listeners) listener(event);
  }
  subscribe(listener: (event: BusEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
