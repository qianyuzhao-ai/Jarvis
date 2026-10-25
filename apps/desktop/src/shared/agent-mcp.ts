import { z } from 'zod';
import { httpUrl } from './generation';

export const mcpNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,30}$/, '名称只能用小写字母、数字和连字符，最长 31 个字符');
const secretValue = z.string().max(4000);
/** A server to add. Header and environment values are credentials and are stored encrypted. */
export const mcpServerInputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('stdio'),
      name: mcpNameSchema,
      command: z.string().trim().min(1).max(500),
      args: z.array(z.string().max(2000)).max(50).default([]),
      env: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), secretValue).default({}),
    })
    .strict(),
  z
    .object({
      type: z.literal('http'),
      name: mcpNameSchema,
      url: httpUrl,
      headers: z.record(z.string().regex(/^[A-Za-z0-9-]{1,100}$/), secretValue).default({}),
    })
    .strict(),
]);
export type McpServerInput = z.input<typeof mcpServerInputSchema>;
export type McpStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'needs_auth'
  | 'signing_in'
  | 'error';
/** What the settings page shows of a server; credential values never leave the main process. */
export type McpServerView = {
  id: string;
  name: string;
  type: 'stdio' | 'http';
  /** The command line or URL. */
  target: string;
  /** Names of the environment variables or headers holding credentials. */
  secretKeys: string[];
  enabled: boolean;
  status: McpStatus;
  error?: string;
  tools: { name: string; title?: string; readOnly: boolean }[];
};
