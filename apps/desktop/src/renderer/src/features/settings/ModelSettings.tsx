import { Button } from '@jarvis/ui/components/Button';
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { agentValue, type RelayView } from '../../../../shared/agent';
import { RelaySettings } from '../agent/RelaySettings';

export function ModelSettings({
  value,
  onSaved,
  onDirtyChange,
}: {
  value: RelayView;
  onSaved: (value: RelayView) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const selected = value.models?.find((m) => m.id === editing);
  function back() {
    onDirtyChange(false);
    setEditing(null);
  }
  async function change(id: string, remove: boolean) {
    const bridge = window.desktop?.agent;
    if (!bridge || locked.current) return;
    const model = value.models?.find((m) => m.id === id);
    if (!model) return;
    if (remove && !window.confirm(`删除模型“${model.config.name}”？聊天记录会保留。`)) return;
    locked.current = true;
    setPending(true);
    setError('');
    try {
      onSaved(agentValue(await (remove ? bridge.removeModel(id) : bridge.setDefaultModel(id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : '模型操作失败');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  if (editing)
    return (
      <RelaySettings
        key={editing}
        value={
          selected
            ? { config: selected.config, hasKey: selected.hasKey }
            : { config: null, hasKey: false }
        }
        modelId={selected?.id}
        create={editing === 'new'}
        onSaved={(saved) => {
          onSaved(saved);
          back();
        }}
        onDirtyChange={onDirtyChange}
        onBack={back}
      />
    );
  return (
    <section
      className="v1-settings mx-auto w-full max-w-175 min-w-0 px-10 pt-6 pb-10 font-sans text-body text-fg"
      aria-labelledby="my-models-title"
    >
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 id="my-models-title" className="text-title-1">
          我的模型
        </h1>
        <Button
          variant="secondary"
          className=""
          type="button"
          disabled={pending}
          onClick={() => setEditing('new')}
        >
          <Plus size={16} />
          添加模型
        </Button>
      </header>
      {error && (
        <p className="text-subheadline text-danger" role="alert">
          {error}
        </p>
      )}
      {value.models?.length ? (
        value.models.map((model) => (
          <article
            data-testid="configured-model"
            className="flex items-center justify-between gap-4 border-b border-separator py-4"
            key={model.id}
          >
            <div className="min-w-0 break-words">
              <strong className="text-headline">{model.config.name}</strong>
              <p className="my-2 text-callout text-fg-secondary">
                {model.config.provider === 'deepseek' ? 'DeepSeek 官方' : '自定义中转站'} ·{' '}
                {model.config.model}
              </p>
              {model.id === value.defaultModelId && (
                <small className="text-subheadline text-fg-secondary">默认模型</small>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                disabled={pending || model.id === value.defaultModelId}
                onClick={() => void change(model.id, false)}
                aria-label={`设为默认：${model.config.name}`}
              >
                设为默认
              </Button>
              <Button
                variant="secondary"
                type="button"
                disabled={pending}
                onClick={() => setEditing(model.id)}
                aria-label={`编辑模型：${model.config.name}`}
              >
                编辑
              </Button>
              <Button
                variant="destructive"
                type="button"
                disabled={pending}
                onClick={() => void change(model.id, true)}
                aria-label={`删除模型：${model.config.name}`}
              >
                删除
              </Button>
            </div>
          </article>
        ))
      ) : (
        <p className="text-body-relaxed text-fg-secondary">还没有模型，添加后即可在聊天中选择。</p>
      )}
    </section>
  );
}
