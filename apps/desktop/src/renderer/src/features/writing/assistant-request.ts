const requests = new Map<string, string>();
export function requestWritingAssistant(id: string, prompt: string) {
  requests.set(id, prompt);
  window.dispatchEvent(new Event('jarvis:writing-assistant-request'));
}
export function takeWritingAssistantRequest(id: string) {
  const value = requests.get(id);
  requests.delete(id);
  return value;
}
