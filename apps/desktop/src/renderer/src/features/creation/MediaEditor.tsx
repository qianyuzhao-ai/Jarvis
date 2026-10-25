import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Tooltip } from '@jarvis/ui/components/Tooltip';
import { Toggle } from '@jarvis/ui/components/Toggle';
import { Spinner } from '@jarvis/ui/components/Spinner';
import { Alert } from '@jarvis/ui/components/Alert';
import { useRef, useState } from 'react';
import { ArrowUp, Maximize, Minimize, Volume2, VolumeX, X } from '@jarvis/ui/icons';
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
  onGenerate,
  connectedCount = 0,
  detailsRequest = 0,
}: {
  data: MediaData;
  mentions: PromptMention[];
  onChange: (data: MediaData) => void;
  onClose: () => void;
  onGenerate: () => void;
  connectedCount?: number;
  detailsRequest?: number;
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
        {expanded && (
          <div className="expanded-reference-heading">
            <strong>参考素材</strong>
            <span>
              {mentions.length} / {video ? '图片 9 · 视频 3 · 音频 3' : '9 · 仅图片'}
            </span>
          </div>
        )}
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
            <IconButton variant="ghost" size="icon-sm" aria-label="关闭编辑面板" onClick={onClose}>
              <X size={20} />
            </IconButton>
            <Tooltip side="right" content={expanded ? '还原面板' : '放大编辑'}>
              <Button
                variant="ghost"
                size="icon-sm"
                ref={expandedButton}
                aria-label={expanded ? '还原面板' : '放大编辑'}
                aria-expanded={expanded}
                onClick={() => toggleExpanded(!expanded)}
              >
                {expanded ? <Minimize size={18} /> : <Maximize size={18} />}
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="editor-bottom node-editor-bottom">
          {video ? (
            <VideoControls data={data} disabled={busy} onChange={update} />
          ) : (
            <ImageControls data={data} disabled={busy} onChange={update} />
          )}
          {video && (
            <Toggle
              aria-label="生成音频"
              pressed={data.generateAudio}
              disabled={busy}
              onPressedChange={(generateAudio) => update({ generateAudio })}
            >
              {data.generateAudio ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </Toggle>
          )}
          <span className="editor-spacer" />
          {busy ? (
            <span className="editor-generation-hint">
              <Spinner size="sm" />
              正在生成…
            </span>
          ) : (
            (!data.model || !data.prompt.trim()) && (
              <span className="editor-generation-hint">
                {video ? '填写提示词后可生成' : '选择模型并填写提示词后可生成'}
              </span>
            )
          )}
          <IconButton
            size="icon-lg"
            aria-label={`生成${label}`}
            className="generate-button"
            disabled={busy || !data.model || !data.prompt.trim()}
            onClick={onGenerate}
          >
            <ArrowUp size={20} />
          </IconButton>
        </div>
        {referenceError && (
          <Alert
            tone="error"
            data-testid="editor-notice"
            className="editor-notice"
            onDismiss={() => setReferenceError('')}
          >
            {referenceError}
          </Alert>
        )}
        <GenerationDetails
          data={data}
          connectedCount={connectedCount}
          openRequest={detailsRequest}
        />
      </section>
    </>
  );
}
