import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { McpService } from '../src/main/agent/mcp/service';

const cipher: KeyCipher = {
  available: () => true,
  encrypt: (t) => `enc:${Buffer.from(t).toString('base64')}`,
  decrypt: (t) => Buffer.from(t.slice(4), 'base64').toString(),
};
const fixture = resolve(import.meta.dirname, 'fixtures', 'mcp-server.mjs');

test('a local MCP server needs the user to allow its command, keeps credentials encrypted and lists tools', async () => {
  const dir = test.info().outputPath('mcp');
  const asked: string[] = [];
  let allow = false;
  const mcp = new McpService(join(dir, 'mcp.json'), join(dir, 'oauth'), cipher, {
    openExternal: () => {},
    confirmCommand: async ({ commandLine }) => {
      asked.push(commandLine);
      return allow;
    },
  });
  await mcp.initialize();
  const input = {
    type: 'stdio' as const,
    name: 'mail',
    command: process.execPath,
    args: [fixture],
    env: { MAIL_TOKEN: 'secret-token' },
  };
  await expect(mcp.add(input)).rejects.toThrow('已取消');
  expect(mcp.view()).toEqual([]);
  allow = true;
  await expect(mcp.add({ ...input, name: 'Bad Name' })).rejects.toThrow();
  await mcp.add(input);
  expect(asked).toEqual([`${process.execPath} ${fixture}`, `${process.execPath} ${fixture}`]);
  await expect.poll(() => mcp.view()[0]?.status).toBe('connected');
  expect(mcp.view()[0]).toMatchObject({
    name: 'mail',
    type: 'stdio',
    secretKeys: ['MAIL_TOKEN'],
    tools: [
      { name: 'search_mail', title: '搜索邮件', readOnly: true },
      // Says read-only, but its name sends: it still asks.
      { name: 'send_mail', readOnly: false },
      { name: 'create_draft', readOnly: false },
    ],
  });
  const stored = await readFile(join(dir, 'mcp.json'), 'utf8');
  expect(stored).not.toContain('secret-token');
  expect(JSON.stringify(mcp.view())).not.toContain('secret-token');
  await expect(mcp.add(input)).rejects.toThrow('同名');

  const id = mcp.view()[0]?.id ?? '';
  const result = await mcp.call(id, 'search_mail', { query: 'x' });
  expect(JSON.stringify(result)).toContain('token 已提供');
  await mcp.setEnabled(id, false);
  expect(mcp.view()[0]).toMatchObject({ status: 'disabled', tools: [] });
  await expect(mcp.call(id, 'search_mail', { query: 'x' })).rejects.toThrow();
  // A fresh start connects enabled servers from the saved list.
  await mcp.setEnabled(id, true);
  await expect.poll(() => mcp.view()[0]?.status).toBe('connected');
  await mcp.dispose();
  const again = new McpService(join(dir, 'mcp.json'), join(dir, 'oauth'), cipher, {
    openExternal: () => {},
    confirmCommand: async () => false,
  });
  await again.initialize();
  await expect.poll(() => again.view()[0]?.status).toBe('connected');
  await again.remove(id);
  expect(again.view()).toEqual([]);
  await again.dispose();
});

