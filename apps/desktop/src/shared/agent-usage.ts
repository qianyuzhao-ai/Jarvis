import { z } from 'zod';

/** Who spent the tokens: a project's Coordinator (main agent), its threads (sub-agents), or model tests. */
export const usageRoleSchema = z.enum(['coordinator', 'thread', 'other']);
export type UsageRole = z.infer<typeof usageRoleSchema>;

export const usageRangeSchema = z.enum(['today', '7d', '30d', 'all']);
export type UsageRange = z.infer<typeof usageRangeSchema>;

export const usageQuerySchema = z
  .object({
    range: usageRangeSchema,
    /** Only this project's Coordinator and threads; model tests belong to no project. */
    projectId: z.string().uuid().nullable(),
  })
  .strict();
export type UsageQuery = z.infer<typeof usageQuerySchema>;

/** Tokens and the known part of their cost; `cost` is null when none of them had a price. */
export interface UsageAmount {
  tokens: number;
  cost: number | null;
}
export interface UsageSummary {
  range: UsageRange;
  projectId: string | null;
  /** When the first reply was recorded; null before any. */
  since: number | null;
  total: UsageAmount & {
    /** Models used in the range that have no price (custom relays). */
    unpricedModels: number;
  };
  coordinator: UsageAmount;
  thread: UsageAmount;
  other: UsageAmount;
  /** Days (or months for long spans), oldest first. */
  buckets: {
    start: number;
    unit: 'day' | 'month';
    coordinator: number;
    thread: number;
    other: number;
  }[];
  models: {
    provider: string;
    model: string;
    input: number;
    output: number;
    /** Cache reads and writes. */
    cache: number;
    tokens: number;
    cost: number | null;
  }[];
  /** The Coordinator of each project. */
  projects: ({ projectId: string; title: string } & UsageAmount)[];
  /** Threads that spent the most, at most five. */
  threads: ({
    threadId: string;
    projectId: string;
    title: string;
    projectTitle: string;
  } & UsageAmount)[];
}
