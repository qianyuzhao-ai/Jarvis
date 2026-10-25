import { Badge } from '@jarvis/ui/components/Badge';
import { Button } from '@jarvis/ui/components/Button';
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
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { Separator } from '@jarvis/ui/components/Separator';
import { ToggleGroup, ToggleGroupItem } from '@jarvis/ui/components/ToggleGroup';
import { Image } from '@jarvis/ui/icons';
import { useState } from 'react';
import { agentValue } from '../../../../../shared/agent';
import {
  THINKING_LABELS,
  type ModelView,
  type ProviderView,
  type ThinkingLevel,
} from '../../../../../shared/models';
import { API_LABELS, SOURCE_LABELS, tokens, visionBadge } from './model-format';

const THINKING_PRESETS: Record<string, ThinkingLevel[] | 'auto'> = {
  auto: 'auto',
  none: [],
  standard: ['off', 'low', 'medium', 'high'],
  extended: ['off', 'low', 'medium', 'high', 'xhigh'],
};
function preset(model: ModelView) {
  if (model.thinkingSource !== 'manual') return 'auto';
  const levels = model.thinkingLevels.join(',');
  return (
    Object.entries(THINKING_PRESETS).find(
      ([, value]) => value !== 'auto' && value.join(',') === levels,
    )?.[0] ?? 'standard'
  );
}
const levelsText = (levels: ThinkingLevel[]) =>
  levels.length ? levels.map((l) => THINKING_LABELS[l]).join(' / ') : '不调节';

export function ModelCapabilitiesDialog({
  model,
  provider,
  onClose,
}: {
  model: ModelView;
  provider: ProviderView;
  onClose: () => void;
}) {
  const [vision, setVision] = useState<'auto' | 'supported' | 'unsupported'>(
    model.visionSource === 'manual' && model.vision !== 'unknown' ? model.vision : 'auto',
  );
  const [thinking, setThinking] = useState(preset(model));
  const [context, setContext] = useState(
    model.contextSource === 'manual' ? String(model.contextWindow ?? '') : '',
  );
  const [output, setOutput] = useState(
    model.maxTokensSource === 'manual' ? String(model.maxTokens ?? '') : '',
  );
  const [probe, setProbe] = useState<string>('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const badge = visionBadge(model.vision);
  const number = (value: string) => (value.trim() ? Number(value) : ('auto' as const));

  async function detect() {
    setBusy('probe');
    setError('');
    try {
      const result = agentValue(await window.desktop!.models.probeVision(model.id));
      setProbe(result.message);
      setVision('auto');
    } catch (e) {
      setError(e instanceof Error ? e.message : '检测失败');
    } finally {
      setBusy('');
    }
  }
  async function save() {
    setBusy('save');
    setError('');
    try {
      const contextWindow = number(context);
      const maxTokens = number(output);
      if ([contextWindow, maxTokens].some((v) => v !== 'auto' && !Number.isInteger(v)))
        throw new Error('上下文容量和输出上限需要填写整数');
      agentValue(
        await window.desktop!.models.updateModel({
          id: model.id,
          vision,
          thinkingLevels: THINKING_PRESETS[thinking] ?? 'auto',
          contextWindow,
          maxTokens,
        }),
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>模型能力</DialogTitle>
          <DialogDescription>
            {model.modelId} · {provider.name} · {API_LABELS[provider.api ?? ''] ?? provider.api}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <section className="grid gap-2" aria-label="图片理解">
            <div className="flex items-center gap-3">
              <h3 className="flex-1 text-headline">图片理解</h3>
              <ToggleGroup
                aria-label="图片理解"
                value={vision}
                onValueChange={(value) =>
                  value && setVision(value as 'auto' | 'supported' | 'unsupported')
                }
              >
                <ToggleGroupItem value="auto">自动识别</ToggleGroupItem>
                <ToggleGroupItem value="supported">支持</ToggleGroupItem>
                <ToggleGroupItem value="unsupported">不支持</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid gap-1.5 rounded-control bg-fill px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <span className="flex-1 text-callout text-fg-secondary">
                  来源：{SOURCE_LABELS[model.visionSource]}
                </span>
                <Button
                  variant={model.vision === 'unknown' ? 'secondary' : 'ghost'}
                  size="sm"
                  loading={busy === 'probe'}
                  disabled={!!busy}
                  onClick={() => void detect()}
                >
                  <Image />
                  {model.visionSource === 'probe' ? '重新检测' : '检测图片能力'}
                </Button>
              </div>
              <p role="status" className="text-callout text-fg-secondary">
                {probe ||
                  (model.vision === 'unknown'
                    ? 'SDK 目录中没有匹配的模型，中转站也没有提供能力信息。检测会发送一张带随机 4 位数字的小图，要求模型只回复这个数字；费用由服务商计收。'
                    : '只有支持图片的模型会收到画布中所选的图片和视频代表帧。')}
              </p>
            </div>
          </section>
          <Separator />
          <Field controlId="capability-thinking">
            <FieldLabel htmlFor="capability-thinking">思考程度</FieldLabel>
            <NativeSelect
              id="capability-thinking"
              value={thinking}
              onChange={(e) => setThinking(e.target.value)}
            >
              <option value="auto">
                自动（
                {model.thinkingSource === 'manual' ? '按目录' : levelsText(model.thinkingLevels)}）
              </option>
              <option value="none">不调节（不发送思考参数）</option>
              <option value="standard">关闭 / 低 / 中 / 高（reasoning_effort）</option>
              <option value="extended">关闭 / 低 / 中 / 高 / 超高</option>
            </NativeSelect>
            <FieldDescription>
              开启后输入框中会出现思考选择；中转站不接受该参数时请改回不调节。
            </FieldDescription>
          </Field>
          <Field controlId="capability-context">
            <FieldLabel htmlFor="capability-context">上下文容量</FieldLabel>
            <Input
              id="capability-context"
              inputMode="numeric"
              value={context}
              placeholder={
                model.contextSource === 'catalog'
                  ? `${tokens(model.contextWindow)}（目录）`
                  : '未知'
              }
              onChange={(e) => setContext(e.target.value.replace(/\D/g, ''))}
            />
            <FieldDescription>
              留空使用自动值；未知时只按本地保护值处理，不显示上下文占用。
            </FieldDescription>
          </Field>
          <Field controlId="capability-output">
            <FieldLabel htmlFor="capability-output">输出上限</FieldLabel>
            <Input
              id="capability-output"
              inputMode="numeric"
              value={output}
              placeholder={
                model.maxTokensSource === 'catalog' ? `${tokens(model.maxTokens)}（目录）` : '自动'
              }
              onChange={(e) => setOutput(e.target.value.replace(/\D/g, ''))}
            />
            <FieldDescription>留空为自动：未知时不发送上限参数，由中转站决定。</FieldDescription>
          </Field>
          {error && (
            <p role="alert" className="text-subheadline text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter note="只影响 Jarvis 发出的请求，不修改中转站配置。">
          <Button variant="secondary" disabled={!!busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={!!busy} loading={busy === 'save'} onClick={() => void save()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
