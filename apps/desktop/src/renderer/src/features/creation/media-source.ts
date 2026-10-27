import { httpUrl, type BridgeResult } from '../../../../shared/generation';
import type { AssetData } from './types';

export async function mediaSource(
  url: string,
  kind: AssetData['kind'],
): Promise<BridgeResult<string>> {
  if (kind === 'video' || kind === 'image') {
    const parsed = httpUrl.safeParse(url);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, error: '请输入完整的 HTTP(S) 媒体地址' };
  }
  return window.desktop!.generation.mediaUrl(url);
}
