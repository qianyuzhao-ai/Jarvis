import { z } from 'zod';
import { writingPathSchema } from './writing';
export const writingScopeSchema = writingPathSchema.strict();
export type WritingScope = z.infer<typeof writingScopeSchema>;
export const writingScopeKey = (scope: WritingScope) => JSON.stringify([scope.rootId, scope.path]);
export const sameWritingScope = (a?: WritingScope, b?: WritingScope) =>
  a && b ? a.rootId === b.rootId && a.path === b.path : a === b;
const offset = z
  .number()
  .int()
  .min(0)
  .max(4 * 1024 * 1024);
const version = z.string().regex(/^[a-f0-9]{64}$/);
export const writingReadSchema = z
  .object({ from: offset.default(0), limit: z.number().int().min(1).max(32000).default(16000) })
  .strict();
export const writingEditSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('replace_range'),
      from: offset,
      to: offset,
      text: z.string().max(100000),
      version,
    })
    .strict(),
  z
    .object({ kind: z.literal('insert_text'), at: offset, text: z.string().max(100000), version })
    .strict(),
]);
export type WritingEdit = z.infer<typeof writingEditSchema>;
export const writingCommandSchema = z
  .object({
    requestId: z.string().uuid(),
    runId: z.string().uuid(),
    scope: writingScopeSchema,
    expiresAt: z.number(),
    command: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('read'),
          selection: z.boolean(),
          from: offset,
          limit: z.number().int().min(1).max(32000),
        })
        .strict(),
      z.object({ type: z.literal('edit'), edit: writingEditSchema }).strict(),
      z.object({ type: z.literal('undo'), transactionId: z.string().uuid() }).strict(),
    ]),
  })
  .strict();
export const writingSnapshotSchema = z
  .object({
    name: z.string().max(4096),
    version,
    length: offset,
    from: offset,
    text: z.string().max(32000),
    next: offset.nullable(),
    block: z
      .object({ type: z.string().max(100), headingPath: z.array(z.string()) })
      .strict()
      .optional(),
    selection: z
      .object({ from: offset, to: offset, text: z.string().max(32000), truncated: z.boolean() })
      .strict(),
  })
  .strict();
export const writingReplySchema = z
  .object({
    requestId: z.string().uuid(),
    runId: z.string().uuid(),
    scope: writingScopeSchema,
    ok: z.boolean(),
    error: z.string().max(1000).optional(),
    snapshot: writingSnapshotSchema.optional(),
    transactionId: z.string().uuid().optional(),
    summary: z.string().max(500).optional(),
  })
  .strict();
export type WritingCommand = z.infer<typeof writingCommandSchema>;
export type WritingReply = z.infer<typeof writingReplySchema>;
