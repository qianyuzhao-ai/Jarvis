import { Badge, StatusDot } from '@jarvis/ui/components/Badge';
import { Button } from '@jarvis/ui/components/Button';
import { Checkbox } from '@jarvis/ui/components/Checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@jarvis/ui/components/Dialog';
import { Field, FieldDescription, FieldLabel } from '@jarvis/ui/components/Field';
import { Input } from '@jarvis/ui/components/Input';
import { InputGroup, InputGroupAddon } from '@jarvis/ui/components/InputGroup';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { Spinner } from '@jarvis/ui/components/Spinner';
import { Toggle } from '@jarvis/ui/components/Toggle';
import { Image, Plus, Search } from '@jarvis/ui/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { agentValue } from '../../../../../shared/agent';
import {
  CUSTOM_APIS,
  type CatalogProvider,
  type CustomApi,
  type ModelCandidate,
  type ModelSettingsView,
  type ProviderInput,
  type ProviderView,
} from '../../../../../shared/models';
import { API_LABELS, tokens } from './model-format';

export type ProviderDialogMode =
  | { kind: 'new' }
  | { kind: 'edit'; provider: ProviderView }
  | { kind: 'models'; provider: ProviderView };
type Step = 'choose' | 'connect' | 'models';
type Choice = { kind: 'builtin'; sdkProvider: string } | { kind: 'custom' };

const GROUPS: [CatalogProvider['group'], string][] = [
  ['domestic', '国内常用'],
  ['international', '国际常用'],
  ['more', '更多服务商'],
];

function bridge() {
  const models = window.desktop?.models;
  if (!models) throw new Error('模型设置接口不可用，请重新打开应用');
  return models;
}

