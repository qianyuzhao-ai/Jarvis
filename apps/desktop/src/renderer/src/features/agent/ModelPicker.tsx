import type { ModelSettingsView } from '../../../../shared/models';

export function ModelPicker({
  settings,
  selectedId,
  disabled,
  onChange,
}: {
  settings: ModelSettingsView;
  selectedId?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const selected = settings.models.find((entry) => entry.id === selectedId);
  const provider = settings.providers.find((p) => p.id === selected?.providerId);
  return (
    <div className="composer-model">
      <select
        data-testid="model-trigger"
        className="model-trigger"
        aria-label="聊天模型"
        value={selected?.id ?? ''}
        disabled={disabled || !settings.models.length}
        title={selected ? `${provider?.name ?? ''} · ${selected.modelId}` : '先添加模型'}
        onChange={(event) => onChange(event.target.value)}
      >
        {!selected && (
          <option value="" disabled>
            {settings.models.length ? '选择模型' : '先添加模型'}
          </option>
        )}
        {settings.providers.map((p) => {
          const models = settings.models.filter((m) => m.providerId === p.id);
          return models.length ? (
            <optgroup key={p.id} label={p.name}>
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  {m.available ? m.name : `${m.name}（已下线）`}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
    </div>
  );
}
