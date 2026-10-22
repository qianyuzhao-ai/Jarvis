import type { ThemePreference } from './theme';
import { DownloadSettings } from './DownloadSettings';
import { UpdateStatus } from '../updates/UpdateStatus';
import type { AppUpdates } from '../updates/use-app-updates';
const choices = [
  ['system', '跟随系统'],
  ['light', 'Light Mode'],
  ['dark', 'Dark Mode'],
] as const;
export function GeneralSettings({
  value,
  onChange,
  updates,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
  updates: AppUpdates;
}) {
  return (
    <section className="general-settings" aria-labelledby="general-heading">
      <div>
        <h1 id="general-heading">通用设置</h1>
        <p>管理工作台的基本偏好。</p>
      </div>
      <div className="theme-setting">
        <h2 id="theme-heading">主题</h2>
        <p>选择外观，或跟随系统自动切换。</p>
        <div className="theme-choices" role="group" aria-labelledby="theme-heading">
          {choices.map(([theme, label]) => (
            <button
              type="button"
              key={theme}
              aria-pressed={value === theme}
              onClick={() => onChange(theme)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <DownloadSettings />
      <UpdateStatus updates={updates} settings />
    </section>
  );
}