export function AddProviderDialog({
  mode,
  settings,
  catalog,
  onClose,
}: {
  mode: ProviderDialogMode;
  settings: ModelSettingsView;
  catalog: CatalogProvider[];
  onClose: () => void;
}) {
  const existing = mode.kind === 'new' ? undefined : mode.provider;
  const [step, setStep] = useState<Step>(
    mode.kind === 'new' ? 'choose' : mode.kind === 'edit' ? 'connect' : 'models',
  );
  const [choice, setChoice] = useState<Choice | null>(
    existing
      ? existing.kind === 'builtin'
        ? { kind: 'builtin', sdkProvider: existing.sdkProvider ?? '' }
        : { kind: 'custom' }
      : null,
  );
  const [providerId, setProviderId] = useState(existing?.id);
  const [name, setName] = useState(existing?.kind === 'custom' ? existing.name : '');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [api, setApi] = useState<CustomApi>((existing?.api as CustomApi) ?? 'openai-completions');
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [query, setQuery] = useState('');
  const [visionOnly, setVisionOnly] = useState(false);
  const [candidates, setCandidates] = useState<ModelCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        existing
          ? settings.models.filter((m) => m.providerId === existing.id).map((m) => m.modelId)
          : [],
      ),
  );
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const builtin =
    choice?.kind === 'builtin' ? catalog.find((p) => p.id === choice.sdkProvider) : undefined;
  const providerName = builtin?.name ?? (name.trim() || '自定义接口');

  function input(): ProviderInput {
    if (!choice) throw new Error('请先选择服务商');
    return choice.kind === 'builtin'
      ? {
          kind: 'builtin',
          sdkProvider: choice.sdkProvider,
          ...(providerId ? { id: providerId } : {}),
          apiKey,
        }
      : {
          kind: 'custom',
          ...(providerId ? { id: providerId } : {}),
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          api,
          apiKey,
          clearKey,
        };
  }
  async function run<T>(label: string, action: () => Promise<T>) {
    if (busy) return undefined;
    setBusy(label);
    setError('');
    try {
      return await action();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '操作失败');
      return undefined;
    } finally {
      if (mounted.current) setBusy('');
    }
  }
  function validateConnection() {
    if (choice?.kind === 'custom') {
      if (!name.trim()) throw new Error('请填写名称');
      if (!baseUrl.trim()) throw new Error('请填写接口地址');
    } else if (!apiKey && !existing?.hasKey) throw new Error(`请填写 ${providerName} API Key`);
  }
  async function loadCandidates() {
    const list = agentValue(await bridge().listCandidates(input()));
    if (!mounted.current) return;
    const known = new Set(list.map((m) => m.id));
    const kept = [...selected].filter((id) => !known.has(id));
    setCandidates([...list, ...kept.map((id) => manualCandidate(id))]);
  }
  // Holds the latest loader so entering the models step fetches with the current form values.
  const load = useRef(() => {});
  load.current = () => {
    void run('candidates', loadCandidates);
  };
  useEffect(() => {
    if (step === 'models') load.current();
  }, [step]);

  const title =
    step === 'choose'
      ? '添加服务商'
      : step === 'connect'
        ? choice?.kind === 'custom'
          ? existing
            ? `编辑 ${existing.name}`
            : '连接自定义接口'
          : `连接 ${providerName}`
        : `选择${providerName}的模型`;
  const description =
    step === 'choose'
      ? '选择服务商后填写 API Key，再勾选要在聊天中使用的模型。'
      : step === 'connect'
        ? choice?.kind === 'custom'
          ? '可添加多个中转站，每个中转站单独保存地址、协议和 Key。'
          : `${builtin?.baseUrl ? new URL(builtin.baseUrl).host + ' · ' : ''}地址与协议由 SDK 内置，无需填写。`
        : choice?.kind === 'custom'
          ? '列表来自 /models，图片能力已按 SDK 目录识别；未确认的可在添加后检测。'
          : '勾选的模型会出现在首页、画布和写作入口的模型选择器中。';
  const totalSteps = mode.kind === 'new' ? 3 : 1;
  const stepIndex = mode.kind === 'new' ? { choose: 1, connect: 2, models: 3 }[step] : 1;

  async function next() {
    if (step === 'choose') {
      if (!choice) return;
      setStep('connect');
      return;
    }
    if (step === 'connect') {
      const ready = await run('next', async () => {
        validateConnection();
        if (mode.kind !== 'edit') return true;
        agentValue(await bridge().saveProvider(input()));
        onClose();
        return false;
      });
      // Switch only after the busy flag clears, otherwise the models loader is skipped.
      if (ready && mounted.current) {
        setCandidates(null);
        setStep('models');
      }
      return;
    }
    await run('save', async () => {
      const list = candidates ?? [];
      const models = [...selected].map((modelId) => {
        const candidate = list.find((c) => c.id === modelId);
        return {
          modelId,
          ...(candidate?.providerVision !== undefined
            ? { providerVision: candidate.providerVision }
            : {}),
        };
      });
      let id = providerId;
      if (!existing) {
        const saved = agentValue(await bridge().saveProvider(input()));
        id = saved.id;
        if (mounted.current) setProviderId(id);
      }
      if (!id) throw new Error('服务商保存失败');
      agentValue(await bridge().setProviderModels({ providerId: id, models }));
      onClose();
    });
  }
  async function test() {
    await run('test', async () => {
      validateConnection();
      setNotice(null);
      try {
        const text = agentValue(await bridge().testProvider({ provider: input() }));
        if (mounted.current) setNotice({ ok: true, text });
      } catch (e) {
        if (mounted.current)
          setNotice({ ok: false, text: e instanceof Error ? e.message : '连接失败' });
      }
    });
  }

  const primary =
    step === 'choose'
      ? '下一步'
      : step === 'connect'
        ? mode.kind === 'edit'
          ? '保存'
          : '下一步'
        : mode.kind === 'models'
          ? '保存'
          : `添加 ${selected.size} 个模型`;
  const primaryDisabled =
    !!busy ||
    (step === 'choose' && !choice) ||
    (step === 'models' && mode.kind === 'new' && selected.size === 0);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          {step === 'choose' && (
            <ChooseStep
              catalog={catalog}
              query={query}
              onQuery={setQuery}
              choice={choice}
              onChoose={(next) => {
                setChoice(next);
                setNotice(null);
              }}
            />
          )}
          {step === 'connect' && choice && (
            <div className="grid gap-4">
              {choice.kind === 'custom' && (
                <>
                  <Field controlId="provider-name">
                    <FieldLabel htmlFor="provider-name">名称</FieldLabel>
                    <Input
                      id="provider-name"
                      value={name}
                      maxLength={100}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <FieldDescription>显示在设置和模型选择器的分组标题中。</FieldDescription>
                  </Field>
                  <Field controlId="provider-url">
                    <FieldLabel htmlFor="provider-url">接口地址</FieldLabel>
                    <Input
                      id="provider-url"
                      type="url"
                      value={baseUrl}
                      placeholder="https://relay.example.com/v1"
                      spellCheck={false}
                      onChange={(e) => {
                        setBaseUrl(e.target.value);
                        setNotice(null);
                      }}
                    />
                    <FieldDescription>填写基础地址，无需追加 /chat/completions。</FieldDescription>
                  </Field>
                  <Field controlId="provider-api">
                    <FieldLabel htmlFor="provider-api">接口协议</FieldLabel>
                    <NativeSelect
                      id="provider-api"
                      value={api}
                      onChange={(e) => setApi(e.target.value as CustomApi)}
                    >
                      {CUSTOM_APIS.map((value) => (
                        <option key={value} value={value}>
                          {API_LABELS[value]}
                        </option>
                      ))}
                    </NativeSelect>
                    <FieldDescription>按中转站文档选择。</FieldDescription>
                  </Field>
                </>
              )}
              <Field controlId="provider-key">
                <FieldLabel htmlFor="provider-key">API Key</FieldLabel>
                <Input
                  id="provider-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  placeholder={existing?.hasKey ? '已保存，留空保留原 Key' : '输入 API Key'}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setClearKey(false);
                    setNotice(null);
                  }}
                />
                <FieldDescription>
                  {choice.kind === 'custom'
                    ? 'Key 加密保存在此设备；无鉴权的本地服务可留空。'
                    : 'Key 加密保存在此设备，读取配置时不会返回明文。'}
                </FieldDescription>
              </Field>
              {choice.kind === 'custom' && existing?.hasKey && (
                <Checkbox
                  id="provider-clear-key"
                  label="清除已保存的 Key"
                  checked={clearKey}
                  onCheckedChange={(checked) => {
                    setClearKey(checked === true);
                    setApiKey('');
                  }}
                />
              )}
              <div className="flex items-center gap-3">
                <Button variant="secondary" disabled={!!busy} onClick={() => void test()}>
                  {busy === 'test' ? '正在测试…' : '测试连接'}
                </Button>
                {notice && (
                  <span
                    role="status"
                    className="flex min-w-0 items-center gap-2 text-callout text-fg-secondary"
                  >
                    <StatusDot tone={notice.ok ? 'success' : 'danger'} />
                    {notice.text}
                  </span>
                )}
              </div>
              <p className="text-callout text-fg-tertiary">
                测试会发送一条简短请求，费用由服务商计收。
              </p>
            </div>
          )}
          {step === 'models' && (
            <ModelsStep
              custom={choice?.kind === 'custom'}
              candidates={candidates}
              loading={busy === 'candidates'}
              query={query}
              onQuery={setQuery}
              visionOnly={visionOnly}
              onVisionOnly={setVisionOnly}
              selected={selected}
              onSelected={setSelected}
              manual={manual}
              onManual={setManual}
              onAddManual={() => {
                const id = manual.trim();
                if (!id) return;
                setCandidates((list) =>
                  list?.some((c) => c.id === id) ? list : [...(list ?? []), manualCandidate(id)],
                );
                setSelected((s) => new Set(s).add(id));
                setManual('');
              }}
            />
          )}
          {error && (
            <p role="alert" className="text-subheadline text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter note={totalSteps > 1 ? `第 ${stepIndex} 步，共 ${totalSteps} 步` : undefined}>
          <Button
            variant="secondary"
            disabled={!!busy && busy !== 'candidates'}
            onClick={() => {
              if (mode.kind === 'new' && step !== 'choose' && !providerId)
                setStep(step === 'models' ? 'connect' : 'choose');
              else onClose();
            }}
          >
            {mode.kind === 'new' && step !== 'choose' && !providerId ? '上一步' : '取消'}
          </Button>
          <Button disabled={primaryDisabled} onClick={() => void next()}>
            {busy === 'save' || busy === 'next' ? <Spinner /> : null}
            {primary}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function manualCandidate(id: string): ModelCandidate {
  return {
    id,
    name: id,
    vision: false,
    visionKnown: false,
    visionSource: 'unknown',
    thinkingLevels: [],
    contextWindow: null,
    maxTokens: null,
  };
}

function ChooseStep({
  catalog,
  query,
  onQuery,
  choice,
  onChoose,
}: {
  catalog: CatalogProvider[];
  query: string;
  onQuery: (value: string) => void;
  choice: Choice | null;
  onChoose: (choice: Choice) => void;
}) {
  const q = query.trim().toLowerCase();
  const match = (p: CatalogProvider) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q);
  const tile = (key: string, title: string, meta: string, active: boolean, pick: () => void) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={pick}
      className={`grid min-w-0 gap-0.5 rounded-control border px-3 py-2 text-left ${
        active
          ? 'border-accent bg-selection'
          : 'border-border bg-surface-raised hover:bg-fill-hover'
      }`}
    >
      <strong className="truncate text-headline">{title}</strong>
      <span className="truncate text-callout text-fg-secondary">{meta}</span>
    </button>
  );
  return (
    <>
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <Input
          aria-label="搜索服务商"
          placeholder="搜索服务商"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </InputGroup>
      {GROUPS.map(([group, label]) => {
        const items = catalog.filter((p) => p.group === group && match(p));
        return items.length ? (
          <section key={group} className="grid gap-2">
            <h3 className="text-subheadline text-fg-secondary">{label}</h3>
            <div className="grid grid-cols-3 gap-2">
              {items.map((p) =>
                tile(
                  p.id,
                  p.name,
                  `${p.models.length} 个模型 · API Key`,
                  choice?.kind === 'builtin' && choice.sdkProvider === p.id,
                  () => onChoose({ kind: 'builtin', sdkProvider: p.id }),
                ),
              )}
            </div>
          </section>
        ) : null;
      })}
      <section className="grid gap-2">
        <h3 className="text-subheadline text-fg-secondary">其他</h3>
        <div className="grid grid-cols-3 gap-2">
          {tile('custom', '自定义接口', '中转站或本地服务', choice?.kind === 'custom', () =>
            onChoose({ kind: 'custom' }),
          )}
        </div>
      </section>
    </>
  );
}

