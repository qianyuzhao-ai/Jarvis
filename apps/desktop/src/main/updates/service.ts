import type { UpdateState } from '../../shared/updates';

export type UpdateEvent =
  | { type: 'available'; version: string }
  | { type: 'current' }
  | { type: 'progress'; progress: NonNullable<UpdateState['progress']> }
  | { type: 'downloaded' }
  | { type: 'error'; message: string };

export interface UpdateBackend {
  check(): Promise<void>;
  download(): Promise<void>;
  quitAndInstall(): void;
  subscribe(listener: (event: UpdateEvent) => void): () => void;
}

export class UpdateService {
  private state: UpdateState;
  private readonly unsubscribe: () => void;
  private startup?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;
  onChange: (state: UpdateState) => void = () => {};

  constructor(
    private readonly backend: UpdateBackend,
    version: string,
    disabledReason?: string,
  ) {
    this.state = {
      revision: 0,
      phase: disabledReason ? 'disabled' : 'idle',
      currentVersion: version,
      message: disabledReason,
    };
    this.unsubscribe = backend.subscribe((event) => this.receive(event));
  }
  snapshot(): UpdateState {
    return structuredClone(this.state);
  }
  private change(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.onChange(this.snapshot());
  }
  private receive(event: UpdateEvent) {
    const phase = this.state.phase;
    if (event.type === 'error') return this.fail(event.message);
    if (phase === 'checking' && (event.type === 'available' || event.type === 'current')) {
      this.change({
        phase: event.type === 'available' ? 'available' : 'idle',
        nextVersion: event.type === 'available' ? event.version : undefined,
        checkedAt: Date.now(),
      });
    } else if (phase === 'downloading' && event.type === 'progress') {
      const p = event.progress;
      if (Object.values(p).every(Number.isFinite))
        this.change({
          progress: {
            percent: Math.min(100, Math.max(0, p.percent)),
            transferred: Math.max(0, p.transferred),
            total: Math.max(0, p.total),
            bytesPerSecond: Math.max(0, p.bytesPerSecond),
          },
        });
    } else if (phase === 'downloading' && event.type === 'downloaded') {
      this.change({ phase: 'downloaded', progress: undefined });
    }
  }
  private fail(message: string) {
    if (this.state.phase === 'checking')
      this.change({
        phase: this.state.nextVersion ? 'available' : 'idle',
        error: message,
        errorAction: 'check',
      });
    else if (this.state.phase === 'downloading')
      this.change({
        phase: 'available',
        error: message,
        errorAction: 'download',
        progress: undefined,
      });
    else if (this.state.phase === 'installing')
      this.change({ phase: 'available', error: message, errorAction: 'download' });
  }
  async check() {
    if (!['idle', 'available'].includes(this.state.phase)) return this.snapshot();
    this.change({
      phase: 'checking',
      error: undefined,
      errorAction: undefined,
      message: undefined,
    });
    try {
      await this.backend.check();
    } catch {
      this.fail('无法检查更新，请检查网络后重试。');
    }
    return this.snapshot();
  }
  async download() {
    if (this.state.phase !== 'available') return this.snapshot();
    this.change({
      phase: 'downloading',
      error: undefined,
      errorAction: undefined,
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    });
    try {
      await this.backend.download();
    } catch {
      this.fail('更新下载或校验失败，请重试下载。');
    }
    return this.snapshot();
  }
  async install(action: () => Promise<boolean>) {
    if (this.state.phase !== 'downloaded') return this.snapshot();
    this.change({ phase: 'installing', error: undefined, errorAction: undefined });
    try {
      if (!(await action())) this.change({ phase: 'downloaded' });
    } catch (error) {
      this.change({
        phase: 'downloaded',
        errorAction: 'install',
        error: error instanceof Error ? error.message : '安装未能启动，请重试。',
      });
    }
    return this.snapshot();
  }
  startAutomaticChecks(delay = 15_000, interval = 4 * 60 * 60 * 1000) {
    if (this.state.phase === 'disabled' || this.startup || this.interval) return;
    this.startup = setTimeout(() => void this.check(), delay);
    this.interval = setInterval(() => void this.check(), interval);
    this.startup.unref();
    this.interval.unref();
  }
  dispose() {
    clearTimeout(this.startup);
    clearInterval(this.interval);
    this.unsubscribe();
  }
}
