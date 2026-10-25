import { z } from 'zod';

/**
 * What a space sub-agent has done, as the main Agent and the home page see it. The conversation
 * it belongs to supplies its identity, space and title; `source` says whether the sub-agent wrote
 * it with `report_result` or it was generated when the round ended.
 */
export const resultCardSchema = z.object({
  status: z.enum(['running', 'waiting', 'done', 'failed', 'needs_user']),
  summary: z.string().max(1000),
  artifacts: z
    .array(
      z.object({ kind: z.enum(['node', 'document', 'file', 'event']), ref: z.string().max(2000) }),
    )
    .max(50),
  openQuestions: z.array(z.string().max(500)).max(10).optional(),
  source: z.enum(['agent', 'auto']),
  updatedAt: z.number(),
});
export type ResultCard = z.infer<typeof resultCardSchema>;
/** Card states that still need attention; a new main-Agent segment starts with these. */
export const UNFINISHED_CARD_STATES: ResultCard['status'][] = ['running', 'waiting', 'needs_user'];
