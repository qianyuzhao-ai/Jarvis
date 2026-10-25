import type { ThemePreference } from './theme';
import { ToggleGroup, ToggleGroupItem } from '@jarvis/ui/components/ToggleGroup';
import { DownloadSettings } from './DownloadSettings';
import { AgentConcurrencySettings } from './AgentConcurrencySettings';
const choices = [
  ['system', '跟随系统', '跟随系统'],
  ['light', 'Light Mode', 'Light'],
  ['dark', 'Dark Mode', 'Dark'],
] as const;
export function GeneralSettings({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  return (
    <section
      className="v1-settings mx-auto flex w-full max-w-175 min-w-0 flex-col gap-8 px-10 pt-6 pb-10 font-sans text-body text-fg"
      aria-labelledby="general-heading"
    >
      <div>
        <h1 id="general-heading" className="text-title-1">
          通用设置
        </h1>
        <p className="mt-2 text-body-relaxed text-fg-secondary">管理工作台的基本偏好。</p>
      </div>
      <div className="flex min-h-13 items-center justify-between gap-4 border-b border-separator pb-3">
        <h2 id="theme-heading" className="text-body">
          主题
        </h2>
        <ToggleGroup
          variant="segmented"
          aria-labelledby="theme-heading"
          value={value}
          onValueChange={(next) => {
            if (next === 'system' || next === 'light' || next === 'dark') onChange(next);
          }}
        >
          {choices.map(([theme, label, text]) => (
            <ToggleGroupItem key={theme} value={theme} aria-label={label}>
              {text}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <AgentConcurrencySettings />
      <DownloadSettings />
    </section>
  );
}
