import { useConfirm } from '@jarvis/ui/components/AlertDialog';
import { Button } from '@jarvis/ui/components/Button';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { agentValue } from '../../../../shared/agent';
import type { CatalogProvider, ModelSettingsView, ModelView } from '../../../../shared/models';
import { AddProviderDialog, type ProviderDialogMode } from './models/AddProviderDialog';
import { ModelCapabilitiesDialog } from './models/ModelCapabilitiesDialog';
import { ProviderCard } from './models/ProviderCard';

export function ModelSettings({ value, busy }: { value: ModelSettingsView; busy: boolean }) {
  const confirm = useConfirm();
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [dialog, setDialog] = useState<ProviderDialogMode | null>(null);
  const [capabilities, setCapabilities] = useState<ModelView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    void window.desktop?.models
      .getCatalog()
      .then((result) => active && setCatalog(agentValue(result)))
      .catch(
        (e: unknown) => active && setError(e instanceof Error ? e.message : '读取服务商目录失败'),
      );
    return () => {
      active = false;
    };
  }, []);
  async function act(action: () => Promise<unknown>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '模型操作失败');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  const models = window.desktop?.models;
  const disabled = pending || busy;
  return (
    <section
      className="v1-settings mx-auto w-full max-w-175 min-w-0 px-10 pt-6 pb-10 font-sans text-body text-fg"
      aria-labelledby="models-title"
    >
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 id="models-title" className="text-title-1">
            模型
          </h1>
          <p className="mt-1.5 text-body-relaxed text-fg-secondary">
            Jarvis Agent 的首页、画布和写作入口共用这里的服务商与模型。AIGC
            空间的生成服务在“内网地址”中配置。
          </p>
        </div>
        <Button variant="secondary" disabled={disabled} onClick={() => setDialog({ kind: 'new' })}>
          <Plus />
          添加服务商
        </Button>
      </header>
      {busy && (
        <p className="mb-4 text-callout text-fg-secondary">
          有请求正在进行，完成或停止后才能修改模型设置。
        </p>
      )}
      {error && (
        <p className="mb-4 text-subheadline text-danger" role="alert">
          {error}
        </p>
      )}
      {value.providers.length ? (
        <>
          <div className="mb-6 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <label htmlFor="default-model" className="text-headline">
                默认模型
              </label>
              <p className="text-callout text-fg-secondary">
                新对话默认使用；已有对话保留各自的选择。
              </p>
            </div>
            <div className="w-70 shrink-0">
              <NativeSelect
                id="default-model"
                value={value.defaultModelId ?? ''}
                disabled={disabled || !value.models.length}
                onChange={(e) =>
                  void act(async () => agentValue(await models!.setDefaultModel(e.target.value)))
                }
              >
                {!value.defaultModelId && <option value="">尚未添加模型</option>}
                {value.providers.map((p) => {
                  const list = value.models.filter((m) => m.providerId === p.id);
                  return list.length ? (
                    <optgroup key={p.id} label={p.name}>
                      {list.map((m) => (
                        <option key={m.id} value={m.id} disabled={!m.available}>
                          {p.name} · {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-3">
            {value.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                models={value.models.filter((m) => m.providerId === provider.id)}
                defaultModelId={value.defaultModelId}
                catalogBaseUrl={catalog.find((c) => c.id === provider.sdkProvider)?.baseUrl}
                disabled={disabled}
                onEdit={() => setDialog({ kind: 'edit', provider })}
                onManageModels={() => setDialog({ kind: 'models', provider })}
                onRemove={() =>
                  void act(async () => {
                    if (
                      await confirm({
                        title: `删除服务商“${provider.name}”？`,
                        message:
                          '会同时移除它的全部模型；聊天记录会保留，用到这些模型的对话需要重新选择模型。',
                        tone: 'destructive',
                        confirmLabel: '删除',
                      })
                    )
                      agentValue(await models!.removeProvider(provider.id));
                  })
                }
                onSetDefault={(id) =>
                  void act(async () => agentValue(await models!.setDefaultModel(id)))
                }
                onCapabilities={setCapabilities}
                onRemoveModel={(model) =>
                  void act(async () => {
                    if (
                      await confirm({
                        title: `移除模型“${model.name}”？`,
                        message: '聊天记录会保留；用到这个模型的对话需要重新选择模型。',
                        tone: 'destructive',
                        confirmLabel: '移除',
                      })
                    )
                      agentValue(await models!.removeModel(model.id));
                  })
                }
              />
            ))}
          </div>
        </>
      ) : (
        <div className="grid justify-items-start gap-3 rounded-panel border border-separator p-6">
          <p className="text-body-relaxed text-fg-secondary">
            还没有服务商。添加 DeepSeek、OpenAI
            等服务商或自定义中转站后，勾选的模型就能在聊天中选择。
          </p>
          <Button disabled={disabled} onClick={() => setDialog({ kind: 'new' })}>
            <Plus />
            添加服务商
          </Button>
        </div>
      )}
      {dialog && (
        <AddProviderDialog
          mode={dialog}
          settings={value}
          catalog={catalog}
          onClose={() => setDialog(null)}
        />
      )}
      {capabilities && (
        <ModelCapabilitiesDialog
          model={value.models.find((m) => m.id === capabilities.id) ?? capabilities}
          provider={value.providers.find((p) => p.id === capabilities.providerId)!}
          onClose={() => setCapabilities(null)}
        />
      )}
    </section>
  );
}
