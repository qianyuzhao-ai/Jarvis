import type { ThemePreference } from './theme';
import { Monitor, Sun, Moon } from 'lucide-react';
import { DownloadSettings } from './DownloadSettings';
const choices = [
  ['system', '跟随系统', Monitor],
  ['light', 'Light Mode', Sun],
  ['dark', 'Dark Mode', Moon],
] as const;
export function GeneralSettings({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  return (
    <section className="general-settings" aria-labelledby="general-heading">
      <div>
        <h1 id="general-heading">通用设置</h1>
        <p>管理工作台的基本偏好。</p>
      </div>
      <div className="theme-setting">
        <h2 id="theme-heading">主题</h2>
        <div className="theme-choices" role="group" aria-labelledby="theme-heading">
          {choices.map(([theme, label, Icon]) => (
            <button
              type="button"
              key={theme}
              aria-pressed={value === theme}
              aria-label={label}
              title={label}
              onClick={() => onChange(theme)}
            >
              <Icon size={16} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </div>
      <DownloadSettings />
    </section>
  );
}
