import { z } from 'zod';
import { Agent, fetch, FormData, type Response } from 'undici';
import {
  generationInputSchema,
  UPLOAD_LIMIT_MIB,
  httpUrl,
  type GenerationInput,
  type UploadRequest,
} from '../../shared/generation';

const dispatcher = new Agent({ connectTimeout: 10000, headersTimeout: 0, bodyTimeout: 0 });
const sizes: Record<string, string> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '4:3': '1536x1152',
  '3:4': '1152x1536',
  '9:16': '864x1536',
  '1:1(2k)': '2048x2048',
  '16:9(2k)': '2048x1152',
  '9:16(2k)': '1152x2048',
  '16:9(4k)': '3840x2160',
  '9:16(4k)': '2160x3840',
  auto: 'auto',
};
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly unknown = false,
  ) {
    super(message);
  }
}
export function payload(raw: GenerationInput, reqFrom: string) {
  const d = generationInputSchema.parse(raw);
  if (d.kind === 'image') {
    if (d.model.startsWith('seedance') || d.videoList.length || d.audioList.length)
      throw new Error('图像节点只能使用图像模型和参考图');
    if (d.model.startsWith('nano-')) {
      const ratio = z
        .enum(['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'])
        .parse(d.size);
      const resolution = z.enum(['1K', '2K', '4K']).parse(d.resolution);
      return {
        req_from: reqFrom,
        model_name: 'nano-banana',
        version:
          d.model === 'nano-banana-2'
            ? 'gemini-3.1-flash-image-preview'
            : 'gemini-3-pro-image-preview',
        prompt: d.prompt,
        image_list: d.imageList,
        config: { aspect_ratio: ratio, image_size: resolution },
      };
    }
    const size = sizes[d.size];
    if (!size) throw new Error('不支持的图像尺寸');
    const qualities = [
      'auto',
      'high',
      'medium',
      'low',
      ...(d.model.includes('2.5') ? ['max', 'xhigh'] : []),
    ];
    return {
      req_from: reqFrom,
      model_name: d.model,
      version: d.model,
      prompt: d.prompt,
      image_list: d.imageList,
      config: { size, n: 1, quality: qualities.includes(d.quality) ? d.quality : 'high' },
    };
  }
  if (!d.model.startsWith('seedance')) throw new Error('视频节点只能使用视频模型');
  const newer = d.model === 'seedance-2.5';
  const resolution = z.enum(['480p', '720p', '1080p', '4k']).parse(d.resolution);
  const ratio = z.enum(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']).parse(d.size);
  return {
    req_from: reqFrom,
    model_name: 'seedance',
    version: newer ? 'doubao-seedance-2-5-260628' : 'seedance-2.0',
    mode: 'reference_image',
    prompt: d.prompt,
    image_list: d.imageList,
    video_list: d.videoList,
    audio_list: d.audioList,
    config: {
      resolution: newer && resolution === '4k' ? '1080p' : resolution,
      ratio,
      duration: d.duration === -1 ? -1 : Math.min(d.duration, newer ? 30 : 15),
      generate_audio: d.generateAudio,
    },
  };
}
function message(error: unknown): string {
  if (typeof error === 'string') return error.slice(0, 300);
  if (error && typeof error === 'object')
    for (const key of ['message', 'msg', 'error', 'detail', 'reason']) {
      const value = (error as Record<string, unknown>)[key];
      if (typeof value === 'string') return value.slice(0, 300);
    }
  return JSON.stringify(error)?.slice(0, 300) || '服务未返回结果';
}
async function json(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new ServiceError('服务响应过大');
      }
      chunks.push(value);
    }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!response.ok)
    throw new ServiceError(`服务返回 HTTP ${response.status}：${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceError('服务返回了无效 JSON');
  }
}
function networkFailure(error: unknown, generating: boolean): never {
  if (error instanceof ServiceError) throw error;
  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  const beforeConnect = [
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'UND_ERR_CONNECT_TIMEOUT',
  ].includes(code);
  throw new ServiceError(
    beforeConnect
      ? '连不上服务，请检查网络与地址'
      : generating
        ? '等待生成响应时连接中断，结果未知；请核实后再决定是否重新生成'
        : '素材上传中断，请手动重试',
    generating && !beforeConnect,
  );
}
export async function generate(
  url: string,
  input: GenerationInput,
  reqFrom: string,
  requestJson?: string,
): Promise<string> {
  const endpoint = httpUrl.parse(url);
  const body = requestJson ?? JSON.stringify(payload(input, reqFrom));
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      dispatcher,
      redirect: 'error',
    });
    const raw = await json(response);
    const parsed = z
      .object({
        result: z.object({
          status: z.string(),
          content: z.array(z.string()).optional(),
          error: z.unknown().optional(),
        }),
      })
      .safeParse(raw);
    if (!parsed.success) throw new ServiceError('服务响应缺少 result 或格式不正确');
    if (parsed.data.result.status !== 'success')
      throw new ServiceError(message(parsed.data.result.error));
    const result = httpUrl.safeParse(parsed.data.result.content?.[0]);
    if (!result.success) throw new ServiceError('服务返回成功，但没有有效的结果地址');
    return result.data;
  } catch (error) {
    networkFailure(error, true);
  }
}
export function uploadDescription(request: UploadRequest) {
  const { file, settings } = request;
  if (!file.mime.startsWith(file.kind + '/')) throw new Error('素材类型不匹配');
  const limit = UPLOAD_LIMIT_MIB[file.kind] * 1024 * 1024;
  if (!file.bytes.byteLength || file.bytes.byteLength > limit)
    throw new Error('素材为空或超过大小限制');
  const url = httpUrl.parse(
    file.kind === 'audio' ? settings.audioUploadUrl : settings.imageUploadUrl,
  );
  return {
    endpoint: url,
    requestJson: JSON.stringify({
      req_from: settings.reqFrom,
      files: [{ name: file.name, content_type: file.mime, size_bytes: file.bytes.byteLength }],
    }),
  };
}
export async function upload(request: UploadRequest): Promise<{ url: string }> {
  const { file, settings } = request;
  const { endpoint: url } = uploadDescription(request);
  const form = new FormData();
  form.set('req_from', settings.reqFrom);
  form.set('files', new Blob([new Uint8Array(file.bytes)], { type: file.mime }), file.name);
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      dispatcher,
      redirect: 'error',
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const parsed = z
      .object({ files: z.array(z.object({ url: httpUrl })) })
      .safeParse(await json(response));
    if (!parsed.success || !parsed.data.files[0])
      throw new ServiceError('上传响应中没有 files[0].url');
    return { url: parsed.data.files[0].url };
  } catch (error) {
    networkFailure(error, false);
  }
}
