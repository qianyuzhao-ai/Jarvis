import { resonanceSchema } from './writing-graph';
import { writingScopeSchema, type WritingCommand, type WritingReply } from './writing-agent';
import { z } from 'zod';
import type { SkillInfo } from './agent-skills';
import { resultCardSchema } from './agent-cards';
import type { AgentSettings, ReplyMode } from './agent-settings';
import type { AuthorizedFolder } from './agent-files';
import type { McpServerInput, McpServerView } from './agent-mcp';
import type { CalendarEvent, CalendarStatus } from './agent-calendar';
import type { OpenTargets } from './agent-targets';
import { visionAssetInfoSchema, visionAssetSchema } from './canvas-vision';
import { baseUrlSchema, thinkingLevelSchema, type ModelSettingsView } from './models';
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
/**
 * A message written by another Agent rather than typed here: a sub-agent's handoff or status
 * notice in a main-Agent segment, or the main Agent's task or message in a sub-agent.
 */
export const relaySourceSchema = z
  .object({
    kind: z.enum(['handoff', 'notice', 'delegate', 'message', 'task']),
    sessionId: agentId,
    title: z.string().max(100),
  })
  .strict();
/** A project or document the main Agent asks the window to show. */
export const navigationTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('canvas'), projectId: z.string().uuid() }).strict(),
  z
    .object({
      kind: z.literal('writing'),
      rootId: z.string().min(1).max(64),
      path: z.string().min(1).max(4096),
    })
    .strict(),
]);
export type NavigationTarget = z.infer<typeof navigationTargetSchema>;
/** `queued`: a user message sent while its conversation was replying, not yet started. */
export const agentStatus = z.enum([
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
  'queued',
]);
export const chatActivitySchema = z.object({
  resonance: resonanceSchema.optional(),
  id: z.string().min(1).max(200),
  label: z.string().max(500),
  nodeIds: z.array(z.string().max(100)).max(200).optional(),
  transactionId: z.string().uuid().optional(),
  changes: z.array(canvasChangeSchema).max(200).optional(),
  projectId: z.string().uuid().optional(),
  writingScope: writingScopeSchema.optional(),
  /** Set once the change this activity records was undone. */
  undone: z.boolean().optional(),
  files: z
    .array(
      z.object({
        path: z.string().max(2000),
        action: z.enum(['created', 'edited', 'deleted', 'moved']),
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
  relay: relaySourceSchema.optional(),
  /** A message handed to a running reply: `queued` until delivered at the reply's next step. */
  steer: z.boolean().optional(),
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
/**
 * v2 conversation metadata, without messages; `lastReplyAt` is when the last message finished and
 * `card` is a space sub-agent's latest result card.
 */
export const sessionMetaSchema = chatSessionSchema.omit({ messages: true }).extend({
  agent: agentRoleSchema,
  lastReplyAt: z.number().optional(),
  card: resultCardSchema.optional(),
});
export type RelayConfig = z.infer<typeof relaySchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type StoredRelay = z.infer<typeof relaySourceSchema>;
export type AgentRole = z.infer<typeof agentRoleSchema>;
export type ChatSessionMeta = z.infer<typeof sessionMetaSchema>;
export type ChatSession = ChatSessionMeta & { messages: ChatMessage[] };
/** `waiting`: the round waits for a free slot under the concurrency limit. */
export type RunState = 'waiting' | 'running';
export interface AgentSnapshot {
  skills?: SkillInfo[];
  /** Model settings shared by every Agent entry (home, canvas, writing); Keys are never included. */
  models?: ModelSettingsView;
  /** Metadata only; a conversation's messages come from `getSession` and session events. */
  sessions: ChatSessionMeta[];
  /** The user's MCP servers and their status; credential values are never included. */
  mcp?: McpServerView[];
  /** What sending during a reply does; see the General settings. */
  replyMode?: ReplyMode;
  /** Conversations with a round in progress; several may reply at once. */
  runs: Record<string, RunState>;
  /**
   * The main-Agent segment that most recently received a user message; handoffs from space
   * sub-agents go here. Null until some home conversation has a message.
   */
  currentSegmentId?: string | null;
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
  /** Every message ID in order, sent when messages moved (a steering message was delivered). */
  order?: string[];
}
export type AgentResult<T> = { ok: true; value: T } | { ok: false; error: string };
/**
 * Settings shared by every project, plus the window-side hosts the canvas and writing Agents will
 * use again in batch 2. Conversations go through `desktop.os` (see agent-os.ts).
 */
export interface AgentBridge {
  listSkills(): Promise<AgentResult<SkillInfo[]>>;
  importSkill(): Promise<AgentResult<SkillInfo[] | null>>;
  setSkillEnabled(input: { id: string; enabled: boolean }): Promise<AgentResult<SkillInfo[]>>;
  getSettings(): Promise<AgentResult<AgentSettings>>;
  /** 1–6 model requests streaming at once across all conversations. */
  setConcurrency(value: number): Promise<AgentResult<AgentSettings>>;
  setReplyMode(value: ReplyMode): Promise<AgentResult<AgentSettings>>;
  /** Folders the current project may read and change files in. */
  listFolders(): Promise<AgentResult<AuthorizedFolder[]>>;
  /** Lets the user pick a folder to authorize; null when they cancel. */
  addFolder(): Promise<AgentResult<AuthorizedFolder[] | null>>;
  removeFolder(id: string): Promise<AgentResult<AuthorizedFolder[]>>;
  calendarStatus(): Promise<AgentResult<CalendarStatus>>;
  /** Shows the system's calendar permission prompt when it has not been answered yet. */
  requestCalendarAccess(): Promise<AgentResult<CalendarStatus>>;
  calendarEvents(range: { from: string; to: string }): Promise<AgentResult<CalendarEvent[]>>;
  addMcpServer(input: McpServerInput): Promise<AgentResult<McpServerView[]>>;
  removeMcpServer(id: string): Promise<AgentResult<McpServerView[]>>;
  setMcpServerEnabled(input: {
    id: string;
    enabled: boolean;
  }): Promise<AgentResult<McpServerView[]>>;
  reconnectMcpServer(id: string): Promise<AgentResult<McpServerView[]>>;
  /** Opens the server's sign-in page in the browser and connects once signed in. */
  signInMcpServer(id: string): Promise<AgentResult<McpServerView[]>>;
  claimWritingCommand(requestId: string): Promise<AgentResult<boolean>>;
  completeWritingCommand(reply: WritingReply): Promise<AgentResult<void>>;
  onWritingCommand(listener: (command: WritingCommand) => void): () => void;
  /** Projects and documents this window can serve tool commands for. */
  setOpenTargets(targets: OpenTargets): Promise<AgentResult<void>>;
  claimCanvasCommand(requestId: string): Promise<AgentResult<boolean>>;
  completeCanvasCommand(reply: CanvasReply): Promise<AgentResult<void>>;
  onCanvasCommand(listener: (command: CanvasCommand) => void): () => void;
  /** Legacy conversation snapshots; not sent until the canvas and writing Agents return. */
  onEvent(listener: (event: AgentEvent) => void): () => void;
}
export function agentValue<T>(result: AgentResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
