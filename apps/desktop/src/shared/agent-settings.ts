import { z } from 'zod';

/** How many Agent model requests may stream at once, across all conversations. */
export const concurrencySchema = z.number().int().min(1).max(6);
/**
 * What a message sent while its conversation replies does: `steer` hands it to the running reply
 * at its next step, `queue` waits for the reply to end (and can still be steered once by hand).
 */
export const replyModeSchema = z.enum(['steer', 'queue']);
export const agentSettingsSchema = z.object({
  version: z.literal(1),
  concurrency: concurrencySchema,
  whileReplying: replyModeSchema.default('steer'),
});
export type AgentSettings = z.infer<typeof agentSettingsSchema>;
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  concurrency: 3,
  whileReplying: 'steer',
};
export type ReplyMode = z.infer<typeof replyModeSchema>;
