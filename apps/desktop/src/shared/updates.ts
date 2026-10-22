export type UpdatePhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing';

export interface UpdateState {
  revision: number;
  phase: UpdatePhase;
  currentVersion: string;
  nextVersion?: string;
  checkedAt?: number;
  message?: string;
  error?: string;
  errorAction?: 'check' | 'download' | 'install';
  progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number };
}

export type UpdateResult = { ok: true; value: UpdateState } | { ok: false; error: string };
export interface UpdateBridge {
  getState(): Promise<UpdateResult>;
  check(): Promise<UpdateResult>;
  download(): Promise<UpdateResult>;
  install(): Promise<UpdateResult>;
  onState(listener: (state: UpdateState) => void): () => void;
  onPrepareInstall(listener: (id: string) => void): () => void;
  completePreparation(input: { id: string; ready: boolean; error?: string }): Promise<UpdateResult>;
}
