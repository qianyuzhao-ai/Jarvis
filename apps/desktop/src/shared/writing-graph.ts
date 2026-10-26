import { z } from 'zod';
import { writingPathSchema, type WritingFileType } from './writing';

export const graphRootSchema = writingPathSchema.pick({ rootId: true }).strict();
export interface GraphDot {
  path: string;
  name: string;
  fileType: WritingFileType;
  size: number;
  mtime: number;
  firstSeen: number;
  title: string;
  tags: string[];
  summary: string;
  inbound: number;
}
export interface GraphLink {
  source: string;
  target: string | null;
  reference: string;
  kind: 'wiki' | 'relative';
  from: number;
  to: number;
  context: string;
  firstSeen: number;
}
export interface WritingGraph {
  dots: GraphDot[];
  links: GraphLink[];
  tags: { tag: string; paths: string[] }[];
  truncated: boolean;
  indexing: boolean;
}
export interface WritingBacklinks {
  backlinks: GraphLink[];
  broken: GraphLink[];
}
export const resonanceSchema = z
  .array(
    z.object({ path: z.string().min(1).max(4096), reason: z.string().min(1).max(500) }).strict(),
  )
  .max(3);
export type Resonance = z.infer<typeof resonanceSchema>[number];
export const writingLinkSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('link'),
      rootId: z.string().min(1).max(64),
      from: z.string().min(1).max(4096),
      to: z.string().min(1).max(4096),
    })
    .strict(),
  z
    .object({
      action: z.literal('repair'),
      rootId: z.string().min(1).max(64),
      from: z.string().min(1).max(4096),
      to: z.string().min(1).max(4096),
      reference: z.string().min(1).max(4096),
      offset: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ action: z.literal('undo'), transactionId: z.string().uuid() }).strict(),
]);
export type WritingLinkRequest = z.infer<typeof writingLinkSchema>;
export interface WritingLinkReceipt {
  inserted?: string;
  transactionId?: string;
  saved: boolean;
  unchanged?: boolean;
}
