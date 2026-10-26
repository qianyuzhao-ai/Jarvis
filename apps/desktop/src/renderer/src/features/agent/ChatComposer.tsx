import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { ArrowUp, Plus, Square, Sparkles } from '@jarvis/ui/icons';
import { Composer } from '@jarvis/ui/components/Composer';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import type { useAgent } from './use-agent';
import { ContextUsage } from './ContextUsage';
import { ModelPicker, ThinkingPicker } from './ModelPicker';
import { thinkingFor } from '../../../../shared/models';
import { SkillPicker } from './SkillPicker';
import type { SkillInfo } from '../../../../shared/agent-skills';

export function ChatComposer({
  agent,
  text,
  setText,
  input,
  model,
  onModel,
  onSubmit,
  onAttach,
  preparing = false,
  hasAttachments = false,
  context,
  compact = false,
  placeholder = '输入 / 选择技能，或与 Jarvis 对话',
}: {
  agent: ReturnType<typeof useAgent>;
  text: string;
  setText: (value: string) => void;
  input: RefObject<HTMLTextAreaElement | null>;
  model: string;
  onModel: (value: string) => void;
  onSubmit: () => Promise<void>;
  onAttach?: () => void;
  preparing?: boolean;
  hasAttachments?: boolean;
  context?: ReactNode;
  compact?: boolean;
  placeholder?: string;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const listId = useId();
  const query = /^\/([^\s]*)$/
    .exec(text)?.[1]
    ?.replace(/^skill:/, '')
    .toLowerCase();
  const options = (agent.snapshot.skills ?? []).filter(
    (s) =>
      s.enabled &&
      (query === '' ||
        s.name.includes(query ?? '') ||
        s.description.toLowerCase().includes(query ?? '')),
  );
  const menuOpen = query !== undefined && dismissed !== text;
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  function choose(skill: SkillInfo) {
    setText(`/skill:${skill.name} `);
    setActive(0);
    input.current?.focus();
  }
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !form.current?.contains(e.target)) setDismissed(text);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menuOpen, text]);
  const busy = !!agent.session?.runId;
  // Skill commands need a round of their own, so they queue even in steer mode.
  const steers = agent.snapshot.replyMode !== 'queue' && !text.trimStart().startsWith('/');
  const configured = agent.configured;
  const selectedModel = agent.configuration.models.find((entry) => entry.id === model);
  const withImages = hasAttachments;
  // Model and thinking stay fixed while this conversation replies; typing a queued message is fine.
  const locked = !configured || busy || agent.sending;
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    function resize() {
      if (!node) return;
      node.style.height = '24px';
      const limit = Math.max(24, Math.min(16 * 24, innerHeight * 0.45 - 28));
      node.style.height = `${Math.min(limit, Math.max(24, node.scrollHeight))}px`;
    }
    resize();
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        resize();
      }
    });
    observer.observe(node);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [text, input]);
  return (
    <Composer layout={compact ? 'compact' : 'wide'} context={context}>
      <form
        ref={form}
        data-testid="agent-composer"
        className="agent-composer"
        aria-label="Agent 输入框"
        onSubmit={(e) => {
          e.preventDefault();
          if (!menuOpen) void onSubmit();
        }}
      >
        {menuOpen && (
          <SkillPicker
            skills={options}
            active={activeIndex}
            listId={listId}
            onSelect={choose}
            onActive={setActive}
          />
        )}
        <div className="composer-input-surface">
          <textarea
            ref={input}
            rows={1}
            aria-label="消息"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? listId : undefined}
            aria-activedescendant={
              menuOpen && options.length ? `${listId}-${activeIndex}` : undefined
            }
            value={text}
            maxLength={32000}
            placeholder={configured ? placeholder : '添加模型后开始对话'}
            disabled={agent.loading || !configured}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
              setDismissed(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              if (menuOpen) {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setDismissed(text);
                  return;
                }
                if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                  e.preventDefault();
                  setActive(
                    (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + options.length) %
                      Math.max(1, options.length),
                  );
                  return;
                }
                if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Tab' && options.length)) {
                  e.preventDefault();
                  const option = options[activeIndex];
                  if (option) choose(option);
                  return;
                }
              }
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                e.preventDefault();
                void onSubmit();
              }
            }}
          />
        </div>
        <div className="composer-controls">
          <IconButton
            variant="ghost"
            size="icon"
            className="composer-action"
            aria-label={onAttach ? '添加选中画布资产' : '添加附件（暂不支持）'}
            disabled={!onAttach || preparing}
            onClick={onAttach}
          >
            <Plus size={20} />
          </IconButton>
          <Button
            className="composer-skills"
            variant="ghost"
            size="sm"
            aria-label="选择技能"
            onClick={() => {
              setText('/');
              setDismissed(null);
              input.current?.focus();
            }}
          >
            <Sparkles /> 技能
          </Button>
          <div className="composer-spacer" />
          <ModelPicker
            settings={agent.configuration}
            selectedId={model || undefined}
            disabled={locked}
            withImages={withImages}
            onChange={onModel}
          />
          <ThinkingPicker
            model={selectedModel}
            value={thinkingFor(
              selectedModel,
              // Threads without a level of their own start off; a project conversation follows
              // the level last used with its model, as its rounds do.
              agent.session
                ? (agent.session.thinkingLevel ??
                    (agent.session.kind === 'thread' ? 'off' : undefined))
                : agent.draftThinking,
            )}
            disabled={locked}
            onChange={(level) => void agent.thinking(level)}
          />
          <ContextUsage
            used={agent.session?.contextTokens}
            capacity={agent.session ? agent.session.contextWindow : selectedModel?.contextWindow}
          />
          {busy && !text.trim() && !hasAttachments ? (
            <IconButton
              className="composer-submit"
              variant="secondary"
              type="button"
              aria-label="停止回复"
              onClick={() => void agent.cancel()}
            >
              <Square size={14} />
            </IconButton>
          ) : (
            <IconButton
              className="composer-submit"
              type="submit"
              aria-label={busy ? (steers ? '引导回复' : '排队发送') : '发送消息'}
              title={
                busy
                  ? steers
                    ? '在当前步骤结束后交给正在进行的回复'
                    : '当前回复结束后发送'
                  : '发送消息'
              }
              disabled={
                menuOpen ||
                (!text.trim() && !hasAttachments) ||
                preparing ||
                !configured ||
                agent.loading ||
                agent.sending
              }
            >
              <ArrowUp size={18} />
            </IconButton>
          )}
        </div>
      </form>
    </Composer>
  );
}
