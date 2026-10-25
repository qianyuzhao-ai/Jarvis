import { z } from 'zod';

/** A tool call waiting for the user's decision; only the window that started the round sees it. */
export const approvalRequestSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  toolName: z.string().max(200),
  title: z.string().max(500),
  detail: z.string().max(2000),
  expiresAt: z.number(),
});
export const approvalResponseSchema = z
  .object({ id: z.string().uuid(), approved: z.boolean() })
  .strict();
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type ApprovalResponse = z.infer<typeof approvalResponseSchema>;
export type ApprovalOutcome = 'approved' | 'denied' | 'expired';
