import { z } from 'zod';
import { chatActivitySchema, agentStatus } from './agent';
import { thinkingLevelSchema, type ModelSettingsView, type ThinkingLevel } from './models';
import type { SkillInfo } from './agent-skills';
import type { McpServerView } from './agent-mcp';
import type { ReplyMode } from './agent-settings';
import type { AuthorizedFolder } from './agent-files';

/**
 * Jarvis V1.0.0 Agent OS. A project is one OS: a thin Coordinator conversation plus threads that do
 * the work, sharing the project's instructions, memory and folders. See memory/agent-os-v1.md.
 */
export const osId = z.string().uuid();

/**
 * How far a message may direct an Agent. `principal` is the user in this conversation (or a
 * decision card they answered, or their words the kernel copied); `relay` is everything else:
 * the Coordinator, other threads, timers, external events and tool results. Relay never approves.
 */
export const trustSchema = z.enum(['principal', 'peer', 'relay']);
export type Trust = z.infer<typeof trustSchema>;

export const wakeReasonSchema = z.enum([
  'user_message',
  'spawn',
  'peer_message',
  'scheduled',
  'external_event',
  'decision',
  'task_done',
  'resume',
]);
export type WakeReason = z.infer<typeof wakeReasonSchema>;

/** A user message the kernel quoted from the conversation where the user wrote it. */
export const citedMessageSchema = z
  .object({ id: osId, text: z.string().max(32000), at: z.number() })
  .strict();
export type CitedMessage = z.infer<typeof citedMessageSchema>;

/** Where a non-user message in a conversation came from; shown above its bubble. */
export const messageSourceSchema = z
  .object({
    kind: z.enum([
      'coordinator',
      'thread',
      'scheduled',
      'external',
      'decision',
      'task_done',
      'resume',
    ]),
    title: z.string().max(200),
    threadId: osId.optional(),
  })
  .strict();

export const osMessageSchema = z.object({
  id: osId,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(2_000_000),
  status: agentStatus,
  error: z.string().optional(),
  completedAt: z.number().nonnegative().optional(),
  activities: z.array(chatActivitySchema).max(100).optional(),
  /** Set on every message the kernel added; the model never chooses it. */
  trust: trustSchema,
  source: messageSourceSchema.optional(),
  /** User messages a relayed message carries, quoted by the kernel. */
  cited: z.array(citedMessageSchema).max(10).optional(),
  /** Threads the Coordinator started or messaged in reply to this user message. */
  threadIds: z.array(osId).max(20).optional(),
  /** A message handed to a running reply: `queued` until delivered at the reply's next step. */
  steer: z.boolean().optional(),
});
export type OsMessage = z.infer<typeof osMessageSchema>;

export const threadStateSchema = z.enum([
  'working',
  'blocked',
  'review_ready',
  'done',
  'failed',
  'stopped',
  'idle',
]);
export type ThreadState = z.infer<typeof threadStateSchema>;

export const checklistItemSchema = z
  .object({
    text: z.string().trim().min(1).max(200),
    status: z.enum(['done', 'doing', 'todo']),
  })
  .strict();
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const artifactRefSchema = z
  .object({
    kind: z.enum(['file', 'document', 'event', 'project', 'link', 'node']),
    ref: z.string().max(2000),
    label: z.string().max(200).optional(),
  })
  .strict();
export type ArtifactRef = z.infer<typeof artifactRefSchema>;

/** Packs a thread can mount for writing; reading is always mounted. */
export const writablePackSchema = z.enum([
  'files',
  'calendar',
  'mcp',
  'writing-library',
  'navigation',
]);
export type WritablePack = z.infer<typeof writablePackSchema>;

export const effortSchema = z.enum(['quick', 'normal', 'deep']);
export const delegationBriefSchema = z
  .object({
    objective: z.string().trim().min(1).max(4000),
    outputFormat: z.string().trim().min(1).max(1000),
    toolsAndSources: z.array(z.string().max(300)).max(20),
    boundaries: z.string().max(2000),
    effortHint: effortSchema,
    /** Write packs the brief mounts from the start. */
    capabilities: z.array(writablePackSchema).max(10),
    /** Threads this one depends on or that depend on it; only these may message it directly. */
    dependsOn: z.array(osId).max(10),
    cited: z.array(citedMessageSchema).max(10),
  })
  .strict();
export type DelegationBrief = z.infer<typeof delegationBriefSchema>;

export const mountSchema = z
  .object({
    pack: writablePackSchema,
    reason: z.string().max(500),
    source: z.enum(['brief', 'request']),
    at: z.number(),
  })
  .strict();

