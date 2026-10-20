import { z } from 'zod';

export const serviceSettingsSchema = z.object({
  reqFrom: z.string().trim().min(1, '请在设置中填写 req_from').max(100),
  generateUrl: z.string(),
  imageUploadUrl: z.string(),
  audioUploadUrl: z.string(),
});
export const httpUrl = z
  .string()
  .trim()
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ['http:', 'https:'].includes(u.protocol) &&
        Boolean(u.hostname) &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  }, '请输入完整的 HTTP(S) 地址');
export const generationInputSchema = z.object({
  kind: z.enum(['image', 'video']),
  prompt: z.string().trim().min(1, '请输入提示词').max(100000),
  model: z.enum([
    'gpt-image-2',
    'gpt-image-2.5-flare',
    'gpt-image-2.5-sunburst',
    'nano-banana-2',
    'nano-banana-pro',
    'seedance-2.0',
    'seedance-2.5',
  ]),
  size: z.string(),
  resolution: z.string(),
  quality: z.string(),
  duration: z
    .number()
    .int()
    .refine((n) => n === -1 || (n >= 4 && n <= 30), '视频时长应为 4–30 秒或自动'),
  generateAudio: z.boolean(),
  imageList: z.array(httpUrl).max(16),
  videoList: z.array(httpUrl).max(3),
  audioList: z.array(httpUrl).max(3),
});
export const startRequestSchema = z.object({
  requestId: z.uuid(),
  projectId: z.uuid(),
  nodeId: z.uuid(),
  settings: serviceSettingsSchema,
  input: generationInputSchema,
});
export const uploadRequestSchema = z.object({
  settings: serviceSettingsSchema,
  file: z.object({
    name: z.string().min(1).max(500),
    mime: z.string().max(200),
    kind: z.enum(['image', 'video', 'audio']),
    bytes: z.instanceof(Uint8Array),
  }),
});
export const jobSchema = z.object({
  requestId: z.uuid(),
  projectId: z.uuid(),
  nodeId: z.uuid(),
  kind: z.enum(['image', 'video']),
  status: z.enum(['running', 'succeeded', 'failed', 'unknown']),
  startedAt: z.number(),
  resultUrl: z.string().optional(),
  error: z.string().optional(),
  warning: z.string().optional(),
});
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type StartRequest = z.infer<typeof startRequestSchema>;
export type UploadRequest = z.infer<typeof uploadRequestSchema>;
export type GenerationJob = z.infer<typeof jobSchema>;
export type ServiceSettings = z.infer<typeof serviceSettingsSchema>;
export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface GenerationBridge {
  upload(request: UploadRequest): Promise<BridgeResult<{ url: string }>>;
  start(request: StartRequest): Promise<BridgeResult<GenerationJob>>;
  get(requestId: string): Promise<BridgeResult<GenerationJob | null>>;
}
