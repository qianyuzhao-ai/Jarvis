import { z } from 'zod';

/** How many Agent model requests may stream at once, across all conversations. */
export const concurrencySchema = z.number().int().min(1).max(6);
export const agentSettingsSchema = z.object({
  version: z.literal(1),
  concurrency: concurrencySchema,
});
export type AgentSettings = z.infer<typeof agentSettingsSchema>;
export const DEFAULT_AGENT_SETTINGS: AgentSettings = { version: 1, concurrency: 3 };
