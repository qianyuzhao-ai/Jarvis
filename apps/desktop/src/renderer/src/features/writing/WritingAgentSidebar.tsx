import { useEffect, useRef, useState } from 'react';
import { AssistantEmpty } from '@jarvis/ui/components/AssistantPanel';
import { Button } from '@jarvis/ui/components/Button';
import { FileText, Sparkles } from '@jarvis/ui/icons';
import { osValue } from '../../../../shared/agent-os';
import { ChatComposer } from '../agent/ChatComposer';
import { SpaceThreadPanel } from '../agent/SpaceThreadPanel';
import { osBridge } from '../agent/use-agent';
import type { useSpaceThread } from '../agent/use-space-thread';
import { takeWritingAssistantRequest } from './assistant-request';
import type { DocumentSession } from './useWriting';
import type { useWritingHost } from './use-writing-host';

/**
 * The writing sidebar: the thread bound to this document. Edits go into the open editor and stay
 * unsaved, with one undo per round. Block menus and the / panel send their requests here.
 */
export function WritingAgentSidebar({
  document,
  space,
  host,
  selectedParagraphs,
  configure,
  close,
  after,
}: {
  document: DocumentSession;
  /** The document's thread; the writing space shares it with the graph's resonance search. */
  space: ReturnType<typeof useSpaceThread>;
  host: ReturnType<typeof useWritingHost>;
  selectedParagraphs: number;
  configure: () => void;
  close: () => void;
  after?: React.ReactNode;
}) {
  const scope = { rootId: document.rootId, path: document.path };
  const [text, setText] = useState('');
  const [model, setModel] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const pending = useRef(false);
  const name = document.path.split('/').at(-1) ?? document.path;
  async function submit(prompt = text) {
    if (pending.current || !prompt.trim()) return;
    pending.current = true;
    try {
      // The editor must answer before the thread starts reading it.
      await host.snapshot(scope);
      if (await space.send(prompt.trim(), model || undefined)) setText('');
      else setText(prompt);
    } catch (e) {
      setText(prompt);
      space.setError(e instanceof Error ? e.message : '读取文档失败');
    } finally {
      pending.current = false;
    }
  }
  // Requests from block menus and the / panel arrive while the panel is open or as it opens.
  useEffect(() => {
    const consume = () => {
      if (space.loading || pending.current) return;
      const prompt = takeWritingAssistantRequest(document.id);
      if (prompt) void submit(prompt);
    };
    consume();
    window.addEventListener('jarvis:writing-assistant-request', consume);
    return () => window.removeEventListener('jarvis:writing-assistant-request', consume);
  });
  return (
    <SpaceThreadPanel
      aria-label="写作助手"
      className="writing-agent-panel"
      space={space}
      label="写作助手"
      closeLabel="关闭写作助手"
      onClose={close}
      writing={{
        undo: (id) => void space.act(async () => osValue(await osBridge().undo(id)), '撤销失败'),
        canUndo: (id) => !space.busy && host.canUndo(scope, id),
      }}
      after={after}
      empty={
        <AssistantEmpty
          title="写作助手"
          icon={<Sparkles size={24} />}
          suggestions={
            space.configured ? (
              ['把选中段落改得更口语', '为全文写一段摘要', '续写下一段'].map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setText(s);
                    input.current?.focus();
                  }}
                >
                  {s}
                </Button>
              ))
            ) : (
              <Button variant="secondary" size="sm" onClick={configure}>
                前往模型设置
              </Button>
            )
          }
        >
          对这篇文档说要做什么，会开一个线程来做：改写、续写、总结；修改进编辑器，尚未保存，每次都可以撤销。
        </AssistantEmpty>
      }
      historyNote={
        <div className="space-thread-note">
          <strong>文档没打开时</strong>
          <span>
            协调对话开的线程也能改这篇文档：每次修改前核对版本，直接保存到文件，并留可撤销记录。文档打开时改动进编辑器，保持未保存。
          </span>
        </div>
      }
      composer={
        <ChatComposer
          compact
          placeholder="对这个线程说…（只改这篇文档）"
          context={
            <span data-testid="writing-agent-context">
              <FileText size={14} />
              {name} · {selectedParagraphs ? `已选 ${selectedParagraphs} 段` : '全文'}
            </span>
          }
          agent={space}
          text={text}
          setText={setText}
          input={input}
          model={
            space.session
              ? (space.session.modelId ?? '')
              : model || space.configuration.defaultModelId || ''
          }
          onModel={(value) => {
            if (space.session) void space.model(value);
            else setModel(value);
          }}
          onSubmit={() => submit()}
        />
      }
    />
  );
}
