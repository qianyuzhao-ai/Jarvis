import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Info, LoaderCircle } from 'lucide-react';
import {
  agentValue,
  relayInputSchema,
  relayModelsInputSchema,
  type RelayConfig,
  type RelayView,
} from '../../../../shared/agent';
import { IconButton } from '../../components/IconButton';

const empty: RelayConfig = {
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
}: {
  value: RelayView;
  onSaved: (value: RelayView) => void;
  onDirtyChange: (dirty: boolean) => void;
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
      className="relay-settings"
      onSubmit={(event) => {
        event.preventDefault();
        void perform('save');
      }}
    >
      <div className="relay-content">
        <h1>连接中转站</h1>
        <p>使用你的中转站 API，在首页与模型对话。</p>
        <fieldset disabled={!!busy}>
          <div className="relay-row">
            <label htmlFor="relay-name">连接名称</label>
            <input
              id="relay-name"
              value={config.name}
              maxLength={100}
              onChange={(e) => change('name', e.target.value)}
              required
            />
          </div>
          <div className="relay-row">
            <label htmlFor="relay-url">API 地址</label>
            <div>
              <input
                id="relay-url"
                type="url"
                value={config.baseUrl}
                onChange={(e) => change('baseUrl', e.target.value)}
                placeholder="https://relay.example.com/v1"
                required
                spellCheck={false}
              />
              <small>填写中转站提供的基础地址，无需追加 /chat/completions。</small>
            </div>
          </div>
          <div className="relay-row">
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
                  placeholder={value.hasKey ? '已保存，留空保留原 Key' : '输入中转站 API Key'}
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
              <small>Key 加密保存在此设备；读取配置不会返回明文。无鉴权的本地中转可留空。</small>
              {value.hasKey && (
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
          <div className="relay-row">
            <label htmlFor="relay-api">接口协议</label>
            <div>
              <select
                id="relay-api"
                value={config.api}
                onChange={(e) => change('api', e.target.value as RelayConfig['api'])}
              >
                <option value="openai-completions">Chat Completions（OpenAI 兼容）</option>
                <option value="openai-responses">Responses（OpenAI 兼容）</option>
              </select>
              <small>按中转站文档选择；这里只配置中转站连接。</small>
            </div>
          </div>
          <div className="relay-row">
            <label htmlFor="relay-model">默认模型</label>
            <div>
              <div className="relay-model">
                <input
                  id="relay-model"
                  list="relay-models"
                  value={config.model}
                  onChange={(e) => change('model', e.target.value)}
                  placeholder="获取模型或填写模型 ID"
                  required
                  spellCheck={false}
                />
                <button type="button" onClick={() => void perform('models')}>
                  {busy === 'models' ? '正在获取…' : '获取模型'}
                </button>
              </div>
              <datalist id="relay-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <small>列表不可用时可手动填写；默认模型只影响新对话。</small>
            </div>
          </div>
          <details className="relay-advanced">
            <summary>上下文与输出限制</summary>
            <div className="relay-row">
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
            <div className="relay-row">
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
        <small>连接测试会发送一条简短请求，费用由中转站计收。测试不会自动保存。</small>
      </div>
      <footer className="relay-footer">
        <span>{dirty ? '更改尚未保存' : value.config ? '配置已保存' : '尚未配置'}</span>
        <div>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
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