/** An MCP server over Streamable HTTP behind OAuth: discovery, registration, PKCE and tokens. */
async function oauthServer() {
  const codes = new Map<string, { challenge: string; redirect: string }>();
  const tokens = new Set<string>();
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const part of req) chunks.push(Buffer.from(part));
    const body = Buffer.concat(chunks).toString();
    const url = new URL(req.url ?? '/', base);
    const json = (status: number, value: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(value));
    };
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource'))
      return json(200, { resource: `${base}/mcp`, authorization_servers: [base] });
    if (
      url.pathname.startsWith('/.well-known/oauth-authorization-server') ||
      url.pathname.startsWith('/.well-known/openid-configuration')
    )
      return json(200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        registration_endpoint: `${base}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    if (url.pathname === '/register') {
      const request = JSON.parse(body);
      return json(201, {
        ...request,
        client_id: 'jarvis-client',
        token_endpoint_auth_method: 'none',
      });
    }
    if (url.pathname === '/authorize') {
      const code = randomUUID();
      const redirect = url.searchParams.get('redirect_uri') ?? '';
      codes.set(code, { challenge: url.searchParams.get('code_challenge') ?? '', redirect });
      const target = new URL(redirect);
      target.searchParams.set('code', code);
      target.searchParams.set('state', url.searchParams.get('state') ?? '');
      target.searchParams.set('iss', base);
      res.writeHead(302, { Location: target.href });
      return res.end();
    }
    if (url.pathname === '/token') {
      const form = new URLSearchParams(body);
      const entry = codes.get(form.get('code') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (!entry || entry.challenge !== challenge) return json(400, { error: 'invalid_grant' });
      codes.delete(form.get('code') ?? '');
      const token = `token-${randomUUID()}`;
      tokens.add(token);
      return json(200, {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh',
      });
    }
    if (url.pathname === '/mcp') {
      if (req.method === 'GET') {
        res.writeHead(405);
        return res.end();
      }
      if (req.method === 'DELETE') {
        res.writeHead(200);
        return res.end();
      }
      const bearer = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (!tokens.has(bearer))
        return json(
          401,
          { error: 'unauthorized' },
          {
            'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
          },
        );
      const message = JSON.parse(body);
      if (message.id === undefined) {
        res.writeHead(202);
        return res.end();
      }
      calls.push(message.method);
      const reply = (result: unknown) => json(200, { jsonrpc: '2.0', id: message.id, result });
      if (message.method === 'initialize')
        return reply({
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'docs', version: '1' },
        });
      if (message.method === 'tools/list')
        return reply({
          tools: [
            {
              name: 'read_doc',
              description: 'Read a Google Doc',
              inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
              annotations: { readOnlyHint: true },
            },
          ],
        });
      if (message.method === 'tools/call')
        return reply({ content: [{ type: 'text', text: '文档内容' }] });
      return json(200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'no' } });
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    calls,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

test('an HTTP MCP server asks for sign-in, signs in through the browser with OAuth and keeps tokens encrypted', async () => {
  const dir = test.info().outputPath('oauth');
  const remote = await oauthServer();
  const opened: string[] = [];
  // Stands in for the browser: follow the authorization redirect back to Jarvis' local callback.
  const browser = async (url: string) => {
    opened.push(url);
    const response = await fetch(url, { redirect: 'manual' });
    await fetch(response.headers.get('location') ?? '');
  };
  const mcp = new McpService(join(dir, 'mcp.json'), join(dir, 'oauth'), cipher, {
    openExternal: (url) => void browser(url),
    confirmCommand: async () => false,
  });
  try {
    await mcp.initialize();
    await mcp.add({ type: 'http', name: 'google-docs', url: `${remote.base}/mcp` });
    await expect.poll(() => mcp.view()[0]?.status).toBe('needs_auth');
    const id = mcp.view()[0]?.id ?? '';
    await mcp.signIn(id);
    expect(opened).toHaveLength(1);
    expect(new URL(opened[0] ?? '').pathname).toBe('/authorize');
    expect(mcp.view()[0]).toMatchObject({
      status: 'connected',
      tools: [{ name: 'read_doc', readOnly: true }],
    });
    expect(JSON.stringify(await mcp.call(id, 'read_doc', { id: 'a' }))).toContain('文档内容');
    const saved = await readFile(join(dir, 'oauth', `${id}.json`), 'utf8');
    expect(saved).not.toContain('token-');
    expect(saved).not.toContain('refresh');
    await mcp.dispose();

    // After a restart the stored grant connects without signing in again.
    const again = new McpService(join(dir, 'mcp.json'), join(dir, 'oauth'), cipher, {
      openExternal: () => {
        throw new Error('should not sign in again');
      },
      confirmCommand: async () => false,
    });
    await again.initialize();
    await expect.poll(() => again.view()[0]?.status).toBe('connected');
    await again.dispose();
  } finally {
    await mcp.dispose();
    await remote.close();
  }
});
