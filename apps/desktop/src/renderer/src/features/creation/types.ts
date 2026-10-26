import { z } from 'zod';
import type { Edge, Node } from '@xyflow/react';
import { httpUrl } from '../../../../shared/generation';
import { loginFields } from '../../../../shared/generation-login';
import { defaultMedia, mediaName } from '../../../../shared/canvas-media';

export const assetSchema = z.object({
  kind: z.enum(['image', 'video', 'audio']),
  name: z.string(),
  upload: z.discriminatedUnion('status', [
    z.object({ status: z.literal('uploading') }),
    z.object({ status: z.literal('failed'), error: z.string() }),
    z.object({ status: z.literal('ready'), url: httpUrl }),
  ]),
});
export const assetNodeSchema = z.object({
  id: z.string(),
  type: z.literal('asset'),
  position: z.object({ x: z.number(), y: z.number() }),
  data: assetSchema,
});

export const referenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['image', 'video', 'audio']),
  blob: z.instanceof(Blob),
  uploadedUrl: z.string().optional(),
  uploadedFor: z.string().optional(),
});
export const mediaSchema = z.object({
  name: z.string().optional(),
  kind: z.enum(['image', 'video']),
  prompt: z.string(),
  model: z.string(),
  size: z.string(),
  resolution: z.string(),
  quality: z.string(),
  duration: z.number().int(),
  generateAudio: z.boolean(),
  references: z.array(referenceSchema),
  generation: z
    .object({
      requestId: z.string(),
      status: z.enum(['uploading', 'submitting', 'running', 'succeeded', 'failed', 'unknown']),
      startedAt: z.number(),
      error: z.string().optional(),
      warning: z.string().optional(),
      remoteTaskId: z.string().optional(),
      remoteStatus: z.string().optional(),
      quotaPending: z.boolean().optional(),
      authRequired: z.boolean().optional(),
      agent: z.boolean().optional(),
    })
    .optional(),
  result: z.object({ requestId: z.string(), url: z.string() }).optional(),
});
const mediaNodeSchema = z.object({
  id: z.string(),
  type: z.literal('media'),
  position: z.object({ x: z.number(), y: z.number() }),
  data: mediaSchema,
});
const nodeSchema = z.discriminatedUnion('type', [mediaNodeSchema, assetNodeSchema]);
export const edgeSchema = z.object({ id: z.string(), source: z.string(), target: z.string() });
const graphSchema = z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) });
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.number(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema).default([]),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }),
  minimap: z.boolean(),
  dots: z.boolean(),
  snap: z.boolean().default(true),
  agentEdits: z
    .array(
      z.object({
        id: z.string().uuid(),
        runId: z.string().uuid(),
        createdAt: z.number(),
        before: graphSchema,
        afterRevision: z.string(),
        nodeIds: z.array(z.string()),
      }),
    )
    .max(20)
    .default([]),
});
export const settingsSchema = z.object({
  ...loginFields,
  reqFrom: z.string().max(100),
  generateUrl: z.string(),
  imageUploadUrl: z.string(),
  audioUploadUrl: z.string(),
});
export const workspaceSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
  settings: settingsSchema,
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  sidebarWidth: z.number().min(230).max(320).default(248),
});
export type MediaData = z.infer<typeof mediaSchema>;
export type MediaNode = Node<MediaData, 'media'>;
export type AssetData = z.infer<typeof assetSchema>;
export type AssetNode = Node<AssetData, 'asset'>;
export type CanvasNode = MediaNode | AssetNode;
export type CanvasEdge = Edge;
export type Reference = z.infer<typeof referenceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type WorkspaceData = z.infer<typeof workspaceSchema>;
export const emptyWorkspace: WorkspaceData = {
  version: 1,
  projects: [],
  theme: 'system',
  sidebarWidth: 248,
  settings: { reqFrom: '', generateUrl: '', imageUploadUrl: '', audioUploadUrl: '' },
};
export function createProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: '未命名画布',
    updatedAt: Date.now(),
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    minimap: false,
    dots: true,
    snap: true,
    agentEdits: [],
  };
}
export { mediaName };
export function createMedia(kind: MediaData['kind']): MediaData {
  return { ...defaultMedia(kind), references: [] };
}
