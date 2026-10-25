import { z } from 'zod';
import { writingScopeSchema } from './writing-agent';

/**
 * What one window has open and can serve Agent tool commands for: its mounted canvas projects and
 * the documents open in its writing space. The main Agent may delegate only to these until
 * projects are stored in the main process.
 */
export const openTargetsSchema = z
  .object({
    projects: z
      .array(z.object({ id: z.string().uuid(), name: z.string().max(100) }).strict())
      .max(50),
    documents: z.array(writingScopeSchema.extend({ name: z.string().max(4096) }).strict()).max(200),
  })
  .strict();
export type OpenTargets = z.infer<typeof openTargetsSchema>;
