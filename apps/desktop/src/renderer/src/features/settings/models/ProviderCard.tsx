import { Badge, StatusDot } from '@jarvis/ui/components/Badge';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jarvis/ui/components/DropdownMenu';
import { Separator } from '@jarvis/ui/components/Separator';
import { Ellipsis, Plus } from 'lucide-react';
import type { ModelView, ProviderView } from '../../../../../shared/models';
import { capabilityTitle, providerMeta, tokens, visionBadge } from './model-format';

export function ProviderCard({
  provider,
  models,
  defaultModelId,
  catalogBaseUrl,
  disabled,
  onEdit,
  onManageModels,
  onRemove,
  onSetDefault,
  onCapabilities,
  onRemoveModel,
}: {
  provider: ProviderView;
  models: ModelView[];
  defaultModelId: string | null;
  catalogBaseUrl?: string;
  disabled: boolean;
  onEdit: () => void;
  onManageModels: () => void;
  onRemove: () => void;
  onSetDefault: (id: string) => void;
  onCapabilities: (model: ModelView) => void;
  onRemoveModel: (model: ModelView) => void;
}) {
  const meta = providerMeta(provider, catalogBaseUrl);
  return (
    <article
      data-testid="provider-card"
      aria-label={`服务商：${provider.name}`}
      className="overflow-hidden rounded-panel border border-separator"
    >
      <header className="flex items-center gap-2 bg-surface py-2.5 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <strong className="truncate text-headline">{provider.name}</strong>
            <Badge>{provider.kind === 'builtin' ? '内置' : '自定义'}</Badge>
          </div>
          {meta && <p className="truncate text-callout text-fg-tertiary">{meta}</p>}
        </div>
        {provider.keyError && (
          <span className="flex items-center gap-1.5 text-callout text-fg-secondary">
            <StatusDot tone="danger" />
            需要重新填写 Key
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <IconButton variant="ghost" size="icon-sm" aria-label={`服务商菜单：${provider.name}`}>
              <Ellipsis />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>编辑连接</DropdownMenuItem>
            <DropdownMenuItem onSelect={onManageModels}>管理模型</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onRemove}>
              删除服务商
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {models.map((model) => {
        const vision = visionBadge(model.vision);
        return (
          <div key={model.id}>
            <Separator />
            <div
              data-testid="configured-model"
              className="flex items-center gap-3 py-2 pr-2 pl-4"
              title={capabilityTitle(model)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body">{model.name}</p>
                <p className="truncate text-callout text-fg-tertiary">{model.modelId}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {model.id === defaultModelId && (
                  <Badge tone="accent" appearance="solid">
                    默认
                  </Badge>
                )}
                {!model.available && <Badge tone="danger">已下线</Badge>}
                <Badge tone={vision.tone}>{vision.label}</Badge>
                {model.thinkingLevels.length > 1 && <Badge>可思考</Badge>}
                {model.contextWindow && <Badge>{tokens(model.contextWindow)} 上下文</Badge>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <IconButton variant="ghost" size="icon-sm" aria-label={`模型菜单：${model.name}`}>
                    <Ellipsis />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={model.id === defaultModelId || !model.available}
                    onSelect={() => onSetDefault(model.id)}
                  >
                    设为默认
                  </DropdownMenuItem>
                  {provider.kind === 'custom' && (
                    <DropdownMenuItem onSelect={() => onCapabilities(model)}>
                      模型能力…
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => onRemoveModel(model)}>
                    移除模型
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
      <Separator />
      <div className="px-2 py-1.5">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onManageModels}>
          <Plus />
          添加模型
        </Button>
      </div>
    </article>
  );
}
