import { fetch, type Response } from 'undici';
import { z } from 'zod';
import { httpUrl } from '../../shared/generation';
import { json, message, ServiceError } from './protocol';

const taskId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const status = z.enum(['pending', 'running', 'success', 'failed']);
export type TaskFetch = (
  url: string,
  init: {
    method: 'POST' | 'GET';
    headers: Record<string, string>;
    body?: string;
    redirect: 'manual';
    signal: AbortSignal;
  },
) => Promise<
  Pick<Response, 'status' | 'ok' | 'body'> & { headers: Pick<Response['headers'], 'get'> }
>;

async function request(url: string, body: string | undefined, fetchTask: TaskFetch) {
  const submitting = body !== undefined;
  try {
    const response = await fetchTask(httpUrl.parse(url), {
      method: submitting ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(submitting ? 30_000 : 15_000),
    });
    const redirected = response.status >= 300 && response.status < 400;
    const loginPage = response.ok && response.headers.get('content-type')?.includes('text/html');
    if (response.status === 401 || response.status === 403 || redirected || loginPage) {
      await response.body?.cancel();
      throw new ServiceError('平台要求登录或当前账号无访问权限，请在设置中登录生成平台并验证连接', {
        authRequired: true,
        unknown: submitting && (redirected || !!loginPage),
      });
    }
    // A gateway failure does not prove that the upstream rejected the submission.
    if (submitting && (response.status >= 500 || response.status === 408)) {
      await response.body?.cancel();
      throw new ServiceError(`提交返回 HTTP ${response.status}，是否接单未知，请勿直接重发`, {
        unknown: true,
      });
    }
    if (submitting && !response.ok) return await json(response);
    try {
      return await json(response);
    } catch (error) {
      throw new ServiceError(message(error), { unknown: submitting, cause: error });
    }
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      submitting
        ? '提交连接中断，是否接单未知；请在平台核实后再重新生成'
        : '暂时无法查询任务，将继续查询；不会重新提交生成',
      { unknown: submitting, cause: error },
    );
  }
}

export async function submitTask(endpoint: string, body: string, fetchTask: TaskFetch = fetch) {
  const parsed = z
    .object({ task_id: taskId, status })
    .safeParse(await request(endpoint, body, fetchTask));
  if (!parsed.success)
    throw new ServiceError('提交响应缺少有效 task_id 或状态，是否接单未知', { unknown: true });
  return parsed.data;
}

export async function getTask(endpoint: string, id: string, fetchTask: TaskFetch = fetch) {
  const url = new URL(httpUrl.parse(endpoint));
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodeURIComponent(taskId.parse(id))}`;
  const parsed = z
    .object({
      task_id: taskId,
      status,
      error_code: z.string().nullish(),
      error_msg: z.string().nullish(),
      response: z
        .object({
          request_id: z.string().optional(),
          result: z.object({
            status: z.string(),
            content: z.array(z.string()).optional(),
            error: z.unknown().optional(),
          }),
        })
        .nullish(),
    })
    .parse(await request(url.href, undefined, fetchTask));
  if (parsed.task_id !== id || (parsed.response?.request_id && parsed.response.request_id !== id))
    throw new Error('查询返回的任务 ID 不匹配，将继续查询原任务');
  if (parsed.status === 'success') {
    if (parsed.response?.result.status !== 'success')
      throw new Error('任务成功但结果状态不一致，将继续查询');
    const result = httpUrl.safeParse(parsed.response.result.content?.[0]);
    if (!result.success) throw new Error('任务成功但缺少有效结果地址，将继续查询');
    return { status: parsed.status, resultUrl: result.data };
  }
  const detail = parsed.response?.result.error;
  const code =
    detail && typeof detail === 'object' && 'code' in detail
      ? String(detail.code)
      : parsed.error_code;
  return {
    status: parsed.status,
    error:
      parsed.status === 'failed'
        ? [code, parsed.error_msg || message(detail)].filter(Boolean).join('：')
        : undefined,
  };
}

export async function getQuota(
  endpoint: string,
  modelName: string,
  fetchTask: TaskFetch = fetch,
): Promise<string> {
  const url = new URL(httpUrl.parse(endpoint));
  url.pathname = url.pathname.replace(/\/[^/]+\/?$/, '/model-quota');
  url.search = new URLSearchParams({ model_name: modelName }).toString();
  const period = z.object({ remaining: z.number().finite() });
  const quota = z
    .object({
      granted: z.boolean(),
      items: z.array(z.object({ label: z.string(), daily: period, monthly: period })),
    })
    .parse(await request(url.href, undefined, fetchTask));
  if (!quota.granted) return '平台当前未授予该模型的生成额度，详情请到平台查看。';
  return (
    quota.items
      .map(
        (item) =>
          `${item.label}：今日剩余 ${item.daily.remaining}，本月剩余 ${item.monthly.remaining}`,
      )
      .join('；') || '额度详情请到平台查看。'
  );
}
