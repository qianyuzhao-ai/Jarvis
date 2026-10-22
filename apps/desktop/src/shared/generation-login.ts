import { z } from 'zod';

export const loginFields = {
  loginUrl: z.string().max(2000).optional(),
  loginDomains: z.string().max(4000).optional(),
};
export function loginAddress(value: string): URL {
  const text = value.trim();
  if (!text) throw new Error('请填写平台登录地址');
  const url = new URL(text.includes('://') ? text : `https://${text}`);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('登录地址须为 HTTPS 域名或网址，不包含账号密码、查询参数或片段');
  return url;
}
export function loginOrigins(endpoint: string, address: string, domains: string): Set<string> {
  const allowed = new Set([loginAddress(endpoint).origin, loginAddress(address).origin]);
  for (const value of domains.split(/[\s,，;；]+/).filter(Boolean)) {
    const url = loginAddress(value);
    if (url.pathname !== '/' || url.hostname.includes('*'))
      throw new Error('统一登录域名只填写域名，不包含路径或通配符');
    allowed.add(url.origin);
  }
  return allowed;
}
export const platformLoginSchema = z
  .object({
    generateUrl: z.string().min(1).max(2000),
    loginUrl: z.string().min(1).max(2000),
    loginDomains: z.string().max(4000),
  })
  .superRefine((value, context) => {
    try {
      loginOrigins(value.generateUrl, value.loginUrl, value.loginDomains);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : '登录配置无效',
      });
    }
  });
export type PlatformLogin = z.infer<typeof platformLoginSchema>;
export type PlatformLoginStatus = {
  state: 'empty' | 'unverified' | 'verified' | 'expired' | 'open';
  message: string;
};
