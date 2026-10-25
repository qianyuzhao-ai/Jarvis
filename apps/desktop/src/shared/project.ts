import { z } from 'zod';
import { httpUrl } from './generation';

/**
 * Canvas projects as the main process stores them. A reference file is not inline: its bytes sit
 * beside the project as a blob named by the reference ID, and the node keeps its metadata.
 */
export const blobId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const nodeId = z.string().min(1).max(100);
const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const storedReferenceSchema = z
  .object({
    id: blobId,
    name: z.string().max(1000),
    type: z.enum(['image', 'video', 'audio']),
    mimeType: z.string().max(200),
    size: z.number().int().nonnegative(),
    uploadedUrl: z.string().max(4000).optional(),
    uploadedFor: z.string().max(4000).optional(),
  })
  .strict();
export const storedAssetSchema = z
  .object({
    kind: z.enum(['image', 'video', 'audio']),
    name: z.string().max(1000),
    upload: z.discriminatedUnion('status', [
      z.object({ status: z.literal('uploading') }).strict(),
      z.object({ status: z.literal('failed'), error: z.string().max(2000) }).strict(),
      z.object({ status: z.literal('ready'), url: httpUrl }).strict(),
    ]),
  })
  .strict();
export const storedMediaSchema = z
  .object({
    name: z.string().max(200).optional(),
    kind: z.enum(['image', 'video']),
    prompt: z.string().max(32000),
    model: z.string().max(100),
    size: z.string().max(40),
    resolution: z.string().max(40),
    quality: z.string().max(40),
    duration: z.number().int(),
    generateAudio: z.boolean(),
    references: z.array(storedReferenceSchema).max(100),
    generation: z
      .object({
        requestId: z.string().max(200),
        status: z.enum(['uploading', 'submitting', 'running', 'succeeded', 'failed', 'unknown']),
        startedAt: z.number(),
        error: z.string().max(2000).optional(),
        warning: z.string().max(2000).optional(),
        remoteTaskId: z.string().max(200).optional(),
        remoteStatus: z.string().max(200).optional(),
        quotaPending: z.boolean().optional(),
        authRequired: z.boolean().optional(),
      })
      .strict()
      .optional(),
    result: z
      .object({ requestId: z.string().max(200), url: z.string().max(4000) })
      .strict()
      .optional(),
  })
  .strict();
export const storedNodeSchema = z.discriminatedUnion('type', [
  z.object({ id: nodeId, type: z.literal('media'), position, data: storedMediaSchema }).strict(),
  z.object({ id: nodeId, type: z.literal('asset'), position, data: storedAssetSchema }).strict(),
]);
export const storedEdgeSchema = z
  .object({ id: z.string().min(1).max(100), source: nodeId, target: nodeId })
  .strict();
const graph = z
  .object({ nodes: z.array(storedNodeSchema), edges: z.array(storedEdgeSchema) })
  .strict();
export const viewportSchema = z
  .object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().positive() })
  .strict();
export const agentEditSchema = z
  .object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    createdAt: z.number(),
    before: graph,
    afterRevision: z.string().max(100),
    nodeIds: z.array(nodeId).max(200),
  })
  .strict();
export const storedProjectSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().max(100),
    updatedAt: z.number(),
    nodes: z.array(storedNodeSchema).max(2000),
    edges: z.array(storedEdgeSchema).max(10000),
    viewport: viewportSchema,
    minimap: z.boolean(),
    dots: z.boolean(),
    snap: z.boolean(),
    agentEdits: z.array(agentEditSchema).max(20),
  })
  .strict()
  .superRefine((project, ctx) => {
    const ids = new Set<string>();
    for (const node of project.nodes) {
      if (ids.has(node.id)) ctx.addIssue({ code: 'custom', message: `节点 ID 重复：${node.id}` });
      ids.add(node.id);
    }
    const edges = new Set<string>();
    for (const edge of project.edges) {
      if (edges.has(edge.id)) ctx.addIssue({ code: 'custom', message: `连线 ID 重复：${edge.id}` });
      edges.add(edge.id);
      if (!ids.has(edge.source) || !ids.has(edge.target))
        ctx.addIssue({ code: 'custom', message: `连线指向不存在的节点：${edge.id}` });
    }
  });
export type StoredReference = z.infer<typeof storedReferenceSchema>;
export type StoredNode = z.infer<typeof storedNodeSchema>;
export type StoredEdge = z.infer<typeof storedEdgeSchema>;
export type StoredProject = z.infer<typeof storedProjectSchema>;

/**
 * One change to a project. `update_node` merges `data` into the node's data and deletes the keys
 * in `unset`; the result is validated as a whole, so a patch cannot leave a malformed node.
 */
/** A node data field name; plain identifiers only, so a patch cannot touch object internals. */
const dataKey = z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/);
export const projectOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add_node'), node: storedNodeSchema }).strict(),
  z
    .object({
      kind: z.literal('update_node'),
      nodeId,
      data: z.record(dataKey, z.unknown()).default({}),
      unset: z.array(dataKey).max(50).default([]),
    })
    .strict(),
  z.object({ kind: z.literal('move_node'), nodeId, position }).strict(),
  z.object({ kind: z.literal('remove_node'), nodeId }).strict(),
  z.object({ kind: z.literal('connect'), edge: storedEdgeSchema }).strict(),
  z.object({ kind: z.literal('disconnect'), edgeId: z.string().min(1).max(100) }).strict(),
  z
    .object({
      kind: z.literal('set_project'),
      patch: z
        .object({
          name: z.string().max(100),
          viewport: viewportSchema,
          minimap: z.boolean(),
          dots: z.boolean(),
          snap: z.boolean(),
        })
        .partial()
        .strict(),
    })
    .strict(),
  z
    .object({ kind: z.literal('set_agent_edits'), agentEdits: z.array(agentEditSchema).max(20) })
    .strict(),
]);
export const projectOpsSchema = z.array(projectOpSchema).min(1).max(500);
export type ProjectOp = z.infer<typeof projectOpSchema>;
