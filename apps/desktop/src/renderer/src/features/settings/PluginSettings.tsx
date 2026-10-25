import { Tabs, TabsList, TabsTrigger, TabsContent } from '@jarvis/ui/components/Tabs';
import { useState } from 'react';
import type { McpServerView } from '../../../../shared/agent-mcp';
import { McpSettings } from './McpSettings';
import type { SkillInfo } from '../../../../shared/agent-skills';
import { SkillsSettings } from '../agent/SkillsSettings';

const tabs = [
  ['mcp', 'MCP'],
  ['skill', 'Skill'],
] as const;

export function PluginSettings({
  skills,
  busy,
  mcp = [],
}: {
  skills: SkillInfo[];
  busy: boolean;
  mcp?: McpServerView[];
}) {
  const [tab, setTab] = useState('skill');
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null);
  return (
    <Tabs value={tab} onValueChange={setTab} asChild>
      <section
        data-testid="plugins-settings"
        className="v1-settings mx-auto w-full max-w-175 min-w-0 px-10 pt-6 pb-10 font-sans text-body text-fg"
        aria-labelledby="plugins-title"
      >
        <h1 id="plugins-title" className="text-title-1">
          插件
        </h1>
        <div data-testid="plugins-toolbar" className="my-6 flex items-center justify-between gap-4">
          <TabsList aria-label="插件类型">
            {tabs.map(([id, label]) => (
              <TabsTrigger
                key={id}
                value={id}
                id={`plugins-tab-${id}`}
                aria-controls={`plugins-panel-${id}`}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div
            data-testid="plugins-actions"
            className="flex items-center gap-2"
            ref={setActionTarget}
          ></div>
        </div>
        <TabsContent
          value="mcp"
          forceMount
          id="plugins-panel-mcp"
          aria-labelledby="plugins-tab-mcp"
          hidden={tab !== 'mcp'}
          tabIndex={0}
        >
          <McpSettings servers={mcp} actionTarget={actionTarget} active={tab === 'mcp'} />
        </TabsContent>
        <TabsContent
          value="skill"
          forceMount
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
        </TabsContent>
      </section>
    </Tabs>
  );
}
