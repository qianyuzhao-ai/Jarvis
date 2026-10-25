import {
  CandidateList,
  CandidateListItem,
  CandidateListLabel,
  CandidateListEmpty,
} from '@jarvis/ui/components/CandidateList';
import { BookOpen } from '@jarvis/ui/icons';
import type { SkillInfo } from '../../../../shared/agent-skills';

export function SkillPicker({
  skills,
  active,
  listId,
  onSelect,
  onActive,
}: {
  skills: SkillInfo[];
  active: number;
  listId: string;
  onSelect: (skill: SkillInfo) => void;
  onActive: (index: number) => void;
}) {
  return (
    <CandidateList
      data-testid="skill-picker"
      className="skill-picker"
      id={listId}
      aria-label="选择技能"
    >
      <CandidateListLabel>技能</CandidateListLabel>
      <div className="skill-picker-list">
        {skills.length ? (
          skills.map((skill, index) => (
            <CandidateListItem
              key={skill.id}
              id={`${listId}-${index}`}
              active={active === index}
              onActive={() => onActive(index)}
              onClick={() => onSelect(skill)}
              media={<BookOpen />}
              description={skill.description}
              meta={skill.manualOnly ? '手动' : undefined}
            >
              /{skill.name}
            </CandidateListItem>
          ))
        ) : (
          <CandidateListEmpty>没有匹配的已启用技能</CandidateListEmpty>
        )}
      </div>
    </CandidateList>
  );
}
