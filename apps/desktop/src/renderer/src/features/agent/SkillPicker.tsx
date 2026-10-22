import { BookOpen } from 'lucide-react';
import type { SkillInfo } from '../../../../shared/agent-skills';

export function SkillPicker({
  skills,
  active,
  listId,
  onSelect,
}: {
  skills: SkillInfo[];
  active: number;
  listId: string;
  onSelect: (skill: SkillInfo) => void;
}) {
  return (
    <div className="skill-picker">
      <div className="skill-picker-heading">技能</div>
      <div role="listbox" id={listId} aria-label="选择技能" className="skill-picker-list">
        {skills.length ? (
          skills.map((skill, index) => (
            <button
              key={skill.id}
              type="button"
              role="option"
              id={`${listId}-${index}`}
              aria-selected={active === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(skill)}
            >
              <BookOpen size={16} />
              <span>
                <strong>/{skill.name}</strong>
                <small title={skill.description}>{skill.description}</small>
              </span>
              {skill.manualOnly && <em>手动</em>}
            </button>
          ))
        ) : (
          <p>没有匹配的已启用技能</p>
        )}
      </div>
    </div>
  );
}