function ModelsStep({
  custom,
  candidates,
  loading,
  query,
  onQuery,
  visionOnly,
  onVisionOnly,
  selected,
  onSelected,
  manual,
  onManual,
  onAddManual,
}: {
  custom: boolean;
  candidates: ModelCandidate[] | null;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  visionOnly: boolean;
  onVisionOnly: (value: boolean) => void;
  selected: Set<string>;
  onSelected: (value: Set<string>) => void;
  manual: string;
  onManual: (value: string) => void;
  onAddManual: () => void;
}) {
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (candidates ?? []).filter(
      (c) =>
        (!q || c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) &&
        (!visionOnly || c.vision),
    );
  }, [candidates, query, visionOnly]);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelected(next);
  };
  const allVisible = visible.length > 0 && visible.every((c) => selected.has(c.id));
  return (
    <>
      <div className="flex items-center gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <Input
            aria-label="搜索模型"
            placeholder="搜索模型"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </InputGroup>
        <Toggle variant="outline" pressed={visionOnly} onPressedChange={onVisionOnly}>
          <Image />
          仅支持图片
        </Toggle>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-callout text-fg-secondary">
          已选 {selected.size} 个，共 {candidates?.length ?? 0} 个
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!visible.length}
          onClick={() => {
            const next = new Set(selected);
            for (const c of visible) {
              if (allVisible) next.delete(c.id);
              else next.add(c.id);
            }
            onSelected(next);
          }}
        >
          {allVisible ? '全不选' : '全选'}
        </Button>
      </div>
      <div
        className="max-h-80 overflow-y-auto rounded-panel border border-separator"
        aria-label="可选模型"
        role="group"
      >
        {loading && (
          <p className="flex items-center gap-2 p-4 text-callout text-fg-secondary">
            <Spinner />
            正在获取模型列表…
          </p>
        )}
        {!loading && !visible.length && (
          <p className="p-4 text-callout text-fg-secondary">
            {candidates?.length ? '没有匹配的模型' : '没有获取到模型，可手动添加模型 ID'}
          </p>
        )}
        {visible.map((c) => (
          <label
            key={c.id}
            data-testid="model-option"
            className="flex items-center gap-3 border-separator px-3 py-2 not-last:border-b"
          >
            <Checkbox
              aria-label={`启用 ${c.id}`}
              checked={selected.has(c.id)}
              onCheckedChange={(checked) => toggle(c.id, checked === true)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body">{c.name}</span>
              {c.name !== c.id && (
                <span className="block truncate text-callout text-fg-tertiary">{c.id}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {c.visionKnown ? (
                c.vision ? (
                  <Badge tone="info">图片</Badge>
                ) : (
                  <Badge>仅文字</Badge>
                )
              ) : (
                <Badge tone="warning">图片未确认</Badge>
              )}
              {c.thinkingLevels.length > 1 && <Badge>可思考</Badge>}
              {c.contextWindow && <Badge>{tokens(c.contextWindow)} 上下文</Badge>}
            </span>
          </label>
        ))}
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          <Input
            aria-label="手动添加模型 ID"
            placeholder="手动添加模型 ID"
            value={manual}
            onChange={(e) => onManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddManual();
              }
            }}
          />
          <Button variant="secondary" disabled={!manual.trim()} onClick={onAddManual}>
            <Plus />
            添加
          </Button>
        </div>
      )}
    </>
  );
}
