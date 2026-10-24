import { Button } from '@jarvis/ui/components/Button';
import { Checkbox } from '@jarvis/ui/components/Checkbox';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, FolderPlus } from '@jarvis/ui/icons';
import type { SkillInfo } from '../../../../shared/agent-skills';
import { agentValue } from '../../../../shared/agent';

export function SkillsSettings({
  skills,
  busy,
  actionTarget,
  active,
}: {
  skills: SkillInfo[];
  busy: boolean;
  actionTarget: HTMLElement | null;
  active: boolean;
}) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  async function change(action: 'import' | SkillInfo) {
    if (locked.current || busy) return;
    const bridge = window.desktop?.agent;
    if (!bridge) {
      setError('技能桥接不可用');
      return;
    }
    locked.current = true;
    setPending(true);
    setError('');
    setNotice('');
    if (action !== 'import') setEnabled((v) => ({ ...v, [action.id]: !action.enabled }));
    try {
      const result = agentValue(
        await (action === 'import'
          ? bridge.importSkill()
          : bridge.setSkillEnabled({ id: action.id, enabled: !action.enabled })),
      );
      if (result)
        setNotice(
          action === 'import' ? '技能包已导入；同名技能会更新，启停状态保留。' : '技能状态已保存',
        );
    } catch (e) {
      if (action !== 'import') setEnabled((v) => ({ ...v, [action.id]: action.enabled }));
      setError(e instanceof Error ? e.message : '技能操作失败');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <section className="text-body-relaxed" aria-labelledby="skills-title">
      <header>
        <h2 id="skills-title" className="flex items-center gap-2 text-title-3">
          <BookOpen size={18} />
          技能
        </h2>
      </header>
      <p className="my-2 text-callout text-fg-secondary">
        输入 / 主动选择技能，或由 Agent 根据技能的适用规则自动加载。
      </p>
      {active &&
        actionTarget &&
        createPortal(
          <Button
            variant="secondary"
            type="button"
            title="选择包含 SKILL.md 的文件夹"
            disabled={pending || busy}
            onClick={() => void change('import')}
          >
            <FolderPlus size={16} />
            添加 skill
          </Button>,
          actionTarget,
        )}
      {busy && <p role="status">当前对话正在回复，完成或停止后可调整技能。</p>}
      {error && (
        <p className="text-subheadline text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="my-4">
        {skills.length ? (
          skills.map((skill) => (
            <article
              key={skill.id}
              className="flex items-start justify-between gap-4 border-t border-separator py-4"
            >
              <div className="min-w-0 break-words">
                <strong className="text-headline">{skill.name}</strong>
                <small className="mt-1 block text-subheadline text-fg-secondary">
                  {skill.manualOnly ? '仅手动调用' : '可自动调用'}
                </small>
                <p className="mt-2 text-body-relaxed text-fg-secondary">{skill.description}</p>
              </div>
              <Checkbox
                label={
                  <>
                    启用<span className="sr-only"> {skill.name}</span>
                  </>
                }
                checked={enabled[skill.id] ?? skill.enabled}
                disabled={pending || busy}
                onCheckedChange={() => void change(skill)}
              />
            </article>
          ))
        ) : (
          <p className="py-6 text-center text-callout text-fg-secondary">
            还没有技能。导入后即可在 / 菜单中选择。
          </p>
        )}
      </div>
      <footer className="border-t border-separator pt-4 text-callout text-fg-secondary">
        技能由 Jarvis 独立保存。支持说明与包内文本参考；不执行脚本。每包最多 100 个文件、2MB，单文件
        256KB。
      </footer>
    </section>
  );
}
