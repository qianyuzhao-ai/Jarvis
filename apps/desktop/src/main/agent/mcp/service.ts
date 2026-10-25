import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CallToolResult,
  McpClient,
  StdioTransport,
  StreamableHttpTransport,
  type Tool,
} from '@earendil-works/pi-mcp';
import {
  adaptOAuthProvider,
  authorizeMcp,
  McpOAuthProvider,
  OAuthCallbackServer,
  type McpOAuthState,
  type McpOAuthStateStore,
} from '@earendil-works/pi-mcp/oauth';
import { z } from 'zod';
import {
  mcpServerInputSchema,
  type McpServerInput,
  type McpServerView,
  type McpStatus,
} from '../../../shared/agent-mcp';
import { JsonFile } from '../json-file';
import type { KeyCipher } from '../key-cipher';

const storedSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.enum(['stdio', 'http']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().optional(),
    /** Environment variables (stdio) or headers (http), each value encrypted. */
    secrets: z.record(z.string(), z.string()),
    enabled: z.boolean(),
  })
  .strict();
const fileSchema = z.object({ version: z.literal(1), servers: z.array(storedSchema) }).strict();
type Stored = z.infer<typeof storedSchema>;
type Live = { client?: McpClient; tools: Tool[]; status: McpStatus; error?: string };
const CONNECT_TIMEOUT = 30_000;
const CALL_TIMEOUT = 120_000;
/** Names that act on the outside world; such tools always ask, whatever the server claims. */
const ACTING =
  /send|delete|remove|trash|write|create|update|post|reply|forward|draft|upload|move|edit|modify|insert|put|patch|share|invite|publish|archive|label|set_/i;

/** Read-only by the server's own annotation and not named like an action. */
export function readOnlyTool(tool: Tool) {
  return tool.annotations?.readOnlyHint === true && !ACTING.test(tool.name);
}

export interface McpHost {
  /** Opens a sign-in page in the user's browser. */
  openExternal(url: string): void;
  /** Asks the user, outside the renderer, whether a local command may run. */
  confirmCommand(server: { name: string; commandLine: string }): Promise<boolean>;
}

/**
 * MCP servers the user added for the main Agent, run from the main process with the pi MCP client
 * over stdio or Streamable HTTP. Credentials (headers, environment values, OAuth tokens) are kept
 * encrypted with the system keychain. A server is connected while enabled; its tools are offered
 * to the main Agent through the mcp pack.
 */
