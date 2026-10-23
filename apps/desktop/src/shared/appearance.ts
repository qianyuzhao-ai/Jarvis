export interface AppearanceBridge {
  getAccentColor(): Promise<string | null>;
  onAccentColor(listener: (color: string | null) => void): () => void;
}
export function normalizeAccentColor(value: unknown): string | null {
  return typeof value === 'string' && /^[\da-f]{8}$/i.test(value) ? value.toLowerCase() : null;
}
