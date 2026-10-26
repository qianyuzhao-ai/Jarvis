import { randomUUID } from 'node:crypto';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { ProbeResult, ProviderInput, UpdateModelInput } from '../../../shared/models';
import { listRemoteModels, type ModelStore, type ResolvedModel } from '../model-store';
import { digitsPng, probeCode } from '../probe-image';
import { openAgent, replyFailure } from '../runtime';

class ProbeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Model settings shared by every project: providers, models, the default, connection tests and
 * the image probe. Changes wait until no round is in flight (`busy`).
 */
export class ModelAdmin {
  onChange: () => void = () => {};
  private operations = Promise.resolve();
  private testing = false;
  private testRun: { cancelled: boolean; sdk?: AgentSession } | null = null;
  constructor(
    readonly config: ModelStore,
    private root: string,
    private busy: () => boolean,
  ) {}
  get isTesting() {
    return this.testing;
  }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.operations.then(action);
    this.operations = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  private idle() {
    if (this.busy() || this.testing) throw new Error('请先停止或等待当前请求完成');
  }
  private configure(action: () => Promise<unknown>) {
    return this.exclusive(async () => {
      this.idle();
      await action();
      this.onChange();
      return this.config.view();
    });
  }
  removeModel(id: string) {
    return this.configure(() => this.config.removeModel(id));
  }
  setDefaultModel(id: string) {
    return this.configure(() => this.config.setDefault(id));
  }
  saveProvider(input: ProviderInput) {
    return this.exclusive(async () => {
      this.idle();
      const id = await this.config.saveProvider(input);
      this.onChange();
      return { id, settings: this.config.view() };
    });
  }
  setProviderModels(providerId: string, models: Parameters<ModelStore['setProviderModels']>[1]) {
    return this.configure(() => this.config.setProviderModels(providerId, models));
  }
  updateModel(input: UpdateModelInput) {
    return this.configure(() => this.config.updateModel(input));
  }
  removeProvider(id: string) {
    return this.configure(() => this.config.removeProvider(id));
  }
  /** Built-in providers answer a short prompt; custom ones list models unless a model ID is given. */
  testProvider(input: ProviderInput, modelId?: string) {
    return this.exclusive(async () => {
      this.idle();
      if (input.kind === 'custom' && !modelId) {
        const { apiKey } = this.config.connection(input);
        const listed = await listRemoteModels(input.baseUrl, apiKey);
        return `连接成功 · 获取到 ${listed.length} 个模型`;
      }
      const model = this.config.transient(input, modelId);
      await this.ask(model, '仅回复 OK');
      return `连接成功 · ${model.name} 已回复`;
    });
  }
  fetchProviderModels(input: ProviderInput) {
    return this.exclusive(async () => this.config.candidates(input));
  }
  /**
   * Sends a small image with four random digits and asks for them back. A correct answer means
   * the model reads images; a wrong answer or an explicit rejection means it does not; network
   * failures leave the capability unconfirmed.
   */
  probeVision(id: string) {
    return this.exclusive(async (): Promise<ProbeResult> => {
      this.idle();
      const model = this.config.resolve(id);
      if (model.kind === 'builtin') throw new Error('内置服务商的模型能力来自模型目录，无需检测');
      const code = probeCode();
      const image = {
        type: 'image' as const,
        data: digitsPng(code).toString('base64'),
        mimeType: 'image/png',
      };
      let reply: string;
      try {
        reply = await this.ask(
          { ...model, vision: 'supported', thinkingLevels: [] },
          '图片中是一个 4 位数字。只回复这 4 位数字，不要回复其他内容。',
          [image],
        );
      } catch (error) {
        const status = error instanceof ProbeError ? error.status : 0;
        if ([400, 415, 422].includes(status)) {
          await this.config.recordProbe(id, 'unsupported');
          this.onChange();
          return {
            vision: 'unsupported',
            message: `服务拒绝了图片输入（${status}），已标为不支持图片`,
          };
        }
        return { vision: 'unknown', message: '检测请求失败或超时，图片能力仍未确认，可稍后重试' };
      }
      const supported = reply.replace(/\s/g, '').includes(code);
      await this.config.recordProbe(id, supported ? 'supported' : 'unsupported');
      this.onChange();
      return supported
        ? { vision: 'supported', message: `检测通过：模型正确读出了测试图片中的数字 ${code}` }
        : {
            vision: 'unsupported',
            message: `模型没有读出测试图片中的数字 ${code}，已标为不支持图片`,
          };
    });
  }
  async cancel() {
    if (!this.testRun) return;
    this.testRun.cancelled = true;
    await this.testRun.sdk?.abort();
  }
  async settled() {
    await this.operations;
  }
  /** Runs one transient prompt for tests and probes, returning the reply text. */
  private async ask(
    model: ResolvedModel,
    prompt: string,
    images: { type: 'image'; data: string; mimeType: string }[] = [],
  ) {
    this.testing = true;
    const run = { cancelled: false, sdk: undefined as AgentSession | undefined };
    this.testRun = run;
    let sdk: AgentSession | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const runtime = await openAgent(this.root, randomUUID(), model, { transient: true });
      sdk = runtime.session;
      run.sdk = sdk;
      if (run.cancelled) throw new Error('连接测试已取消');
      timeout = setTimeout(() => {
        void sdk?.abort();
      }, 20000);
      try {
        await sdk.prompt(prompt, { expandPromptTemplates: false, images });
      } catch {
        throw new ProbeError(replyFailure(runtime.httpStatus()), runtime.httpStatus());
      }
      const last = sdk.messages.filter((m) => m.role === 'assistant').at(-1);
      const text =
        last?.content
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('')
          .trim() ?? '';
      if (!last || last.stopReason !== 'stop' || !text)
        throw new ProbeError(replyFailure(runtime.httpStatus()), runtime.httpStatus());
      return text;
    } finally {
      clearTimeout(timeout);
      sdk?.dispose();
      this.testing = false;
      this.testRun = null;
    }
  }
}
