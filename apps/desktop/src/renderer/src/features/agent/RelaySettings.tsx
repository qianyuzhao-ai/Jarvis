import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Info, LoaderCircle } from 'lucide-react';
import {
  agentValue,
  relayInputSchema,
  relayModelsInputSchema,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODELS,
  type RelayConfig,
  type RelayView,
} from '../../../../shared/agent';
import { IconButton } from '../../components/IconButton';

const empty: RelayConfig = {
  provider: 'relay',
  name: '我的中转站',
  baseUrl: '',
  api: 'openai-completions',
  model: '',
  contextWindow: null,
  maxTokens: 4096,
};
export function RelaySettings({
  value,
  onSaved,
  onDirtyChange,
  modelId,
  create = false,
  onBack,
}: {
  value: RelayView;
  onSaved: (value: RelayView) => void;
  onDirtyChange: (dirty: boolean) => void;
  modelId?: string;
  create?: boolean;
  onBack?: () => void;
}) {
  const [config, setConfig] = useState(value.config ?? empty);
  const [key, setKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [visible, setVisible] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('尚未测试当前配置');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const locked = useRef(false);
  const official = config.provider === 'deepseek';
  const hasSavedKey =
    value.hasKey &&
    config.baseUrl === value.config?.baseUrl &&
    (config.provider ?? 'relay') === (value.config?.provider ?? 'relay');
  const dirty =
    JSON.stringify(config) !== JSON.stringify(value.config ?? empty) || !!key || clearKey;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function change<K extends keyof RelayConfig>(name: K, next: RelayConfig[K]) {
    setConfig((c) => ({ ...c, [name]: next }));
    setNotice('尚未测试当前配置');
    setError('');
    if (name === 'baseUrl') setModels([]);
  }
  async function perform(action: 'save' | 'test' | 'models') {
    if (locked.current || !window.desktop?.agent) return;
    const parsed = (action === 'models' ? relayModelsInputSchema : relayInputSchema).safeParse({
      config,
      ...(modelId ? { modelId } : {}),
      ...(create ? { create: true } : {}),
      apiKey: key,
      clearKey,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '检查配置');
      return;
    }
    locked.current = true;
    setBusy(action);
    setError('');
    try {
      const agent = window.desktop.agent;
      if (action === 'save') {
        const saved = agentValue(await agent.saveConfiguration(parsed.data));
        if (mounted.current) {
          onSaved(saved);
          setConfig(saved.config ?? empty);
          setKey('');
          setClearKey(false);
          setVisible(false);
          setNotice('配置已保存');
        }
      } else if (action === 'test') {
        const text = agentValue(await agent.testConnection(parsed.data));
        if (mounted.current) setNotice(text);
      } else {
        const items = agentValue(await agent.listModels(parsed.data));
        if (mounted.current) {
          setModels(items);
          setNotice(items.length ? `已获取 ${items.length} 个模型` : '列表为空，可手动填写模型 ID');
        }
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '连接失败');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy('');
    }
  }
  return (
    <form
      className="settings-page relay-settings"
      onSubmit={(event) => {
        event.preventDefault();
        void perform('save');
      }}
    >
      <div className="relay-content">
        {onBack && (
          <button
            className="model-library-back"
            type="button"
            onClick={() => {
              if (!dirty || window.confirm('放弃未保存的模型配置并返回？')) onBack();
            }}
          >
            返回我的模型
          </button>
        )}
        <h1>{create ? '添加模型' : '编辑模型'}</h1>
        <p>选择服务来源并配置连接。</p>
        <fieldset disabled={!!busy}>
          <div className="settings-row relay-row">
            <label htmlFor="model-provider">服务来源</label>
            <select
              id="model-provider"
              value={config.provider ?? 'relay'}
              onChange={(event) => {
                const provider = event.target.value === 'deepseek' ? 'deepseek' : 'relay';
                setConfig(
                  (value.config?.provider ?? 'relay') === provider && value.config
                    ? value.config
                    : provider === 'deepseek'
                      ? {
                          provider,
                          name: 'DeepSeek 官方',
                          baseUrl: DEEPSEEK_BASE_URL,
                          api: 'openai-completions',
                          model: DEEPSEEK_MODELS[0],
                          contextWindow: 1_000_000,
                          maxTokens: 4096,
                        }
                      : empty,
                );
                setKey('');
                setClearKey(false);
                setVisible(false);
                setModels([]);
                setError('');
                setNotice('尚未测试当前配置');
              }}
            >
              <option value="relay">自定义中转站</option>
              <option value="deepseek">DeepSeek 官方</option>
            </select>
          </div>
          <div className="settings-row relay-row">
            <label htmlFor="relay-name">模型名称</label>
            <input
              id="relay-name"
              value={config.name}
              maxLength={100}
              onChange={(e) => change('name', e.target.value)}
              required
            />
          </div>
          <div className="settings-row relay-row">
            <label htmlFor="relay-url">API 地址</label>
            <div>
              <input
                id="relay-url"
                type="url"
                readOnly={official}
                value={config.baseUrl}
                onChange={(e) => change('baseUrl', e.target.value)}
                placeholder="https://relay.example.com/v1"
                required
                spellCheck={false}
              />
              <small>
                {official
                  ? '直接连接 DeepSeek 官方 API。'
                  : '填写中转站提供的基础地址，无需追加 /chat/completions。'}
              </small>
            </div>
          </div>
          <div className="settings-row relay-row">
            <label htmlFor="relay-key">API Key</label>
            <div>
              <div className="relay-secret">
                <input
                  id="relay-key"
                  type={visible ? 'text' : 'password'}
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setClearKey(false);
                    setNotice('尚未测试当前配置');
                  }}
                  placeholder={
                    hasSavedKey
                      ? '已保存，留空保留原 Key'
                      : official
                        ? '输入 DeepSeek API Key'
                        : '输入中转站 API Key'
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
                <IconButton
                  label={visible ? '隐藏 API Key' : '显示新输入的 API Key'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </IconButton>
              </div>
              <small>
                {official
                  ? 'Key 加密保存在此设备；请使用 DeepSeek 开放平台的 API Key。'
                  : 'Key 加密保存在此设备；读取配置不会返回明文。无鉴权的本地中转可留空。'}
              </small>
              {hasSavedKey && !official && (
                <label className="relay-clear">
                  <input
                    type="checkbox"
                    checked={clearKey}
                    onChange={(e) => {
                      setClearKey(e.target.checked);
                      setKey('');
                      setNotice('尚未测试当前配置');
                    }}
                  />
                  清除已保存的 Key
                </label>
              )}
            </div>
          </div>
          <div className="settings-row relay-row">
            <label htmlFor="relay-api">接口协议</label>
            <div>
              <select
                id="relay-api"
                disabled={official}
                value={config.api}
                onChange={(e) => change('api', e.target.value as RelayConfig['api'])}
              >
                <option value="openai-completions">Chat Completions（OpenAI 兼容）</option>
                <option value="openai-responses">Responses（OpenAI 兼容）</option>
              </select>
              <small>
                {official ? '官方接入使用此协议，无需修改。' : '按中转站文档选择连接协议。'}
              </small>
            </div>
          </div>
          <div className="settings-row relay-row">
            <label htmlFor="relay-model">模型 ID</label>
            <div>
              <div className="relay-model">
                {official ? (
                  <select
                    id="relay-model"
                    value={config.model}
                    onChange={(e) => change('model', e.target.value)}
                  >
                    {DEEPSEEK_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="relay-model"
                    list="relay-models"
                    value={config.model}
                    onChange={(e) => change('model', e.target.value)}
                    placeholder="获取模型或填写模型 ID"
                    required
                    spellCheck={false}
                  />
                )}
                {!official && (
                  <button type="button" onClick={() => void perform('models')}>
                    {busy === 'models' ? '正在获取…' : '获取模型'}
                  </button>
                )}
              </div>
              <datalist id="relay-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <small>
                {official ? 'Flash 支持图片，Pro 仅支持文字。' : '列表不可用时可手动填写模型 ID。'}
              </small>
            </div>
          </div>
          <details className="relay-advanced">
            <summary>上下文与输出限制</summary>
            <div className="settings-row relay-row">
              <label htmlFor="relay-context">上下文容量</label>
              <input
                id="relay-context"
                type="number"
                min={8192}
                max={2000000}
                value={config.contextWindow ?? ''}
                placeholder="未知，留空不显示占用百分比"
                onChange={(e) =>
                  change('contextWindow', e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
            <div className="settings-row relay-row">
              <label htmlFor="relay-output">输出上限</label>
              <input
                id="relay-output"
                type="number"
                min={256}
                max={32768}
                value={config.maxTokens}
                onChange={(e) => change('maxTokens', Number(e.target.value))}
              />
            </div>
            <small>容量请以服务商文档为准。未知时采用本地保护上限，不代表模型真实容量。</small>
          </details>
        </fieldset>
        <div className="relay-test">
          <button type="button" disabled={!!busy} onClick={() => void perform('test')}>
            {busy === 'test' ? '正在测试…' : '测试连接'}
          </button>
          <span role="status">
            {busy ? <LoaderCircle size={16} className="agent-spinner" /> : <Info size={16} />}
            {busy === 'test' ? '正在测试流式连接…' : notice}
          </span>
        </div>
        {error && (
          <p className="agent-error" role="alert">
            {error}
          </p>
        )}
        <small>连接测试会发送一条简短请求，费用由所选服务计收。测试不会自动保存。</small>
      </div>
      <footer className="relay-footer">
        <span>{dirty ? '更改尚未保存' : value.config ? '配置已保存' : '尚未配置'}</span>
        <div>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              if (onBack) {
                onBack();
                return;
              }
              setConfig(value.config ?? empty);
              setKey('');
              setClearKey(false);
              setError('');
              setNotice('尚未测试当前配置');
            }}
          >
            取消
          </button>
          <button className="agent-primary" type="submit" disabled={!!busy || !dirty}>
            {busy === 'save' ? '保存中…' : '保存更改'}
          </button>
        </div>
      </footer>
    </form>
  );
}
