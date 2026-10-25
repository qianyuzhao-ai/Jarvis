import { z } from 'zod';
import { writingScopeSchema } from './writing-agent';

/**
 * One round's reversible change to one target. `id` is the transaction ID the data owner (canvas
 * or writing host) returned; repeated edits in the same round share it.
 */
export const ledgerEntrySchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    runId: z.string().uuid(),
    pack: z.enum(['canvas', 'writing']),
    projectId: z.string().uuid().optional(),
    writingScope: writingScopeSchema.optional(),
    summary: z.string().max(500),
    status: z.enum(['applied', 'undone']),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
/** The undo button of one change, naming its target so the right window can apply it. */
export const undoRequestSchema = z.union([
  z.object({ transactionId: z.string().uuid(), projectId: z.string().uuid() }).strict(),
  z.object({ transactionId: z.string().uuid(), writingScope: writingScopeSchema }).strict(),
]);
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type UndoRequest = z.infer<typeof undoRequestSchema>;
