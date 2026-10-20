import { z } from 'zod';
import type { Node } from '@xyflow/react';

export const referenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['image', 'video', 'audio']),
  blob: z.instanceof(Blob),
  uploadedUrl: z.string().optional(),
  uploadedFor: z.string().optional(),
});
export const mediaSchema = z.object({
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
    })
    .optional(),
  result: z.object({ requestId: z.string(), url: z.string() }).optional(),
});
const nodeSchema = z.object({
  id: z.string(),
  type: z.literal('media'),
  position: z.object({ x: z.number(), y: z.number() }),
  data: mediaSchema,
});
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.number(),
  nodes: z.array(nodeSchema),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }),
  minimap: z.boolean(),
  dots: z.boolean(),
  snap: z.boolean(),
});
export const settingsSchema = z.object({
  reqFrom: z.string().max(100),
  generateUrl: z.string(),
  imageUploadUrl: z.string(),
  audioUploadUrl: z.string(),
});
export const workspaceSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
  settings: settingsSchema,
  theme: z.enum(['light', 'dark']),
  sidebarWidth: z.number().min(230).max(320).default(230),
});
export type MediaData = z.infer<typeof mediaSchema>;
export type MediaNode = Node<MediaData, 'media'>;
export type Reference = z.infer<typeof referenceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type WorkspaceData = z.infer<typeof workspaceSchema>;
export const emptyWorkspace: WorkspaceData = {
  version: 1,
  projects: [],
  theme: 'light',
  sidebarWidth: 230,
  settings: { reqFrom: '', generateUrl: '', imageUploadUrl: '', audioUploadUrl: '' },
};
export function createProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: '未命名项目',
    updatedAt: Date.now(),
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    minimap: false,
    dots: true,
    snap: false,
  };
}
export function createMedia(kind: MediaData['kind']): MediaData {
  return {
    kind,
    prompt: '',
    model: '',
    size: kind === 'image' ? '1:1' : 'adaptive',
    resolution: kind === 'image' ? '2K' : '1080p',
    quality: 'high',
    duration: 5,
    generateAudio: true,
    references: [],
  };
}
