import { httpUrl, serviceSettingsSchema, UPLOAD_LIMIT_MIB } from '../../../../shared/generation';
import type { AssetData, Settings } from './types';

const mimeByExtension: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
};
export function inspectAsset(file: { name: string; type: string; size: number }) {
  const mime =
    !file.type || file.type === 'application/octet-stream'
      ? (mimeByExtension[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? '')
      : file.type;
  const prefix = mime.split('/')[0];
  if (prefix !== 'image' && prefix !== 'video' && prefix !== 'audio')
    throw new Error('只支持图片、视频或音频文件');
  const kind: AssetData['kind'] = prefix;
  if (!file.size) throw new Error('文件为空');
  if (file.size > UPLOAD_LIMIT_MIB[kind] * 1024 * 1024)
    throw new Error(`超过 ${UPLOAD_LIMIT_MIB[kind]} MiB 上传限制`);
  return { kind, mime };
}
export function uploadSettings(value: Settings, kind: AssetData['kind']) {
  const result = serviceSettingsSchema.safeParse(value);
  if (!result.success)
    throw new Error(result.error.issues.map((issue) => issue.message).join('；'));
  const settings = result.data;
  const target = kind === 'audio' ? settings.audioUploadUrl : settings.imageUploadUrl;
  if (!httpUrl.safeParse(target).success)
    throw new Error(
      `请在内网地址设置中填写有效的 ${kind === 'audio' ? 'upload-media' : 'upload'} 地址`,
    );
  return settings;
}
