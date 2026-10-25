import { z } from 'zod';

/** A folder the user allowed the main Agent to work in. */
export type AuthorizedFolder = { id: string; name: string; directory: string; addedAt: number };
export const folderId = z.string().regex(/^[a-f0-9]{24}$/);
/** A path inside an authorized folder, relative and with forward slashes. */
export const folderPath = z.string().max(4096);
/**
 * One file change in a round, with what its undo needs: the content hash it left behind and,
 * for overwrites and deletions, the snapshot of the previous bytes.
 */
export const fileOpSchema = z
  .object({
    op: z.enum(['create', 'overwrite', 'delete', 'move', 'mkdir']),
    folderId,
    path: folderPath,
    to: folderPath.optional(),
    hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    snapshot: z.string().uuid().optional(),
  })
  .strict();
export type FileOp = z.infer<typeof fileOpSchema>;
