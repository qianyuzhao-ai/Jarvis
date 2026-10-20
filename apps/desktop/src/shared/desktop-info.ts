export interface DesktopInfo {
  readonly platform: string;
  readonly versions: {
    readonly electron: string;
    readonly chromium: string;
    readonly node: string;
  };
}
