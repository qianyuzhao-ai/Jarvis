import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, FolderPlus } from 'lucide-react';
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
    <section className="skills-manager" aria-labelledby="skills-title">
      <header>
        <h2 id="skills-title">
          <BookOpen size={18} />
          技能
        </h2>
      </header>
      <p>输入 / 主动选择技能，或由 Agent 根据技能的适用规则自动加载。</p>
      {active &&
        actionTarget &&
        createPortal(
          <button
            type="button"
            className="plugins-add"
            title="选择包含 SKILL.md 的文件夹"
            disabled={pending || busy}
            onClick={() => void change('import')}
          >
            <FolderPlus size={16} />
            添加 skill
          </button>,
          actionTarget,
        )}
      {busy && <p role="status">当前对话正在回复，完成或停止后可调整技能。</p>}
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="skills-list">
        {skills.length ? (
          skills.map((skill) => (
            <article key={skill.id}>
              <div>
                <strong>{skill.name}</strong>
                <small>{skill.manualOnly ? '仅手动调用' : '可自动调用'}</small>
                <p>{skill.description}</p>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={enabled[skill.id] ?? skill.enabled}
                  disabled={pending || busy}
                  onChange={() => void change(skill)}
                />
                启用<span className="sr-only"> {skill.name}</span>
              </label>
            </article>
          ))
        ) : (
          <p className="skills-empty">还没有技能。导入后即可在 / 菜单中选择。</p>
        )}
      </div>
      <footer>
        技能由 Jarvis 独立保存。支持说明与包内文本参考；不执行脚本。每包最多 100 个文件、2MB，单文件
        256KB。
      </footer>
    </section>
  );
}
