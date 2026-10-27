export interface AppearanceBridge {
  getAccentColor(): Promise<string | null>;
  onAccentColor(listener: (color: string | null) => void): () => void;
  /** macOS 全屏时红绿灯隐藏，标题栏按钮据此靠左。 */
  getFullScreen(): Promise<boolean>;
  onFullScreen(listener: (fullScreen: boolean) => void): () => void;
}
export function normalizeAccentColor(value: unknown): string | null {
  return typeof value === 'string' && /^[\da-f]{8}$/i.test(value) ? value.toLowerCase() : null;
}
