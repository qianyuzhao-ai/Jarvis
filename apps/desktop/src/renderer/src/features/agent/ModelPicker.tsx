import { Button } from '@jarvis/ui/components/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@jarvis/ui/components/DropdownMenu';
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

/**
 * One trigger for the model and its thinking level. The menu lists the current provider's models,
 * then the thinking level (only when Jarvis sends more than "off" for the model), then the other
 * providers' models under 更多模型.
 */
export function ModelPicker({
  settings,
  selectedId,
  thinking,
  disabled,
  withImages = false,
  onChange,
  onThinking,
}: {
  settings: ModelSettingsView;
  selectedId?: string;
  thinking: ThinkingLevel;
  disabled: boolean;
  withImages?: boolean;
  onChange: (value: string) => void;
  onThinking: (value: ThinkingLevel) => void;
}) {
  const selected = settings.models.find((entry) => entry.id === selectedId);
  const groups = settings.providers
    .map((p) => ({ provider: p, models: settings.models.filter((m) => m.providerId === p.id) }))
    .filter((g) => g.models.length);
  const current = groups.find((g) => g.provider.id === selected?.providerId) ?? groups[0];
  const others = groups.filter((g) => g !== current);
  const levels = selected && selected.thinkingLevels.length > 1 ? selected.thinkingLevels : [];
  const item = (m: ModelView) => {
    const blocked = !m.available ? '已下线' : visionBlock(m, withImages);
    return (
      <DropdownMenuRadioItem key={m.id} value={m.id} disabled={!!blocked} indicator="trailing">
        <span className="min-w-0 flex-1 truncate">{m.name}</span>
        {blocked && <DropdownMenuShortcut>{blocked}</DropdownMenuShortcut>}
      </DropdownMenuRadioItem>
    );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="model-trigger"
          className="composer-model-trigger"
          aria-label="聊天模型"
          disabled={disabled || !settings.models.length}
          title={
            selected
              ? `${current?.provider.name ?? ''} · ${selected.modelId}`
              : settings.models.length
                ? '选择模型'
                : '先添加模型'
          }
        >
          <span className="min-w-0 truncate">
            {selected?.name ?? (settings.models.length ? '选择模型' : '先添加模型')}
          </span>
          {levels.length > 0 && (
            <span className="shrink-0 text-fg-secondary" data-testid="thinking-value">
              {THINKING_LABELS[thinking]}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="composer-model-menu">
        {current && (
          <>
            {others.length > 0 && <DropdownMenuLabel>{current.provider.name}</DropdownMenuLabel>}
            <DropdownMenuRadioGroup value={selected?.id ?? ''} onValueChange={onChange}>
              {current.models.map(item)}
            </DropdownMenuRadioGroup>
          </>
        )}
        {levels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                aria-label="思考程度"
                title="档位越高回复越慢，消耗的输出额度越多"
              >
                <span className="flex-1">思考程度</span>
                <span className="text-callout opacity-70">{THINKING_LABELS[thinking]}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="composer-thinking-menu">
                <DropdownMenuRadioGroup
                  value={thinking}
                  onValueChange={(value) => onThinking(value as ThinkingLevel)}
                >
                  {levels.map((level) => (
                    <DropdownMenuRadioItem key={level} value={level} indicator="trailing">
                      {THINKING_LABELS[level]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span className="flex-1">更多模型</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="composer-model-menu">
                <DropdownMenuRadioGroup value={selected?.id ?? ''} onValueChange={onChange}>
                  {others.map((g, index) => (
                    <div key={g.provider.id} role="presentation">
                      {index > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel>{g.provider.name}</DropdownMenuLabel>
                      {g.models.map(item)}
                    </div>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
