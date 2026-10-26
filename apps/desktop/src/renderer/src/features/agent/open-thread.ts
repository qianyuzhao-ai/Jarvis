/** Opens a conversation (a thread or a Coordinator) in a home tab; the window shell sets it. */
let opener: (sessionId: string) => void = () => {};
export function setThreadOpener(open: (sessionId: string) => void) {
  opener = open;
  return () => {
    opener = () => {};
  };
}
export function openThread(sessionId: string) {
  opener(sessionId);
}
