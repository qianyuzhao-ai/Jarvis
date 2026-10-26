import { z } from 'zod';
import { writingScopeSchema } from './writing-agent';
import { projectOpSchema } from './project';
import { fileOpSchema } from './agent-files';

/**
 * One round's reversible change to one target. `id` is the transaction ID the data owner (canvas
 * or writing host) returned; repeated edits in the same round share it.
 */
export const ledgerEntrySchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    runId: z.string().uuid(),
    pack: z.enum(['canvas', 'writing', 'writing-link', 'files']),
    projectId: z.string().uuid().optional(),
    writingScope: writingScopeSchema.optional(),
    summary: z.string().max(500),
    /**
     * For canvas changes saved in the main process: the ops that undo the whole round, and the
     * graph revision they expect. Older entries lack them and are undone by the window instead.
     */
    inverse: z.array(projectOpSchema).max(5000).optional(),
    afterRevision: z.string().max(100).optional(),
    /** For local file changes: the round's operations, undone in reverse order. */
    fileOps: z.array(fileOpSchema).max(200).optional(),
    linkChange: z
      .object({
        at: z.number().int().nonnegative(),
        removed: z.string().max(100000),
        inserted: z.string().max(100000),
        afterVersion: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
    status: z.enum(['applied', 'undone']),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
/** The undo button of one change, naming its target so the right window can apply it. */
export const undoRequestSchema = z.union([
  z.object({ transactionId: z.string().uuid(), projectId: z.string().uuid() }).strict(),
  z.object({ transactionId: z.string().uuid(), writingScope: writingScopeSchema }).strict(),
  z.object({ transactionId: z.string().uuid(), files: z.literal(true) }).strict(),
]);
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type UndoRequest = z.infer<typeof undoRequestSchema>;
