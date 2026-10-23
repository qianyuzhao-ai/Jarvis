import type { ConfiguredModel } from '../../../../shared/agent';

export function ModelPicker({
  model,
  selectedId,
  models,
  disabled,
  onChange,
}: {
  model: string;
  selectedId?: string;
  models: ConfiguredModel[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const selected = models.find((entry) => entry.id === selectedId);
  return (
    <div className="composer-model">
      <select
        data-testid="model-trigger"
        className="model-trigger"
        aria-label="聊天模型"
        value={selected?.id ?? ''}
        disabled={disabled || !models.length}
        title={
          selected ? `${selected.config.name} · ${selected.config.model}` : model || '先添加模型'
        }
        onChange={(event) => onChange(event.target.value)}
      >
        {!selected && (
          <option value="" disabled>
            {model || '先添加模型'}
          </option>
        )}
        {models.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.config.name} · {entry.config.model} ·{' '}
            {entry.config.provider === 'deepseek' ? 'DeepSeek 官方' : '中转站'}
          </option>
        ))}
      </select>
    </div>
  );
}
