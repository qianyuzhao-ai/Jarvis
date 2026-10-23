import { useRef, useState } from 'react';
import { ArrowUp, Maximize, Minimize, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { normalizeMedia } from './models';
import { ImageControls } from './ImageControls';
import { VideoControls } from './VideoControls';
import { References } from './References';
import { PromptEditor } from './PromptEditor';
import { GenerationDetails } from './GenerationDetails';
import { rebaseLocalMentions, type PromptMention } from './prompt-mentions';
import { generationBusy } from './useGeneration';
import type { MediaData } from './types';
export function MediaEditor({
  data,
  mentions,
  onChange,
  onClose,
  onDelete,
  onGenerate,
  connectedCount = 0,
}: {
  data: MediaData;
  mentions: PromptMention[];
  onChange: (data: MediaData) => void;
  onClose: () => void;
  onDelete: () => void;
  onGenerate: () => void;
  connectedCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const promptRef = useRef<HTMLElement>(null);
  const expandedButton = useRef<HTMLButtonElement>(null);
  function toggleExpanded(next: boolean) {
    setExpanded(next);
    requestAnimationFrame(() =>
      next ? promptRef.current?.focus() : expandedButton.current?.focus(),
    );
  }
  const [referenceError, setReferenceError] = useState('');
  const busy = generationBusy(data);
  const video = data.kind === 'video';
  const label = video ? '视频' : '图像';
  const update = (patch: Partial<MediaData>) => {
    onChange(normalizeMedia({ ...data, ...patch }));
  };
  return (
    <>
      {expanded && <div className="editor-focus-backdrop" aria-hidden="true" />}
      <section
        className={`media-editor nodrag nowheel ${expanded ? 'is-expanded' : ''}`}
        role={expanded ? 'dialog' : 'region'}
        aria-modal={expanded || undefined}
        aria-label={`${label}编辑面板`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (expanded) toggleExpanded(false);
            else onClose();
          }
          if (expanded && e.key === 'Tab') {
            const controls = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), textarea:not(:disabled), select:not(:disabled), input:not(:disabled):not([type="hidden"]), summary, code[tabindex], [contenteditable="true"]',
              ),
            ).filter((n) => n.offsetParent !== null);
            const first = controls[0],
              last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="editor-top">
          <References
            items={mentions}
            expanded={expanded}
            onExpand={() => toggleExpanded(true)}
            onError={setReferenceError}
            disabled={busy}
            data={data}
            onChange={(references) =>
              update({
                references,
                prompt: rebaseLocalMentions(data.prompt, data.references, references),
              })
            }
          />
          <PromptEditor
            inputRef={promptRef}
            disabled={busy}
            label={`${label}提示词`}
            placeholder={
              video
                ? '描述视频内容、主体动作、镜头运动与节奏…'
                : '描述你想生成的图片，包括主体、构图、光线与风格…'
            }
            value={data.prompt}
            mentions={mentions}
            onChange={(prompt) => update({ prompt })}
          />
          <div className="editor-window-actions">
            <IconButton label="关闭编辑面板" onClick={onClose}>
              <X size={20} />
            </IconButton>
            <IconButton
              ref={expandedButton}
              label={expanded ? '还原面板' : '放大编辑'}
              aria-expanded={expanded}
              onClick={() => toggleExpanded(!expanded)}
            >
              {expanded ? <Minimize size={18} /> : <Maximize size={18} />}
            </IconButton>
          </div>
        </div>
        <div className="editor-bottom node-editor-bottom">
          {video ? (
            <VideoControls data={data} disabled={busy} onChange={update} />
          ) : (
            <ImageControls data={data} disabled={busy} onChange={update} />
          )}
          {video && (
            <IconButton
              label="生成音频"
              aria-pressed={data.generateAudio}
              disabled={busy}
              onClick={() => update({ generateAudio: !data.generateAudio })}
            >
              {data.generateAudio ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </IconButton>
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
        {referenceError && (
          <p data-testid="editor-notice" className="editor-notice error-text" role="alert">
            {referenceError}
          </p>
        )}
        <GenerationDetails data={data} connectedCount={connectedCount} />
      </section>
    </>
  );
}
