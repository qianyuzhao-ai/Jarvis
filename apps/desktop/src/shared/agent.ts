import {
  writingScopeSchema,
  type WritingScope,
  type WritingCommand,
  type WritingReply,
} from './writing-agent';
import { z } from 'zod';
import type { SkillInfo } from './agent-skills';
import type { ApprovalRequest, ApprovalResponse } from './agent-approval';
import type { UndoRequest } from './agent-ledger';
import { visionAssetInfoSchema, visionAssetSchema } from './canvas-vision';
import {
  baseUrlSchema,
  thinkingLevelSchema,
  type ModelSettingsView,
  type ThinkingLevel,
} from './models';
import {
  canvasChangeSchema,
  canvasSnapshotSchema,
  type CanvasCommand,
  type CanvasReply,
} from './canvas-agent';

/** v2 settings schema, kept to read older files and session records during migration. */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_MODELS = ['deepseek-flash', 'deepseek-v4-pro'] as const;

export const relaySchema = z
  .object({
    provider: z.enum(['relay', 'deepseek']).optional(),
    name: z.string().trim().min(1).max(100),
    baseUrl: baseUrlSchema,
    api: z.enum(['openai-completions', 'openai-responses']),
    model: z.string().trim().min(1).max(200),
    contextWindow: z.number().int().min(8192).max(2_000_000).nullable().default(null),
    maxTokens: z.number().int().min(256).max(32768).default(4096),
  })
  .refine((c) => c.maxTokens < (c.contextWindow ?? 32768), '输出上限必须小于上下文容量')
  .refine(
    (c) =>
      c.provider !== 'deepseek' ||
      (c.baseUrl === DEEPSEEK_BASE_URL && c.api === 'openai-completions'),
    'DeepSeek 官方接入必须使用官方地址和 Chat Completions 协议',
  )
  .refine(
    (c) =>
      c.provider !== 'deepseek' || !c.model || DEEPSEEK_MODELS.some((model) => model === c.model),
    '请选择当前版本支持的 DeepSeek 官方模型',
  );
export const agentId = z.string().uuid();
export const agentSendSchema = z.object({
  sessionId: agentId,
  requestId: agentId,
  text: z.string().trim().min(1).max(32000),
  canvas: canvasSnapshotSchema.optional(),
  writing: writingScopeSchema.optional(),
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
  writingScope: writingScopeSchema.optional(),
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
/** v1 record: metadata and messages in one object, as stored in `index.json` version 1. */
export const chatSessionSchema = z.object({
  id: agentId,
  title: z.string().max(100),
  model: z.string().max(200),
  modelId: agentId.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  messages: z.array(chatMessageSchema),
  runId: agentId.nullable(),
  contextTokens: z.number().nullable(),
  contextWindow: z.number().nullable(),
  projectId: z.string().uuid().optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  writingScope: writingScopeSchema.optional(),
});
/**
 * Who a conversation belongs to: home conversations are segments of the main Agent, canvas and
 * writing conversations are space sub-agents. `delegated` ones were started by the main Agent.
 */
export const agentRoleSchema = z
  .object({
    kind: z.enum(['main', 'canvas', 'writing']),
    origin: z.enum(['user', 'delegated']),
    parentId: agentId.optional(),
  })
  .strict();
/** v2 conversation metadata, without messages; `lastReplyAt` is when the last message finished. */
export const sessionMetaSchema = chatSessionSchema
  .omit({ messages: true })
  .extend({ agent: agentRoleSchema, lastReplyAt: z.number().optional() });
export type RelayConfig = z.infer<typeof relaySchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type AgentRole = z.infer<typeof agentRoleSchema>;
export type ChatSessionMeta = z.infer<typeof sessionMetaSchema>;
export type ChatSession = ChatSessionMeta & { messages: ChatMessage[] };
export interface AgentSnapshot {
  skills?: SkillInfo[];
  /** Model settings shared by every Agent entry (home, canvas, writing); Keys are never included. */
  models?: ModelSettingsView;
  /** Metadata only; a conversation's messages come from `getSession` and session events. */
  sessions: ChatSessionMeta[];
  busySessionId: string | null;
}
export interface AgentEvent {
  seq: number;
  snapshot: AgentSnapshot;
}
/** Messages of one conversation that were added or changed; shares `seq` with `AgentEvent`. */
export interface SessionEvent {
  seq: number;
  sessionId: string;
  messages: ChatMessage[];
}
export type AgentResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface AgentBridge {
  listSkills(): Promise<AgentResult<SkillInfo[]>>;
  importSkill(): Promise<AgentResult<SkillInfo[] | null>>;
  setSkillEnabled(input: { id: string; enabled: boolean }): Promise<AgentResult<SkillInfo[]>>;
  getSnapshot(): Promise<AgentResult<AgentEvent>>;
  /** One conversation with its messages, as of `seq`. */
  getSession(sessionId: string): Promise<AgentResult<{ seq: number; session: ChatSession }>>;
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;
  createSession(): Promise<AgentResult<string>>;
  createCanvasSession(projectId: string): Promise<AgentResult<string>>;
  createWritingSession(scope: WritingScope): Promise<AgentResult<string>>;
  claimWritingCommand(requestId: string): Promise<AgentResult<boolean>>;
  completeWritingCommand(reply: WritingReply): Promise<AgentResult<void>>;
  onWritingCommand(listener: (command: WritingCommand) => void): () => void;
  /** Undoes one recorded Agent change; the window that owns its data applies it. */
  undo(input: UndoRequest): Promise<AgentResult<void>>;
  /** Tool calls in this window's rounds that wait for the user's decision. */
  listApprovals(): Promise<AgentResult<ApprovalRequest[]>>;
  respondApproval(input: ApprovalResponse): Promise<AgentResult<void>>;
  onApprovals(listener: (requests: ApprovalRequest[]) => void): () => void;
  claimCanvasCommand(requestId: string): Promise<AgentResult<boolean>>;
  completeCanvasCommand(reply: CanvasReply): Promise<AgentResult<void>>;
  onCanvasCommand(listener: (command: CanvasCommand) => void): () => void;
  renameSession(input: { sessionId: string; title: string }): Promise<AgentResult<void>>;
  deleteSession(sessionId: string): Promise<AgentResult<void>>;
  setModel(input: { sessionId: string; model: string }): Promise<AgentResult<void>>;
  setThinkingLevel(input: { sessionId: string; level: ThinkingLevel }): Promise<AgentResult<void>>;
  send(input: z.infer<typeof agentSendSchema>): Promise<AgentResult<string>>;
  cancel(runId: string): Promise<AgentResult<void>>;
  copyReply(input: { sessionId: string; messageId: string }): Promise<AgentResult<void>>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
}
export function agentValue<T>(result: AgentResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
