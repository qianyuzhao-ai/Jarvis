import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { BookOpen, CornerDownLeft, Plus, Square } from 'lucide-react';
import type { useAgent } from './use-agent';
import { ContextUsage } from './ContextUsage';
import { ModelPicker } from './ModelPicker';
import { SkillPicker } from './SkillPicker';
import { SkillsDialog } from './SkillsDialog';
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
}) {
  const [manageSkills, setManageSkills] = useState(false);
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
  const menuOpen = query !== undefined && dismissed !== text && !manageSkills;
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
  const configured = !!agent.configuration.config;
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
    <form
      ref={form}
      className="agent-composer"
      aria-label="Agent 输入框"
      onSubmit={(e) => {
        e.preventDefault();
        if (!manageSkills && !menuOpen) void onSubmit();
      }}
    >
      {menuOpen && (
        <SkillPicker
          skills={options}
          active={activeIndex}
          listId={listId}
          onSelect={choose}
          onManage={() => setManageSkills(true)}
        />
      )}
      {manageSkills && (
        <SkillsDialog
          skills={agent.snapshot.skills ?? []}
          busy={!!agent.snapshot.busySessionId}
          onClose={() => {
            setManageSkills(false);
            setDismissed(text);
            input.current?.focus();
          }}
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
          placeholder={configured ? '输入 / 选择技能，或与 Jarvis 对话' : '连接中转站后开始对话'}
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
        {busy ? (
          <button
            className="composer-send"
            type="button"
            aria-label="停止回复"
            title="停止回复"
            onClick={() => void agent.cancel()}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            className="composer-send"
            type="submit"
            aria-label="发送消息"
            title={agent.snapshot.busySessionId ? '另一个对话正在回复' : '发送消息'}
            disabled={
              menuOpen ||
              (!text.trim() && !hasAttachments) ||
              preparing ||
              !configured ||
              agent.loading ||
              agent.sending ||
              !!agent.snapshot.busySessionId
            }
          >
            <CornerDownLeft size={18} />
          </button>
        )}
      </div>
      <div className="composer-controls">
        <button
          type="button"
          className="composer-action"
          aria-label={onAttach ? '添加选中画布资产' : '添加附件（暂不支持）'}
          aria-disabled={!onAttach || preparing}
          onClick={onAttach}
          title={onAttach ? '添加画布选中的图片与视频' : '暂不支持附件'}
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          className="composer-action composer-auto"
          aria-disabled="true"
          title={
            agent.projectId
              ? '允许编辑当前画布，可撤销修改'
              : '可加载已启用技能，不执行文件或 Shell 操作'
          }
        >
          {agent.projectId ? '画布编辑' : 'Auto'}
        </button>
        <button
          type="button"
          className="composer-action"
          aria-label="管理技能"
          title="管理技能"
          onClick={() => setManageSkills(true)}
        >
          <BookOpen size={16} />
        </button>
        <div className="composer-spacer" />
        <ModelPicker
          model={model}
          disabled={!configured || busy || agent.sending || !!agent.snapshot.busySessionId}
          onChange={onModel}
        />
        <ContextUsage
          used={agent.session?.contextTokens}
          capacity={agent.session?.contextWindow ?? agent.configuration.config?.contextWindow}
        />
      </div>
    </form>
  );
}
