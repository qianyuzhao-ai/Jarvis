import { z } from 'zod';
import { visionAssetInfoSchema, visionAssetSchema } from './canvas-vision';
import {
  canvasChangeSchema,
  canvasSnapshotSchema,
  type CanvasCommand,
  type CanvasReply,
} from './canvas-agent';

export const relaySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    baseUrl: z
      .string()
      .trim()
      .url()
      .max(2000)
      .refine((value) => {
        const url = new URL(value);
        return (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      }, '地址不能包含账号、密码、查询参数或锚点')
      .transform((value) => value.replace(/\/+$/, '')),
    api: z.enum(['openai-completions', 'openai-responses']),
    model: z.string().trim().min(1).max(200),
    contextWindow: z.number().int().min(8192).max(2_000_000).nullable().default(null),
    maxTokens: z.number().int().min(256).max(32768).default(4096),
  })
  .refine((c) => c.maxTokens < (c.contextWindow ?? 32768), '输出上限必须小于上下文容量');
export const relayInputSchema = z
  .object({
    config: relaySchema,
    apiKey: z
      .string()
      .trim()
      .max(4000)
      .refine((key) => !/[\r\n]/.test(key))
      .default(''),
    clearKey: z.boolean().default(false),
  })
  .refine((r) => !(r.apiKey && r.clearKey), '不能同时填写和清除 Key');
export const agentId = z.string().uuid();
export const relayModelsInputSchema = z
  .object({
    config: relaySchema.safeExtend({ model: z.string().trim().max(200) }),
    apiKey: z
      .string()
      .trim()
      .max(4000)
      .refine((key) => !/[\r\n]/.test(key))
      .default(''),
    clearKey: z.boolean().default(false),
  })
  .refine((r) => !(r.apiKey && r.clearKey), '不能同时填写和清除 Key');
export const agentSendSchema = z.object({
  sessionId: agentId,
  requestId: agentId,
  text: z.string().trim().min(1).max(32000),
  canvas: canvasSnapshotSchema.optional(),
  images: z.array(visionAssetSchema).max(12).optional(),
});
export const agentStatus = z.enum(['running', 'succeeded', 'failed', 'cancelled', 'interrupted']);
export const chatActivitySchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().max(500),
  nodeIds: z.array(z.string().max(100)).max(200).optional(),
  transactionId: z.string().uuid().optional(),
  changes: z.array(canvasChangeSchema).max(200).optional(),
  projectId: z.string().uuid().optional(),
  files: z
    .array(
      z.object({
        path: z.string().max(2000),
        action: z.enum(['created', 'edited', 'deleted']),
        added: z.number().int().nonnegative(),
        removed: z.number().int().nonnegative(),
        diff: z.string().max(200000),
      }),
    )
    .max(100)
    .default([]),
});
export const chatMessageSchema = z.object({
  id: agentId,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(2_000_000),
  status: agentStatus,
  error: z.string().optional(),
  completedAt: z.number().nonnegative().optional(),
  activities: z.array(chatActivitySchema).max(100).optional(),
  visionAssets: z.array(visionAssetInfoSchema).max(12).optional(),
  canvasReferences: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .max(100)
    .optional(),
});
export const chatSessionSchema = z.object({
  id: agentId,
  title: z.string().max(100),
  model: z.string().max(200),
  createdAt: z.number(),
  updatedAt: z.number(),
  messages: z.array(chatMessageSchema),
  runId: agentId.nullable(),
  contextTokens: z.number().nullable(),
  contextWindow: z.number().nullable(),
  projectId: z.string().uuid().optional(),
});
export type RelayConfig = z.infer<typeof relaySchema>;
export type RelayInput = z.infer<typeof relayInputSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;
export interface RelayView {
  config: RelayConfig | null;
  hasKey: boolean;
}
export interface AgentSnapshot {
  sessions: ChatSession[];
  busySessionId: string | null;
}
export interface AgentEvent {
  seq: number;
  snapshot: AgentSnapshot;
}
export type AgentResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface AgentBridge {
  getConfiguration(): Promise<AgentResult<RelayView>>;
  saveConfiguration(input: RelayInput): Promise<AgentResult<RelayView>>;
  testConnection(input: RelayInput): Promise<AgentResult<string>>;
  listModels(input: RelayInput): Promise<AgentResult<string[]>>;
  getSnapshot(): Promise<AgentResult<AgentEvent>>;
  createSession(): Promise<AgentResult<string>>;
  createCanvasSession(projectId: string): Promise<AgentResult<string>>;
  claimCanvasCommand(requestId: string): Promise<AgentResult<boolean>>;
  completeCanvasCommand(reply: CanvasReply): Promise<AgentResult<void>>;
  onCanvasCommand(listener: (command: CanvasCommand) => void): () => void;
  renameSession(input: { sessionId: string; title: string }): Promise<AgentResult<void>>;
  deleteSession(sessionId: string): Promise<AgentResult<void>>;
  setModel(input: { sessionId: string; model: string }): Promise<AgentResult<void>>;
  send(input: z.infer<typeof agentSendSchema>): Promise<AgentResult<string>>;
  cancel(runId: string): Promise<AgentResult<void>>;
  copyReply(input: { sessionId: string; messageId: string }): Promise<AgentResult<void>>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
}
export function agentValue<T>(result: AgentResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
