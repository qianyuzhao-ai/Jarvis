import { z } from 'zod';
import {
  artifactRefSchema,
  checklistItemSchema,
  osId,
  writablePackSchema,
  type ChecklistItem,
  type WritablePack,
} from '../../../shared/agent-os';
import { resonanceSchema } from '../../../shared/writing-graph';
import type { CapabilityPack } from '../kernel/capability';
import { defineTool } from '../kernel/tool';
import { parseCron } from '../kernel/wakes';

export const reportInput = z
  .object({
    status: z.enum(['done', 'review_ready', 'failed', 'needs_user']),
    summary: z.string().trim().min(1).max(2000),
    outputs: z.array(artifactRefSchema).max(50).default([]),
    openQuestions: z.array(z.string().max(500)).max(10).default([]),
    resolved: z.boolean().default(false),
    /** For a thread bound to a document: related documents of its folder, for the user to link. */
    resonance: resonanceSchema.optional(),
  })
  .strict();
export const askInput = z
  .object({
    question: z.string().trim().min(1).max(1000),
    options: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            consequence: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    recommended: z.number().int().min(0).max(3),
    reason: z.string().max(500).optional(),
    irreversible: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.recommended < v.options.length, '推荐项必须是其中一个选项');
const subscription = z.discriminatedUnion('source', [
  z
    .object({ source: z.literal('calendar'), leadMinutes: z.number().int().min(1).max(1440) })
    .strict(),
  z
    .object({
      source: z.literal('file'),
      folderId: z.string().max(64),
      path: z.string().max(4096).default(''),
    })
    .strict(),
]);

/** What a thread's own tools ask of the OS for one round. */
export interface ThreadControl {
  checklist(items: ChecklistItem[]): void;
  report(input: z.infer<typeof reportInput>): Promise<void>;
  ask(input: z.infer<typeof askInput>): Promise<unknown>;
  withdraw(decisionId: string, adopted?: string): Promise<void>;
  mount(pack: WritablePack, reason: string): unknown;
  sendLater(fireAt: number, note: string): Promise<unknown>;
  routine(cron: string, note: string): Promise<unknown>;
  subscribe(input: z.infer<typeof subscription>, note: string): Promise<unknown>;
  cancelWake(id: string): Promise<unknown>;
  wakes(): unknown;
  askCoordinator(request: string, context?: string): Promise<unknown>;
  messagePeer(threadId: string, text: string): Promise<unknown>;
}

/** A thread's own tools: progress, results, decisions, mounts, wakes and colleagues. */
export function threadPack(control: ThreadControl): CapabilityPack {
  let reports = 0;
  return {
    id: 'thread',
    prompt:
      '\n线程工具：update_checklist、report_result、ask_user、withdraw_decision、request_capability、send_later、create_routine、subscribe、cancel_wake、list_wakes、ask_coordinator、message_thread。',
    tools: [
      defineTool(
        'update_checklist',
        '覆盖更新本线程的进度清单（每项 done 完成 / doing 进行中 / todo 未开始），不发通知',
        'read',
        z.object({ items: z.array(checklistItemSchema).min(1).max(30) }).strict(),
        ({ items }) => {
          control.checklist(items);
          return { success: true };
        },
      ),
      defineTool(
        'report_result',
        '写本线程的结果卡：status、一两句以结论开头的摘要、产物引用、待用户回答的问题；没有人还欠下一步时 resolved 填 true。绑定文档的线程可在 resonance 里给出同文件夹最多三个相关文档（path 与一句理由），只作候选，由用户确认后才建立关联',
        'read',
        reportInput,
        async (input) => {
          if (++reports > 3) throw new Error('本轮结果卡已写过多次');
          await control.report(input);
          return { success: true };
        },
      ),
      defineTool(
        'ask_user',
        '发一张决策卡：一个问题、2–4 个选项（每项一句后果）、推荐项及理由。等待时先按推荐项推进可逆的部分；irreversible 为 true 时本线程在这一步停下等待',
        'read',
        askInput,
        (input) => control.ask(input),
      ),
      defineTool(
        'withdraw_decision',
        '撤回本线程的一张决策卡（例如用户已在对话里用文字回答），adopted 写明采用了哪项',
        'read',
        z.object({ decisionId: osId, adopted: z.string().max(200).optional() }).strict(),
        async ({ decisionId, adopted }) => {
          await control.withdraw(decisionId, adopted);
          return { success: true };
        },
      ),
      defineTool(
        'request_capability',
        '申请挂载一个写能力（files 文件、calendar 日程、mcp 外部服务、writing-library 写作文档、navigation 新建画布项目），写明理由；挂载会被记录，具体操作仍按风险判级',
        'read',
        z.object({ pack: writablePackSchema, reason: z.string().trim().min(1).max(500) }).strict(),
        ({ pack, reason }) => control.mount(pack, reason),
      ),
      defineTool(
        'send_later',
        '在指定时间唤醒本线程一次（at 为 ISO 时间，或 delayMinutes 分钟后），note 写清到时要做什么',
        'read',
        z
          .object({
            at: z.string().datetime({ offset: true }).optional(),
            delayMinutes: z
              .number()
              .int()
              .min(1)
              .max(60 * 24 * 90)
              .optional(),
            note: z.string().trim().min(1).max(2000),
          })
          .strict()
          .refine((v) => !!v.at !== (v.delayMinutes !== undefined), 'at 与 delayMinutes 二选一'),
        ({ at, delayMinutes, note }) => {
          const fireAt = at ? Date.parse(at) : Date.now() + (delayMinutes as number) * 60_000;
          if (!(fireAt > Date.now())) throw new Error('唤醒时间必须在将来');
          return control.sendLater(fireAt, note);
        },
      ),
      defineTool(
        'create_routine',
        '创建周期唤醒（5 字段 cron：分 时 日 月 周，本地时间），只用于真正周期性的事',
        'read',
        z
          .object({
            cron: z.string().trim().min(9).max(100),
            note: z.string().trim().min(1).max(2000),
          })
          .strict(),
        ({ cron, note }) => {
          parseCron(cron);
          return control.routine(cron, note);
        },
      ),
      defineTool(
        'subscribe',
        '订阅外部变化来唤醒本线程：日程临近（calendar，leadMinutes 提前分钟数）或项目目录中的文件变化（file，folderId 与 path）；30 天后自动失效',
        'read',
        z.object({ subscription, note: z.string().trim().min(1).max(2000) }).strict(),
        ({ subscription: input, note }) => control.subscribe(input, note),
      ),
      defineTool(
        'cancel_wake',
        '取消本线程的一个定时、周期或订阅',
        'read',
        z.object({ wakeId: osId }).strict(),
        ({ wakeId }) => control.cancelWake(wakeId),
      ),
      defineTool('list_wakes', '列出本线程的定时、周期与订阅', 'read', z.object({}).strict(), () =>
        control.wakes(),
      ),
      defineTool(
        'ask_coordinator',
        '请 Coordinator 另开线程处理超出本任务的事：request 写清要做什么，context 写必要事实',
        'read',
        z
          .object({
            request: z.string().trim().min(1).max(4000),
            context: z.string().max(4000).optional(),
          })
          .strict(),
        ({ request, context }) => control.askCoordinator(request, context),
      ),
      defineTool(
        'message_thread',
        '给任务书 dependsOn 中的线程（或依赖本线程的线程）发消息，例如告诉它产物已就绪及路径',
        'read',
        z.object({ threadId: osId, text: z.string().trim().min(1).max(8000) }).strict(),
        ({ threadId, text }) => control.messagePeer(threadId, text),
      ),
    ],
  };
}
