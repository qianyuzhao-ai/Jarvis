import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import {
  THINKING_LABELS,
  type ModelSettingsView,
  type ModelView,
  type ThinkingLevel,
} from '../../../../shared/models';

/** Why a model cannot be picked while the conversation carries images, or undefined when it can. */
function visionBlock(model: ModelView, withImages: boolean) {
  if (!withImages || model.vision === 'supported') return undefined;
  return model.vision === 'unsupported' ? '仅文字' : '未确认 · 先检测';
}

export function ModelPicker({
  settings,
  selectedId,
  disabled,
  withImages = false,
  onChange,
}: {
  settings: ModelSettingsView;
  selectedId?: string;
  disabled: boolean;
  withImages?: boolean;
  onChange: (value: string) => void;
}) {
  const selected = settings.models.find((entry) => entry.id === selectedId);
  const provider = settings.providers.find((p) => p.id === selected?.providerId);
  return (
    <div className="composer-model">
      <NativeSelect
        appearance="compact"
        size="sm"
        data-testid="model-trigger"
        className="composer-select"
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
              {models.map((m) => {
                const blocked = visionBlock(m, withImages);
                return (
                  <option key={m.id} value={m.id} disabled={!m.available || !!blocked}>
                    {!m.available
                      ? `${m.name}（已下线）`
                      : blocked
                        ? `${m.name} · ${blocked}`
                        : m.name}
                  </option>
                );
              })}
            </optgroup>
          ) : null;
        })}
      </NativeSelect>
    </div>
  );
}

export function ThinkingPicker({
  model,
  value,
  disabled,
  onChange,
}: {
  model?: ModelView;
  value: ThinkingLevel;
  disabled: boolean;
  onChange: (value: ThinkingLevel) => void;
}) {
  // Hidden when Jarvis sends no thinking parameters for this model or only "off" is available.
  if (!model || model.thinkingLevels.length < 2) return null;
  return (
    <div className="composer-model">
      <NativeSelect
        appearance="compact"
        size="sm"
        data-testid="thinking-trigger"
        className="composer-select composer-thinking"
        aria-label="思考程度"
        value={value}
        disabled={disabled}
        title="思考程度：档位越高回复越慢，消耗的输出额度越多"
        onChange={(event) => onChange(event.target.value as ThinkingLevel)}
      >
        {model.thinkingLevels.map((level) => (
          <option key={level} value={level}>
            思考：{THINKING_LABELS[level]}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
