import { z } from 'zod';
import { loginFields, type PlatformLogin, type PlatformLoginStatus } from './generation-login';

export const REFERENCE_LIMITS = { image: 9, audio: 3, video: 3 } as const;
export const UPLOAD_LIMIT_MIB = { image: 32, video: 200, audio: 64 } as const;
export const TASK_POLL_INTERVAL_MS = 5000;
export const serviceSettingsSchema = z.object({
  ...loginFields,
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
  imageList: z.array(httpUrl).max(REFERENCE_LIMITS.image),
  videoList: z.array(httpUrl).max(REFERENCE_LIMITS.video),
  audioList: z.array(httpUrl).max(REFERENCE_LIMITS.audio),
});
export const startRequestSchema = z.object({
  requestId: z.uuid(),
  projectId: z.uuid(),
  nodeId: z.uuid(),
  settings: serviceSettingsSchema,
  input: generationInputSchema,
});
export const uploadRequestSchema = z.object({
  requestId: z.uuid(),
  projectId: z.uuid(),
  nodeId: z.uuid(),
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
  remoteTaskId: z.string().optional(),
  remoteStatus: z.string().optional(),
  quotaNotice: z.string().optional(),
  quotaPending: z.boolean().optional(),
  authRequired: z.boolean().optional(),
});
export const requestRecordSchema = z.object({
  requestId: z.uuid(),
  projectId: z.uuid(),
  nodeId: z.uuid(),
  operation: z.enum(['generation', 'upload']),
  kind: z.enum(['image', 'video', 'audio']),
  status: z.enum(['running', 'succeeded', 'failed', 'unknown']),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  endpoint: z.string().optional(),
  requestJson: z.string().optional(),
  model: z.string().optional(),
  duration: z.number().optional(),
  resultUrl: z.string().optional(),
  fileName: z.string().optional(),
  error: z.string().optional(),
  warning: z.string().optional(),
  remoteTaskId: z.string().optional(),
});
export type RequestRecord = z.infer<typeof requestRecordSchema>;
export const exportProjectSchema = z.object({
  projectId: z.uuid(),
  projectName: z.string().trim().min(1).max(200),
});
export type ExportProject = z.infer<typeof exportProjectSchema>;
export const downloadMediaSchema = z.object({
  url: httpUrl,
  kind: z.enum(['image', 'video', 'audio']),
  fileName: z.string().max(500).optional(),
});
export type DownloadMedia = z.infer<typeof downloadMediaSchema>;
export const downloadPreferencesSchema = z.object({
  directory: z.string(),
  dontAskAgain: z.boolean(),
});
export type DownloadPreferences = z.infer<typeof downloadPreferencesSchema>;
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type StartRequest = z.infer<typeof startRequestSchema>;
export type UploadRequest = z.infer<typeof uploadRequestSchema>;
export type GenerationJob = z.infer<typeof jobSchema>;
export type ServiceSettings = z.infer<typeof serviceSettingsSchema>;
export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface GenerationBridge {
  getPlatformLogin(endpoint: string): Promise<BridgeResult<PlatformLoginStatus>>;
  openPlatformLogin(config: PlatformLogin): Promise<BridgeResult<PlatformLoginStatus>>;
  verifyPlatformLogin(endpoint: string): Promise<BridgeResult<PlatformLoginStatus>>;
  logoutPlatform(endpoint: string): Promise<BridgeResult<PlatformLoginStatus>>;
  copyResultUrl(requestId: string): Promise<BridgeResult<void>>;
  getDownloadPreferences(): Promise<BridgeResult<DownloadPreferences>>;
  chooseDownloadDirectory(): Promise<
    BridgeResult<{ canceled: boolean; preferences: DownloadPreferences }>
  >;
  setDownloadDontAsk(value: boolean): Promise<BridgeResult<DownloadPreferences>>;
  downloadMedia(
    request: DownloadMedia,
  ): Promise<BridgeResult<{ canceled: boolean; filePath?: string }>>;
  exportProject(
    request: ExportProject,
  ): Promise<BridgeResult<{ canceled: boolean; filePath?: string }>>;
  mediaUrl(url: string): Promise<BridgeResult<string>>;
  upload(request: UploadRequest): Promise<BridgeResult<{ url: string }>>;
  start(request: StartRequest): Promise<BridgeResult<GenerationJob>>;
  get(requestId: string): Promise<BridgeResult<GenerationJob | null>>;
}