export class McpService {
  onChange: () => void = () => {};
  private servers: Stored[] = [];
  private live = new Map<string, Live>();
  private connecting = new Map<string, Promise<void>>();
  private file: JsonFile;
  constructor(
    file: string,
    private oauthDir: string,
    private cipher: KeyCipher,
    private host: McpHost,
  ) {
    this.file = new JsonFile(file);
  }
  async initialize() {
    const raw = await readFile(this.file.path, 'utf8').catch(() => null);
    const parsed = raw ? fileSchema.safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) this.servers = parsed.data.servers;
    for (const server of this.servers) if (server.enabled) void this.connect(server.id);
  }
  view(): McpServerView[] {
    return this.servers.map((s) => {
      const live = this.live.get(s.id);
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        target: s.type === 'stdio' ? [s.command, ...(s.args ?? [])].join(' ') : (s.url ?? ''),
        secretKeys: Object.keys(s.secrets),
        enabled: s.enabled,
        status: s.enabled ? (live?.status ?? 'connecting') : 'disabled',
        ...(live?.error ? { error: live.error } : {}),
        tools: (live?.tools ?? []).map((t) => ({
          name: t.name,
          ...(t.title ? { title: t.title } : {}),
          readOnly: readOnlyTool(t),
        })),
      };
    });
  }
  /** Connected servers' tools, for one round of the main Agent. */
  tools() {
    return this.servers.flatMap((server) => {
      const live = this.live.get(server.id);
      return live?.status === 'connected' ? live.tools.map((tool) => ({ server, tool })) : [];
    });
  }
  async add(raw: McpServerInput) {
    const input = mcpServerInputSchema.parse(raw);
    if (this.servers.some((s) => s.name === input.name)) throw new Error('已有同名 MCP 服务');
    const values = input.type === 'stdio' ? input.env : input.headers;
    if (Object.keys(values).length && !this.cipher.available())
      throw new Error('系统钥匙串不可用，无法安全保存凭据');
    if (input.type === 'stdio') {
      const commandLine = [input.command, ...input.args].join(' ');
      if (!(await this.host.confirmCommand({ name: input.name, commandLine })))
        throw new Error('已取消添加');
    }
    const server: Stored = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      ...(input.type === 'stdio'
        ? { command: input.command, args: input.args }
        : { url: input.url }),
      secrets: Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, this.cipher.encrypt(v)]),
      ),
      enabled: true,
    };
    await this.save([...this.servers, server]);
    void this.connect(server.id);
    return this.view();
  }
  async remove(id: string) {
    this.server(id);
    await this.disconnect(id);
    await this.save(this.servers.filter((s) => s.id !== id));
    await unlink(this.oauthFile(id)).catch(() => {});
    this.live.delete(id);
    this.onChange();
    return this.view();
  }
  async setEnabled(id: string, enabled: boolean) {
    const server = this.server(id);
    await this.save(this.servers.map((s) => (s.id === id ? { ...s, enabled } : s)));
    if (enabled) void this.connect(server.id);
    else await this.disconnect(id);
    this.onChange();
    return this.view();
  }
  async reconnect(id: string) {
    this.server(id);
    await this.disconnect(id);
    await this.connect(id);
    return this.view();
  }
  /** Signs in to an HTTP server with OAuth in the user's browser, then reconnects. */
  async signIn(id: string) {
    const server = this.server(id);
    if (server.type !== 'http' || !server.url) throw new Error('只有 HTTP 服务需要登录');
    this.set(id, { status: 'signing_in' });
    const callback = await OAuthCallbackServer.listen({ port: 0, timeoutMs: 300_000 });
    try {
      let authorizationUrl: URL | undefined;
      const provider = new McpOAuthProvider({
        serverUrl: server.url,
        redirectUrl: callback.redirectUrl,
        clientMetadata: { client_name: 'Jarvis' },
        store: this.oauthStore(id),
        onRedirect: (url) => {
          authorizationUrl = url;
        },
      });
      if (
        (await authorizeMcp(provider, { serverUrl: server.url, skipRefresh: true })) !==
        'AUTHORIZED'
      ) {
        if (!authorizationUrl || !['https:', 'http:'].includes(authorizationUrl.protocol))
          throw new Error('服务没有提供可用的登录地址');
        this.host.openExternal(authorizationUrl.href);
        const { code, iss } = await callback.waitForCallback(await provider.state());
        await authorizeMcp(provider, { serverUrl: server.url, authorizationCode: code, iss });
      }
    } catch (error) {
      this.set(id, {
        status: 'needs_auth',
        error: error instanceof Error ? error.message : '登录失败',
      });
      throw error;
    } finally {
      await callback.close();
    }
    return this.reconnect(id);
  }
  /** Calls a tool, reconnecting first if the server dropped. */
  async call(id: string, name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    let live = this.live.get(id);
    if (live?.client?.connectionState !== 'connected') {
      await this.connect(id);
      live = this.live.get(id);
    }
    if (!live?.client || live.status !== 'connected')
      throw new Error(live?.error ?? 'MCP 服务未连接');
    return (await live.client.callTool(name, args, {
      signal,
      timeoutMs: CALL_TIMEOUT,
    })) as CallToolResult;
  }
  async dispose() {
    await Promise.all(this.servers.map((s) => this.disconnect(s.id)));
  }
  private server(id: string) {
    const server = this.servers.find((s) => s.id === id);
    if (!server) throw new Error('没有这个 MCP 服务');
    return server;
  }
  private set(id: string, change: Partial<Live>) {
    const current = this.live.get(id) ?? { tools: [], status: 'connecting' as McpStatus };
    const next = { ...current, ...change };
    if (!('error' in change)) delete next.error;
    this.live.set(id, next);
    this.onChange();
  }
  private connect(id: string) {
    const pending = this.connecting.get(id);
    if (pending) return pending;
    const task = this.open(id).finally(() => this.connecting.delete(id));
    this.connecting.set(id, task);
    return task;
  }
  private async open(id: string) {
    const server = this.server(id);
    if (!server.enabled) return;
    this.set(id, { status: 'connecting', tools: [] });
    const secrets = Object.fromEntries(
      Object.entries(server.secrets).map(([k, v]) => [k, this.cipher.decrypt(v)]),
    );
    const client = new McpClient({
      name: 'Jarvis',
      version: '1',
      requestTimeoutMs: CONNECT_TIMEOUT,
    });
    try {
      const transport =
        server.type === 'stdio'
          ? new StdioTransport({
              command: server.command ?? '',
              args: server.args ?? [],
              env: secrets,
              inheritEnv: true,
              stderr: 'pipe',
            })
          : new StreamableHttpTransport({
              url: server.url ?? '',
              headers: secrets,
              ...(Object.keys(secrets).some((k) => k.toLowerCase() === 'authorization')
                ? {}
                : { authProvider: adaptOAuthProvider(this.refreshProvider(server)) }),
            });
      await client.connect(transport);
      const tools = await client.listTools();
      client.onClose(() => {
        if (this.live.get(id)?.client === client)
          this.set(id, {
            status: 'error',
            error: '连接已断开，调用时会自动重连',
            client: undefined,
            tools: [],
          });
      });
      this.set(id, { status: 'connected', tools, client });
    } catch (error) {
      await client.close().catch(() => {});
      const name = error instanceof Error ? error.name : '';
      const auth =
        /AuthorizationRequired|AuthRequired/.test(name) ||
        (error as { status?: number }).status === 401;
      this.set(id, {
        status: auth ? 'needs_auth' : 'error',
        error: auth
          ? '需要登录'
          : error instanceof Error
            ? error.message.slice(0, 500)
            : '连接失败',
        tools: [],
        client: undefined,
      });
    }
  }
  private async disconnect(id: string) {
    await this.connecting.get(id)?.catch(() => {});
    const live = this.live.get(id);
    this.live.set(id, { tools: [], status: 'disabled' });
    await live?.client?.close().catch(() => {});
  }
  /** Sends stored tokens and refreshes them; a missing or refused grant means signing in again. */
  private refreshProvider(server: Stored) {
    return new McpOAuthProvider({
      serverUrl: server.url ?? '',
      redirectUrl: 'http://127.0.0.1/callback',
      clientMetadata: { client_name: 'Jarvis' },
      store: this.oauthStore(server.id),
      onRedirect: () => {},
    });
  }
  private oauthFile(id: string) {
    return join(this.oauthDir, `${id}.json`);
  }
  /** OAuth state for one server, encrypted as a whole with the system keychain. */
  private oauthStore(id: string): McpOAuthStateStore {
    const file = new JsonFile(this.oauthFile(id));
    return {
      load: async () => {
        const raw = await readFile(file.path, 'utf8').catch(() => null);
        if (!raw) return undefined;
        try {
          return JSON.parse(this.cipher.decrypt(JSON.parse(raw).state)) as McpOAuthState;
        } catch {
          return undefined;
        }
      },
      save: async (state) => {
        if (!this.cipher.available()) throw new Error('系统钥匙串不可用，无法保存登录状态');
        await file.write({ version: 1, state: this.cipher.encrypt(JSON.stringify(state)) });
      },
    };
  }
  private async save(servers: Stored[]) {
    await this.file.write({ version: 1, servers });
    this.servers = servers;
  }
}
