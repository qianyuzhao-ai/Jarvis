import { randomUUID } from 'node:crypto';

export class InstallPreparation {
  private pending?: {
    id: string;
    owner: number;
    resolve: () => void;
    reject: (error: Error) => void;
  };
  async request(owner: number, send: (id: string) => void, timeout = 15_000) {
    if (this.pending) throw new Error('正在准备安装，请稍候。');
    const id = randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        this.pending = { id, owner, resolve, reject };
        timer = setTimeout(() => reject(new Error('保存确认超时，未启动安装，请重试。')), timeout);
        send(id);
      });
    } finally {
      clearTimeout(timer);
      this.pending = undefined;
    }
  }
  complete(owner: number, input: { id: string; ready: boolean; error?: string }) {
    const pending = this.pending;
    if (!pending || pending.owner !== owner || pending.id !== input.id)
      throw new Error('安装保存确认已过期或来源不匹配。');
    this.pending = undefined;
    if (input.ready) pending.resolve();
    else pending.reject(new Error(input.error || '内容尚未保存，已取消安装。'));
  }
  cancel(owner: number) {
    if (this.pending?.owner === owner) this.pending.reject(new Error('窗口已关闭，已取消安装。'));
  }
}
