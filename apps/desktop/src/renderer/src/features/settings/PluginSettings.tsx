import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { SkillInfo } from '../../../../shared/agent-skills';
import { SkillsSettings } from '../agent/SkillsSettings';

const tabs = [
  ['mcp', 'MCP'],
  ['skill', 'Skill'],
] as const;

export function PluginSettings({ skills, busy }: { skills: SkillInfo[]; busy: boolean }) {
  const [tab, setTab] = useState<'mcp' | 'skill'>('skill');
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <section className="settings-page plugins-settings" aria-labelledby="plugins-title">
      <h1 id="plugins-title">插件</h1>
      <div className="plugins-toolbar">
        <div className="plugins-tabs" role="tablist" aria-label="插件类型">
          {tabs.map(([id, label], index) => (
            <button
              key={id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`plugins-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`plugins-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                let next: 0 | 1;
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
                  next = index === 0 ? 1 : 0;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = 1;
                else return;
                event.preventDefault();
                setTab(tabs[next][0]);
                buttons.current[next]?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="plugins-actions" ref={setActionTarget}>
          {tab === 'mcp' && (
            <button type="button" className="plugins-add" disabled title="MCP 暂未接入">
              <Plus size={16} />
              添加mcp
            </button>
          )}
        </div>
      </div>
      <div
        role="tabpanel"
        id="plugins-panel-mcp"
        aria-labelledby="plugins-tab-mcp"
        hidden={tab !== 'mcp'}
        tabIndex={0}
      >
        <section className="plugins-mcp" aria-labelledby="plugins-mcp-title">
          <h2 id="plugins-mcp-title">MCP</h2>
          <span>暂未接入</span>
        </section>
      </div>
      <div
        role="tabpanel"
        id="plugins-panel-skill"
        aria-labelledby="plugins-tab-skill"
        hidden={tab !== 'skill'}
        tabIndex={0}
      >
        <SkillsSettings
          skills={skills}
          busy={busy}
          actionTarget={actionTarget}
          active={tab === 'skill'}
        />
      </div>
    </section>
  );
}