export const resultCardSchema = z
  .object({
    status: z.enum(['done', 'review_ready', 'failed', 'needs_user']),
    summary: z.string().max(2000),
    outputs: z.array(artifactRefSchema).max(50),
    steps: z.array(checklistItemSchema).max(50),
    openQuestions: z.array(z.string().max(500)).max(10),
    updatedAt: z.number(),
  })
  .strict();
export type OsResultCard = z.infer<typeof resultCardSchema>;

export const threadSchema = z
  .object({
    id: osId,
    projectId: osId,
    title: z.string().max(100),
    state: threadStateSchema,
    brief: delegationBriefSchema,
    mounts: z.array(mountSchema).max(50),
    checklist: z.array(checklistItemSchema).max(50),
    card: resultCardSchema.optional(),
    resolved: z.boolean(),
    modelId: z.string().max(200).optional(),
    thinkingLevel: thinkingLevelSchema.optional(),
    contextTokens: z.number().nullable(),
    contextWindow: z.number().nullable(),
    usage: z.object({ tokens: z.number(), toolCalls: z.number(), budget: z.number() }).strict(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
export type OsThread = z.infer<typeof threadSchema>;

/**
 * `plan` blocks every change, `normal` runs reversible changes and asks about irreversible ones,
 * `auto` is the same today: irreversible steps always wait for the user.
 */
export const policyModeSchema = z.enum(['plan', 'normal', 'auto']);
export const policyRulesSchema = z
  .object({
    deny: z.array(z.string().max(200)).max(50),
    ask: z.array(z.string().max(200)).max(50),
    allow: z.array(z.string().max(200)).max(50),
  })
  .strict();
export type PolicyRules = z.infer<typeof policyRulesSchema>;

export const projectSchema = z
  .object({
    id: osId,
    title: z.string().trim().min(1).max(100),
    /** Standing rules the user wrote for this project, loaded every round. */
    instructions: z.string().max(16000),
    coordinatorId: osId,
    modelId: z.string().max(200).optional(),
    thinkingLevel: thinkingLevelSchema.optional(),
    contextTokens: z.number().nullable(),
    contextWindow: z.number().nullable(),
    mode: policyModeSchema,
    rules: policyRulesSchema,
    /** Default per-thread budget in tokens; a thread past it asks before going on. */
    threadBudget: z.number().int().min(10_000).max(50_000_000),
    lastTidyAt: z.number().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
export type AgentProject = z.infer<typeof projectSchema>;
export const projectPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    instructions: z.string().max(16000).optional(),
    mode: policyModeSchema.optional(),
    rules: policyRulesSchema.optional(),
    threadBudget: z.number().int().min(10_000).max(50_000_000).optional(),
  })
  .strict();
export type ProjectPatch = z.infer<typeof projectPatchSchema>;

export const decisionSchema = z
  .object({
    id: osId,
    projectId: osId,
    threadId: osId,
    question: z.string().max(1000),
    options: z
      .array(z.object({ label: z.string().max(100), consequence: z.string().max(500) }).strict())
      .min(2)
      .max(4),
    recommended: z.number().int().min(0).max(3),
    reason: z.string().max(500).optional(),
    /** The thread waits on this step; other parts go on. */
    irreversible: z.boolean(),
    /** For an approval card: the exact tool call the answer approves. */
    tool: z
      .object({
        name: z.string().max(200),
        inputHash: z.string().regex(/^[a-f0-9]{64}$/),
        detail: z.string().max(4000),
      })
      .strict()
      .optional(),
    /** For a budget card. */
    budget: z.boolean().optional(),
    status: z.enum(['open', 'answered', 'withdrawn']),
    answer: z
      .object({ option: z.number().int(), at: z.number(), text: z.string().max(500).optional() })
      .strict()
      .optional(),
    /** An approved tool call is used once; set when the thread runs it. */
    consumedAt: z.number().optional(),
    remindAt: z.number().optional(),
    remindedAt: z.number().optional(),
    createdAt: z.number(),
  })
  .strict();
export type Decision = z.infer<typeof decisionSchema>;

export const wakeSpecSchema = z
  .object({
    id: osId,
    projectId: osId,
    targetSessionId: osId,
    note: z.string().max(2000),
    kind: z.enum(['once', 'routine', 'subscription']),
    fireAt: z.number().optional(),
    cron: z.string().max(100).optional(),
    subscription: z
      .discriminatedUnion('source', [
        z
          .object({ source: z.literal('calendar'), leadMinutes: z.number().int().min(1).max(1440) })
          .strict(),
        z
          .object({
            source: z.literal('file'),
            folderId: z.string().max(64),
            path: z.string().max(4096),
          })
          .strict(),
      ])
      .optional(),
    createdAt: z.number(),
    expiresAt: z.number().optional(),
  })
  .strict();
export type WakeSpec = z.infer<typeof wakeSpecSchema>;

export const memoryTypeSchema = z.enum(['preference', 'decision', 'pitfall', 'reference', 'fact']);
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export interface MemoryTopic {
  name: string;
  description: string;
  type: MemoryType;
  /** Content hash; a write must name the version it read. */
  version: string;
  updatedAt: number;
  size: number;
}

export type OsRunState = 'waiting' | 'running';
export interface ProjectView extends AgentProject {
  folders: AuthorizedFolder[];
}
export interface ThreadView extends OsThread {
  /** Open decision cards of this thread. */
  decisions: Decision[];
  /** Pending wakes this thread scheduled. */
  wakes: Pick<WakeSpec, 'id' | 'kind' | 'fireAt' | 'cron' | 'note'>[];
}
export interface OsSnapshot {
  projects: ProjectView[];
  currentProjectId: string | null;
  threads: ThreadView[];
  /** Sessions (Coordinators and threads) with a round in progress. */
  runs: Record<string, OsRunState>;
  models?: ModelSettingsView;
  skills?: SkillInfo[];
  mcp?: McpServerView[];
  replyMode?: ReplyMode;
}
export interface OsEvent {
  seq: number;
  snapshot: OsSnapshot;
}
export interface OsSessionEvent {
  seq: number;
  sessionId: string;
  messages: OsMessage[];
  order?: string[];
}
export interface OsSessionView {
  id: string;
  projectId: string;
  kind: 'coordinator' | 'thread';
  title: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
  contextTokens: number | null;
  contextWindow: number | null;
  runId: string | null;
  messages: OsMessage[];
}
export const osSendSchema = z
  .object({ sessionId: osId, requestId: osId, text: z.string().trim().min(1).max(32000) })
  .strict();
export const decisionAnswerSchema = z
  .object({ decisionId: osId, option: z.number().int().min(0).max(3) })
  .strict();

export type OsResult<T> = { ok: true; value: T } | { ok: false; error: string };
/** The renderer's Agent OS interface; settings-only calls stay on `desktop.agent`. */
export interface OsBridge {
  getSnapshot(): Promise<OsResult<OsEvent>>;
  onEvent(listener: (event: OsEvent) => void): () => void;
  getSession(sessionId: string): Promise<OsResult<{ seq: number; session: OsSessionView }>>;
  onSessionEvent(listener: (event: OsSessionEvent) => void): () => void;
  /** Sessions this window shows; their rounds go first when slots are short. */
  setViewing(sessionIds: string[]): Promise<OsResult<void>>;
  send(input: z.infer<typeof osSendSchema>): Promise<OsResult<string>>;
  steer(input: { sessionId: string; messageId: string }): Promise<OsResult<void>>;
  cancel(sessionId: string): Promise<OsResult<void>>;
  setModel(input: { sessionId: string; model: string }): Promise<OsResult<void>>;
  setThinkingLevel(input: { sessionId: string; level: ThinkingLevel }): Promise<OsResult<void>>;
  copyReply(input: { sessionId: string; messageId: string }): Promise<OsResult<void>>;
  undo(transactionId: string): Promise<OsResult<void>>;
  stopThread(threadId: string): Promise<OsResult<void>>;
  resolveThread(input: { threadId: string; resolved: boolean }): Promise<OsResult<void>>;
  renameThread(input: { threadId: string; title: string }): Promise<OsResult<void>>;
  answerDecision(input: z.infer<typeof decisionAnswerSchema>): Promise<OsResult<void>>;
  createProject(title: string): Promise<OsResult<string>>;
  updateProject(input: { id: string; patch: ProjectPatch }): Promise<OsResult<void>>;
  removeProject(id: string): Promise<OsResult<void>>;
  setCurrentProject(id: string): Promise<OsResult<void>>;
  /** Lets the user pick a folder the project may access; null when they cancel. */
  addFolder(projectId: string): Promise<OsResult<AuthorizedFolder[] | null>>;
  removeFolder(input: {
    projectId: string;
    folderId: string;
  }): Promise<OsResult<AuthorizedFolder[]>>;
  listMemory(projectId: string): Promise<OsResult<MemoryTopic[]>>;
  readMemory(input: {
    projectId: string;
    name: string;
  }): Promise<OsResult<({ body: string } & MemoryTopic) | null>>;
  /** A thread or the user asks this window to open a canvas project or document. */
  onNavigate(
    listener: (
      target:
        | { kind: 'canvas'; projectId: string }
        | { kind: 'writing'; rootId: string; path: string },
    ) => void,
  ): () => void;
}
export function osValue<T>(result: OsResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
