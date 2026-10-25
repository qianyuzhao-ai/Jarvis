import { UpdateStatus } from '../updates/UpdateStatus';
import type { AppUpdates } from '../updates/use-app-updates';

export function AboutSettings({ updates }: { updates: AppUpdates }) {
  return (
    <section
      className="v1-settings mx-auto flex w-full max-w-175 min-w-0 flex-col gap-8 px-10 pt-6 pb-10 font-sans text-body text-fg"
      aria-labelledby="about-heading"
    >
      <div>
        <h1 id="about-heading" className="text-title-1">
          关于 Jarvis
        </h1>
        <p className="mt-2 text-body-relaxed text-fg-secondary">
          集对话、创作与写作于一体的桌面工作台。
        </p>
      </div>
      <UpdateStatus updates={updates} settings />
    </section>
  );
}
