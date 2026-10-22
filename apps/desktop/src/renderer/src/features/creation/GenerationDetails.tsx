import { useRef, useState } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import type { MediaData } from './types';

const labels = {
  uploading: '正在上传素材…',
  submitting: '正在提交生成…',
  running: '正在生成，可能需要较长时间…',
  succeeded: '生成完成',
  failed: '生成失败',
  unknown: '结果未知，请先核实任务是否已执行',
};
export function GenerationDetails({
  data,
  connectedCount,
}: {
  data: MediaData;
  connectedCount: number;
}) {
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const task = data.generation;
  const result =
    data.result && task?.status === 'succeeded' && task.requestId === data.result.requestId
      ? data.result
      : undefined;
  async function copy() {
    if (!result || pending.current) return;
    pending.current = true;
    setError('');
    try {
      const bridge = window.desktop?.generation;
      if (!bridge) throw new Error('复制接口不可用，请重新打开应用');
      const response = await bridge.copyResultUrl(result.requestId);
      if (!response.ok) throw new Error(response.error);
      setCopied(result.requestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败，请重试');
    } finally {
      pending.current = false;
    }
  }
  return (
    <details className="generation-details">
      <summary aria-label="生成信息">
        <span>
          {connectedCount > 0
            ? `已连入 ${connectedCount} 个参考节点，生成时使用上游已完成的 URL。`
            : '生成信息'}
        </span>
        <ChevronRight size={14} aria-hidden="true" />
      </summary>
      <div className="editor-notice generation-details-content" role="status">
        <p>
          {task?.status === 'running' && task.authRequired
            ? '等待重新登录，任务已保留'
            : task?.status === 'running' && task.remoteStatus === 'pending'
              ? '任务已提交，正在排队…'
              : task
                ? labels[task.status]
                : '暂无生成记录'}
        </p>
        {task?.remoteTaskId && <p>平台任务 ID：{task.remoteTaskId}</p>}
        {task?.error && <p className="error-text">{task.error}</p>}
        {task?.warning && <p className="error-text">{task.warning}</p>}
        {task?.status === 'unknown' && (
          <p>不会自动重发。再次点击生成会创建新任务，可能产生重复费用。</p>
        )}
        {result && (
          <div className="generation-result">
            <span>返回 URL</span>
            <code tabIndex={0}>{result.url}</code>
            <button type="button" onClick={() => void copy()} aria-label="复制返回 URL">
              {copied === result.requestId ? <Check size={14} /> : <Copy size={14} />}
              {copied === result.requestId ? '已复制' : '复制 URL'}
            </button>
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
