import { z } from 'zod';
import { canvasNodeIdSchema as nodeId } from './canvas-node-id';

const coordinate = z.number().finite().min(-100000).max(100000);
export const canvasChangeSchema = z
  .object({
    nodeId,
    label: z.string().max(200),
    before: z.string().max(32000),
    after: z.string().max(32000),
  })
  .strict();
export const canvasPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    prompt: z.string().max(32000).optional(),
    model: z.string().min(1).max(100).optional(),
    size: z.string().max(40).optional(),
    resolution: z.string().max(40).optional(),
    quality: z.string().max(40).optional(),
    duration: z.number().int().min(-1).max(30).optional(),
    generateAudio: z.boolean().optional(),
  })
  .strict();
export const canvasOperationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('create_node'),
      nodeId,
      media: z.enum(['image', 'video']),
      x: coordinate,
      y: coordinate,
      patch: canvasPatchSchema,
    })
    .strict(),
  z.object({ kind: z.literal('update_node'), nodeId, patch: canvasPatchSchema }).strict(),
  z.object({ kind: z.literal('move_node'), nodeId, x: coordinate, y: coordinate }).strict(),
  z.object({ kind: z.literal('connect'), source: nodeId, target: nodeId }).strict(),
  z.object({ kind: z.literal('disconnect'), source: nodeId, target: nodeId }).strict(),
]);
export const canvasSnapshotSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().max(100),
    revision: z.string().max(100),
    selectedIds: z.array(nodeId).max(100),
    nodes: z
      .array(
        z
          .object({
            id: nodeId,
            type: z.enum(['media', 'asset']),
            kind: z.enum(['image', 'video', 'audio']),
            name: z.string().max(200),
            x: coordinate,
            y: coordinate,
            prompt: z.string().max(32000).optional(),
            model: z.string().max(100).optional(),
            size: z.string().max(40).optional(),
            resolution: z.string().max(40).optional(),
            quality: z.string().max(40).optional(),
            duration: z.number().optional(),
            generateAudio: z.boolean().optional(),
            status: z.string().max(40),
            referenceCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(2000),
    edges: z.array(z.object({ source: nodeId, target: nodeId }).strict()).max(10000),
  })
  .strict();
export const canvasCommandSchema = z
  .object({
    requestId: z.string().uuid(),
    runId: z.string().uuid(),
    projectId: z.string().uuid(),
    expectedRevision: z.string().max(100),
    expiresAt: z.number(),
    command: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('apply'),
          operations: z.array(canvasOperationSchema).min(1).max(100),
        })
        .strict(),
      z.object({ type: z.literal('focus'), nodeIds: z.array(nodeId).min(1).max(100) }).strict(),
    ]),
  })
  .strict();
export const canvasReplySchema = z
  .object({
    requestId: z.string().uuid(),
    projectId: z.string().uuid(),
    ok: z.boolean(),
    error: z.string().max(1000).optional(),
    snapshot: canvasSnapshotSchema.optional(),
    transactionId: z.string().uuid().optional(),
    changes: z.array(canvasChangeSchema).max(200).optional(),
    nodeIds: z.array(nodeId).max(200).optional(),
  })
  .strict();
export type CanvasOperation = z.infer<typeof canvasOperationSchema>;
export type CanvasSnapshot = z.infer<typeof canvasSnapshotSchema>;
export type CanvasCommand = z.infer<typeof canvasCommandSchema>;
export type CanvasReply = z.infer<typeof canvasReplySchema>;
