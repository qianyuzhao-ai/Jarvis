import { Button } from '@jarvis/ui/components/Button';
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
    <section
      data-testid="plugins-settings"
      className="v1-settings mx-auto w-full max-w-175 min-w-0 px-10 pt-6 pb-10 font-sans text-body text-fg"
      aria-labelledby="plugins-title"
    >
      <h1 id="plugins-title" className="text-title-1">
        插件
      </h1>
      <div data-testid="plugins-toolbar" className="my-6 flex items-center justify-between gap-4">
        <div
          className="inline-flex gap-0.5 rounded-control bg-fill p-0.5"
          role="tablist"
          aria-label="插件类型"
        >
          {tabs.map(([id, label], index) => (
            <Button
              variant="ghost"
              key={id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              className="v1-plugin-tab"
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
            </Button>
          ))}
        </div>
        <div
          data-testid="plugins-actions"
          className="flex items-center gap-2"
          ref={setActionTarget}
        >
          {tab === 'mcp' && (
            <Button variant="ghost" type="button" className="" disabled title="MCP 暂未接入">
              <Plus size={16} />
              添加mcp
            </Button>
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
        <section
          data-testid="plugins-mcp"
          className="flex min-h-13 items-center justify-between gap-4 border-b border-separator"
          aria-labelledby="plugins-mcp-title"
        >
          <h2 id="plugins-mcp-title" className="text-title-3">
            MCP
          </h2>
          <span className="text-callout text-fg-secondary">暂未接入</span>
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
