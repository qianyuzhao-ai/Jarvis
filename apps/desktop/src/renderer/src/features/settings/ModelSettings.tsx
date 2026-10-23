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
    <section className="settings-page model-library" aria-labelledby="my-models-title">
      <header className="model-library-heading">
        <h1 id="my-models-title">我的模型</h1>
        <button
          className="secondary-button"
          type="button"
          disabled={pending}
          onClick={() => setEditing('new')}
        >
          <Plus size={16} />
          添加模型
        </button>
      </header>
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      {value.models?.length ? (
        value.models.map((model) => (
          <article data-testid="configured-model" className="configured-model" key={model.id}>
            <div>
              <strong>{model.config.name}</strong>
              <p>
                {model.config.provider === 'deepseek' ? 'DeepSeek 官方' : '自定义中转站'} ·{' '}
                {model.config.model}
              </p>
              {model.id === value.defaultModelId && <small>默认模型</small>}
            </div>
            <div className="configured-model-actions">
              <button
                type="button"
                disabled={pending || model.id === value.defaultModelId}
                onClick={() => void change(model.id, false)}
                aria-label={`设为默认：${model.config.name}`}
              >
                设为默认
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(model.id)}
                aria-label={`编辑模型：${model.config.name}`}
              >
                编辑
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void change(model.id, true)}
                aria-label={`删除模型：${model.config.name}`}
              >
                删除
              </button>
            </div>
          </article>
        ))
      ) : (
        <p className="models-empty">还没有模型，添加后即可在聊天中选择。</p>
      )}
    </section>
  );
}
