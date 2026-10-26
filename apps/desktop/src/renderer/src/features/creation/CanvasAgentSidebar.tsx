import { AssistantEmpty } from '@jarvis/ui/components/AssistantPanel';
import { Button } from '@jarvis/ui/components/Button';
import { Toggle } from '@jarvis/ui/components/Toggle';
import { Sparkles } from '@jarvis/ui/icons';
import { useRef, useState } from 'react';
import { osValue } from '../../../../shared/agent-os';
import { ChatComposer } from '../agent/ChatComposer';
import { SpaceThreadPanel } from '../agent/SpaceThreadPanel';
import { osBridge } from '../agent/use-agent';
import { useSpaceThread } from '../agent/use-space-thread';
import { CanvasAttachments } from './CanvasAttachments';
import { visualSource } from './canvas-vision';
import { useCanvasAttachments } from './use-canvas-attachments';
import type { Project } from './types';

/**
 * The canvas sidebar: the thread bound to this canvas. Messages carry the selected nodes and,
 * when added, their images or video frames; edits are saved to the canvas and can be undone.
 */
export function CanvasAgentSidebar({
  project,
  selectedIds,
  open,
  focus,
  configure,
  width,
  onWidth,
  onClose,
}: {
  width: number;
  onWidth: (n: number) => void;
  onClose: () => void;
  project: Project;
  selectedIds: string[];
  open: boolean;
  focus: (ids: string[]) => void;
  configure: () => void;
}) {
  const space = useSpaceThread({ kind: 'canvas', canvasId: project.id });
  const attachments = useCanvasAttachments(project, selectedIds, space.setError);
  const [text, setText] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [includeSelected, setIncludeSelected] = useState(true);
  const [undoing, setUndoing] = useState(false);
  const resize = useRef<{ x: number; width: number } | null>(null);
  const pending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const panelWidth = Math.min(width, window.innerWidth - 360);
  const session = space.session;
  async function submit() {
    if (
      pending.current ||
      attachments.preparing ||
      attachments.blocked ||
      (!text.trim() && !attachments.images.length)
    )
      return;
    pending.current = true;
    try {
      const references = [
        ...new Set([
          ...(includeSelected ? selectedIds : []),
          ...attachments.entries.map((e) => e.nodeId),
        ]),
      ];
      if (
        attachments.entries.some((e) => {
          const node = project.nodes.find((n) => n.id === e.nodeId);
          return !node || visualSource(node)?.url !== e.sourceUrl;
        })
      )
        throw new Error('已添加的资产发生变化，请移除后重新添加');
      if (
        await space.send(text.trim() || '请分析本次发送的图片和视频帧。', draftModel || undefined, {
          selectedIds: references,
          images: attachments.images,
        })
      ) {
        setText('');
        attachments.clear();
      }
    } catch (error) {
      space.setError(error instanceof Error ? error.message : '读取画布失败');
    } finally {
      pending.current = false;
    }
  }
  async function undo(id: string) {
    if (undoing) return;
    setUndoing(true);
    await space.act(async () => osValue(await osBridge().undo(id)), '撤销失败');
    setUndoing(false);
  }
  return (
    <div
      data-testid="canvas-agent-shell"
      className="canvas-agent-shell"
      style={{ width: open ? panelWidth : 0 }}
    >
      <SpaceThreadPanel
        id="canvas-agent"
        data-testid="canvas-agent"
        className="canvas-agent"
        aria-label="画布助手"
        aria-hidden={!open}
        inert={!open}
        data-open={open}
        style={{ width: panelWidth }}
        space={space}
        label="画布助手"
        closeLabel="关闭画布助手"
        onClose={onClose}
        canvas={{
          focus,
          undo: (id) => void undo(id),
          canUndo: (id) => !undoing && !space.busy && project.agentEdits.at(-1)?.id === id,
        }}
        before={
          <div
            className="canvas-agent-resizer"
            role="separator"
            tabIndex={0}
            aria-label="调整画布助手宽度"
            aria-orientation="vertical"
            aria-valuenow={width}
            aria-valuemin={340}
            aria-valuemax={560}
            onPointerDown={(e) => {
              resize.current = { x: e.clientX, width };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (resize.current)
                onWidth(
                  Math.max(
                    340,
                    Math.min(
                      560,
                      window.innerWidth - 360,
                      resize.current.width + resize.current.x - e.clientX,
                    ),
                  ),
                );
            }}
            onPointerUp={() => {
              resize.current = null;
            }}
            onPointerCancel={() => {
              resize.current = null;
            }}
            onKeyDown={(e) => {
              if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                onWidth(Math.max(340, Math.min(560, width + (e.key === 'ArrowLeft' ? 10 : -10))));
              }
            }}
          />
        }
        empty={
          <AssistantEmpty
            className="canvas-agent-welcome"
            title="画布助手"
            icon={<Sparkles size={24} />}
          >
            <p>
              对这张画布说要做什么，会开一个线程来做：查看节点、调整提示词和参数、创建节点与连接、发起生成。修改后可撤销。
            </p>
            <p>多选图片或视频后，点击输入框下方 + 添加。图片直接发送，视频抽取代表帧。</p>
            {!space.configured ? (
              <Button variant="secondary" size="sm" type="button" onClick={configure}>
                前往模型设置
              </Button>
            ) : (
              ['梳理当前画布的流程', '检查选中节点的提示词', '帮我创建一个视频节点'].map((s) => (
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  data-testid="side-link"
                  className="side-link"
                  key={s}
                  onClick={() => {
                    setText(s);
                    input.current?.focus();
                  }}
                >
                  {s}
                </Button>
              ))
            )}
          </AssistantEmpty>
        }
        composer={
          <div className="canvas-agent-dock">
            <CanvasAttachments
              entries={attachments.entries}
              preparing={attachments.preparing}
              remove={attachments.remove}
              focus={focus}
            />
            <ChatComposer
              compact
              placeholder="对这个线程说…（只改这个画布）"
              context={
                <div data-testid="canvas-context-scope" className="canvas-context-scope">
                  {selectedIds.length > 0 ? (
                    <Toggle
                      size="sm"
                      pressed={includeSelected}
                      onPressedChange={setIncludeSelected}
                    >
                      {includeSelected ? '已选' : '引用'} {selectedIds.length} 个节点
                    </Toggle>
                  ) : (
                    <span>未选节点</span>
                  )}
                  <span>{project.name}</span>
                </div>
              }
              onAttach={() => void attachments.add()}
              preparing={attachments.preparing || attachments.blocked}
              hasAttachments={attachments.images.length > 0}
              agent={space}
              text={text}
              setText={setText}
              input={input}
              model={
                session
                  ? (session.modelId ?? '')
                  : draftModel || space.configuration.defaultModelId || ''
              }
              onModel={(value) => {
                if (session) void space.model(value);
                else setDraftModel(value);
              }}
              onSubmit={submit}
            />
          </div>
        }
      />
    </div>
  );
}
