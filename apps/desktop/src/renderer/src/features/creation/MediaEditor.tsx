import { useState } from 'react';
import { ArrowUp, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import {
  gptSizes,
  imageModels,
  isNano,
  nanoRatios,
  normalizeMedia,
  videoModels,
  videoRatios,
} from './models';
import { References } from './References';
import { generationBusy } from './useGeneration';
import type { MediaData } from './types';
export function MediaEditor({
  data,
  onChange,
  onClose,
  onDelete,
  onGenerate,
}: {
  data: MediaData;
  onChange: (data: MediaData) => void;
  onClose: () => void;
  onDelete: () => void;
  onGenerate: () => void;
}) {
  const [options, setOptions] = useState(false);
  const busy = generationBusy(data);
  const task = data.generation;
  const taskLabel = {
    uploading: '正在上传素材…',
    submitting: '正在提交生成…',
    running: '正在生成，可能需要较长时间…',
    succeeded: '生成完成',
    failed: '生成失败',
    unknown: '结果未知，请先核实任务是否已执行',
  };
  const video = data.kind === 'video',
    nano = isNano(data.model);
  const label = video ? '视频' : '图像';
  const update = (patch: Partial<MediaData>) => {
    onChange(normalizeMedia({ ...data, ...patch }));
  };
  const models = video ? videoModels : imageModels;
  const ratios = video ? videoRatios : nano ? nanoRatios : gptSizes;
  return (
    <section
      className="media-editor nodrag nowheel"
      aria-label={`${label}编辑面板`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="editor-top">
        <References disabled={busy} data={data} onChange={(references) => update({ references })} />
        <textarea
          disabled={busy}
          aria-label={`${label}提示词`}
          placeholder={
            video
              ? '描述视频内容、主体动作、镜头运动与节奏…'
              : '描述你想生成的图片，包括主体、构图、光线与风格…'
          }
          value={data.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
        />
        <IconButton label="关闭编辑面板" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      <div className="editor-bottom">
        <select
          disabled={busy}
          aria-label="选择模型"
          value={data.model}
          onChange={(e) => update({ model: e.target.value })}
        >
          <option value="">选择模型</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
              {m.includes('2.5-') ? '（待验证）' : ''}
            </option>
          ))}
        </select>
        <button
          className="parameter-button"
          type="button"
          aria-expanded={options}
          onClick={() => setOptions(!options)}
        >
          <SlidersHorizontal size={18} />
          {data.size}
          {video || nano ? ` · ${data.resolution}` : ''}
        </button>
        {video && (
          <label className="duration-control">
            <span className="sr-only">视频时长</span>
            <select
              disabled={busy}
              aria-label="视频时长"
              value={data.duration}
              onChange={(e) => update({ duration: Number(e.target.value) })}
            >
              <option value={-1}>自动时长</option>
              {Array.from({ length: data.model === 'seedance-2.5' ? 27 : 12 }, (_, i) => i + 4).map(
                (n) => (
                  <option key={n} value={n}>
                    {n} 秒
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        <span className="editor-spacer" />
        <IconButton label="删除节点" disabled={busy} onClick={onDelete}>
          <Trash2 size={16} />
        </IconButton>
        <IconButton
          label={`生成${label}`}
          className="generate-button"
          disabled={busy || !data.model || !data.prompt.trim()}
          onClick={onGenerate}
        >
          <ArrowUp size={20} />
        </IconButton>
      </div>
      {options && (
        <fieldset className="parameter-panel" disabled={busy}>
          <label>
            尺寸 / 比例
            <select
              aria-label="尺寸 / 比例"
              value={data.size}
              onChange={(e) => update({ size: e.target.value })}
            >
              {ratios.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {(video || nano) && (
            <label>
              分辨率
              <select
                aria-label="分辨率"
                value={data.resolution}
                onChange={(e) => update({ resolution: e.target.value })}
              >
                {(nano
                  ? ['1K', '2K', '4K']
                  : data.model === 'seedance-2.5'
                    ? ['480p', '720p', '1080p']
                    : ['480p', '720p', '1080p', '4k']
                ).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          )}
          {!video && !nano && (
            <label>
              质量
              <select
                aria-label="质量"
                value={data.quality}
                onChange={(e) => update({ quality: e.target.value })}
              >
                {[
                  'auto',
                  'high',
                  'medium',
                  'low',
                  ...(data.model.includes('2.5') ? ['max', 'xhigh'] : []),
                ].map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </label>
          )}
          {video ? (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={data.generateAudio}
                onChange={(e) => update({ generateAudio: e.target.checked })}
              />
              生成音频
            </label>
          ) : (
            <span>单次生成 1 张</span>
          )}
        </fieldset>
      )}
      {task && (
        <div className="editor-notice" role="status">
          <p>{taskLabel[task.status]}</p>
          {task.error && <p className="error-text">{task.error}</p>}
          {task.warning && <p className="error-text">{task.warning}</p>}
          {task.status === 'unknown' && (
            <p>不会自动重发。再次点击生成会创建新任务，可能产生重复费用。</p>
          )}
        </div>
      )}
    </section>
  );
}
