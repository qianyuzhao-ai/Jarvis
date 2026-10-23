import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Search, Plus, Magnet, Grid2X2, List, X } from 'lucide-react';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Input } from '@jarvis/ui/components/Input';
import { Field, FieldLabel, FieldDescription, FieldError } from '@jarvis/ui/components/Field';
import { InputGroup, InputGroupAddon } from '@jarvis/ui/components/InputGroup';
import { Textarea } from '@jarvis/ui/components/Textarea';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { Checkbox } from '@jarvis/ui/components/Checkbox';
import { Toggle } from '@jarvis/ui/components/Toggle';
import { ToggleGroup, ToggleGroupItem } from '@jarvis/ui/components/ToggleGroup';
import { Spinner } from '@jarvis/ui/components/Spinner';
import { Separator } from '@jarvis/ui/components/Separator';
import {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from '@jarvis/ui/components/Tooltip';
import './ui-preview.css';
import { OverlayPreview } from './OverlayPreview';
const variants = ['default', 'secondary', 'ghost', 'destructive'] as const;
const sizes = ['xs', 'sm', 'default', 'lg', 'icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const;
const fieldStates = ['empty', 'filled', 'disabled', 'readOnly', 'invalid'] as const;
export default function UiPreview() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [busy, setBusy] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [password, setPassword] = useState(false);
  const [themeValue, setThemeValue] = useState('system');
  const inputRef = useRef<HTMLInputElement>(null);
  const [autoText, setAutoText] = useState('第一行');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.windowActive = 'true';
  }, [theme]);
  return (
    <main className="ui-preview min-h-dvh bg-window p-8 font-sans text-body text-fg">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-title-1">UI V1 Preview</h1>
        <Button variant="secondary" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          切换预览主题
        </Button>
      </header>
      <p className="my-4 text-subheadline text-fg-secondary">
        Light / Dark · Tab 聚焦，Space / Enter 操作，悬停和按下控件查看真实状态。
      </p>
      <section aria-label="Button">
        <h2>Button</h2>
        {variants.map((variant) => (
          <div className="preview-row" key={variant}>
            <span className="w-24 text-subheadline">{variant}</span>
            {sizes.map((size) => (
              <Button key={size} variant={variant} size={size} aria-label={`${variant}-${size}`}>
                {size.startsWith('icon') ? <Plus /> : '保存'}
              </Button>
            ))}
            <Button variant={variant} disabled>
              禁用
            </Button>
            <Button variant={variant} loading>
              正在保存
            </Button>
          </div>
        ))}
        <div className="preview-row">
          <Button variant="secondary" shape="capsule">
            胶囊按钮
          </Button>
          <Button variant="ghost" shape="capsule" size="lg">
            较大胶囊
          </Button>
          <IconButton aria-label="圆形添加" shape="circle" size="icon-lg" variant="secondary">
            <Plus />
          </IconButton>
          <Button variant="secondary">这是需要完整显示的长按钮文字</Button>
          <Button asChild variant="ghost">
            <a href="#/ui-preview">文本链接</a>
          </Button>
        </div>
        <div className="preview-row">
          <Button
            aria-label="防重复提交"
            loading={busy}
            onClick={() => {
              setClicks((n) => n + 1);
              setBusy(true);
            }}
          >
            提交测试
          </Button>
          <Button variant="secondary" onClick={() => setBusy(false)}>
            完成测试
          </Button>
          <output aria-label="提交次数">{clicks}</output>
          <Button asChild loading={busy}>
            <a
              href="#/ui-preview"
              onClick={(event) => {
                event.preventDefault();
                setClicks((n) => n + 1);
              }}
            >
              链接提交
            </a>
          </Button>
        </div>
      </section>
      <section aria-label="Input">
        <h2>Input</h2>
        <div className="preview-grid">
          {fieldStates.map((state) => (
            <Field key={state} error={state === 'invalid' ? '请输入完整地址' : undefined}>
              <FieldLabel>{`输入-${state}`}</FieldLabel>
              <Input
                placeholder="请输入…"
                defaultValue={state === 'empty' ? '' : 'Jarvis 项目'}
                disabled={state === 'disabled'}
                readOnly={state === 'readOnly'}
              />
            </Field>
          ))}
        </div>
        <div className="preview-row">
          {(['sm', 'default', 'lg'] as const).map((size) => (
            <Input key={size} size={size} aria-label={`输入尺寸-${size}`} defaultValue="Jarvis" />
          ))}
          <Input appearance="ghost" aria-label="内联重命名" defaultValue="未命名项目" />
          <Input
            aria-label="超长输入"
            defaultValue="非常长的项目名称用于检验文本超出控件后的省略表现"
          />
        </div>
      </section>
      <div className="preview-grid">
        <Input appearance="ghost" aria-label="内联错误" aria-invalid defaultValue="错误名称" />
        <Field>
          <FieldLabel>空错误字段</FieldLabel>
          <Input />
          <FieldError>{undefined}</FieldError>
        </Field>
      </div>
      <section aria-label="Field">
        <h2>Field</h2>
        <div className="preview-grid">
          {(['vertical', 'horizontal'] as const).map((orientation) => (
            <div className="grid gap-4" key={orientation}>
              {(['normal', 'invalid', 'disabled'] as const).map((state) => (
                <Field
                  key={state}
                  orientation={orientation}
                  disabled={state === 'disabled'}
                  error={state === 'invalid' ? '请输入有效的接口地址' : undefined}
                  description="填写服务提供的地址"
                >
                  <FieldLabel>{`${orientation}-${state}`}</FieldLabel>
                  <Input placeholder="https://" />
                </Field>
              ))}
            </div>
          ))}
        </div>
      </section>
      <section aria-label="InputGroup">
        <h2>InputGroup</h2>
        <div className="preview-grid">
          {(['sm', 'default', 'lg'] as const).map((size) => (
            <Field key={size}>
              <FieldLabel>{`搜索-${size}`}</FieldLabel>
              <InputGroup size={size}>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <Input size={size} placeholder="搜索项目" />
                <Button
                  variant="ghost"
                  size={size === 'lg' ? 'icon-sm' : 'icon-xs'}
                  aria-label={`清除-${size}`}
                  onClick={(event) => {
                    const input = event.currentTarget.parentElement?.querySelector('input');
                    if (input) {
                      input.value = '';
                      input.focus();
                    }
                  }}
                >
                  <X />
                </Button>
              </InputGroup>
            </Field>
          ))}
          <Field>
            <FieldLabel>预览 API Key</FieldLabel>
            <InputGroup>
              <Input type={password ? 'text' : 'password'} defaultValue="example-only" />
              <IconButton
                variant="ghost"
                size="icon-xs"
                aria-label={password ? '隐藏预览密码' : '显示预览密码'}
                onClick={() => setPassword(!password)}
              >
                {password ? <EyeOff /> : <Eye />}
              </IconButton>
            </InputGroup>
            <FieldDescription>只包含演示数据</FieldDescription>
          </Field>
          <InputGroup>
            <Input aria-label="时长" defaultValue="5" />
            <InputGroupAddon align="end">秒</InputGroupAddon>
          </InputGroup>
          <InputGroup>
            <Input aria-label="组错误" aria-invalid defaultValue="无效值" />
          </InputGroup>
          <InputGroup>
            <Input aria-label="组禁用" disabled defaultValue="不可编辑" />
          </InputGroup>
          <InputGroup>
            <Input aria-label="组只读" readOnly defaultValue="可以复制" />
          </InputGroup>
        </div>
      </section>
      <section aria-label="Textarea">
        <h2>Textarea</h2>
        <div className="preview-grid">
          {fieldStates.map((state) => (
            <Textarea
              key={state}
              aria-label={`多行-${state}`}
              disabled={state === 'disabled'}
              readOnly={state === 'readOnly'}
              aria-invalid={state === 'invalid'}
              placeholder="描述你想生成的画面…"
              defaultValue={
                state === 'empty'
                  ? ''
                  : '橘猫坐在窗台上，午后阳光透过百叶窗。\n电影感光影与胶片质感。'
              }
              showCount
              maxLength={2000}
            />
          ))}
          <Textarea autoResize aria-label="单行自动" defaultValue="一行内容" />
          <Textarea
            autoResize
            aria-label="自动增高"
            value={autoText}
            onChange={(event) => setAutoText(event.target.value)}
            showCount
          />
        </div>
      </section>
      <section aria-label="NativeSelect">
        <h2>NativeSelect</h2>
        <div className="preview-row">
          {(['sm', 'default', 'lg'] as const).map((size) => (
            <NativeSelect key={size} size={size} aria-label={`选择-${size}`} defaultValue="chat">
              <option value="chat">Chat Completions</option>
              <option value="responses">Responses</option>
            </NativeSelect>
          ))}
        </div>
        <div className="preview-row">
          <NativeSelect aria-label="选择占位" placeholder="请选择" defaultValue="">
            <option>模型</option>
          </NativeSelect>
          <NativeSelect aria-label="选择禁用" disabled>
            <option>不可选择</option>
          </NativeSelect>
          <NativeSelect aria-label="选择错误" aria-invalid>
            <option>错误协议</option>
          </NativeSelect>
          <NativeSelect appearance="compact" aria-label="紧凑选择" leadingIcon={<Magnet />}>
            <option>16:9</option>
            <option>4:3</option>
          </NativeSelect>
        </div>
      </section>
      <section aria-label="Checkbox">
        <h2>Checkbox</h2>
        <div className="preview-row">
          {([false, true, 'indeterminate'] as const).map((checked) => (
            <div className="grid gap-3" key={String(checked)}>
              <Checkbox
                defaultChecked={checked}
                label={`选项-${checked}`}
                description="点击标签切换"
              />
              <Checkbox defaultChecked={checked} disabled label={`禁用-${checked}`} />
            </div>
          ))}
        </div>
      </section>
      <section aria-label="Toggle">
        <h2>Toggle / ToggleGroup</h2>
        <div className="preview-row">
          {(['default', 'outline'] as const).flatMap((variant) =>
            (['sm', 'default'] as const).map((size) => (
              <Toggle
                key={variant + size}
                variant={variant}
                size={size}
                aria-label={`吸附-${variant}-${size}`}
              >
                <Magnet />
                吸附
              </Toggle>
            )),
          )}
          <Toggle disabled>禁用</Toggle>
          <Toggle defaultPressed>已选中</Toggle>
          <Toggle variant="outline" disabled aria-label="推按钮禁用-off">
            <Magnet />
            禁用推按钮
          </Toggle>
          <Toggle variant="outline" disabled defaultPressed aria-label="推按钮禁用-on">
            <Magnet />
            禁用已选
          </Toggle>
        </div>
        <div className="preview-row">
          {(['segmented', 'default'] as const).flatMap((variant) =>
            (['sm', 'default'] as const).map((size) => (
              <ToggleGroup
                key={variant + size}
                variant={variant}
                size={size}
                aria-label={`主题-${variant}-${size}`}
                value={themeValue}
                onValueChange={(value) => {
                  if (value) setThemeValue(value);
                }}
              >
                <ToggleGroupItem value="system">跟随系统</ToggleGroupItem>
                <ToggleGroupItem value="light">Light</ToggleGroupItem>
                <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
              </ToggleGroup>
            )),
          )}
        </div>
        <div className="preview-row">
          <ToggleGroup aria-label="四项" defaultValue="all">
            <ToggleGroupItem value="all">全部</ToggleGroupItem>
            <ToggleGroupItem value="image">图片</ToggleGroupItem>
            <ToggleGroupItem value="video">视频</ToggleGroupItem>
            <ToggleGroupItem value="audio" disabled>
              音频
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup aria-label="视图" defaultValue="list">
            <ToggleGroupItem value="list" aria-label="列表">
              <List />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="网格">
              <Grid2X2 />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </section>
      <section aria-label="Spinner">
        <h2>Spinner / Separator / Tooltip</h2>
        <div className="preview-row">
          {(['sm', 'default', 'lg'] as const).map((size) => (
            <Spinner key={size} size={size} aria-label={`加载-${size}`} />
          ))}
          <span className="inline-flex gap-3 rounded-control bg-accent p-3">
            {(['sm', 'default', 'lg'] as const).map((size) => (
              <Spinner key={size} size={size} tone="onAccent" aria-label={`强调色加载-${size}`} />
            ))}
          </span>
          <Separator orientation="vertical" />
          <Tooltip content="新建对话" shortcut="⌘N">
            <Button variant="ghost" aria-label="提示测试">
              <Plus />
            </Button>
          </Tooltip>
          <Tooltip
            content="每次最多六个资产，图片裁切帧会按选择顺序发送。较长说明会自动换行。"
            side="right"
          >
            <Button variant="secondary">长提示</Button>
          </Tooltip>
          <Button variant="secondary" onClick={() => inputRef.current?.focus()}>
            聚焦输入
          </Button>
          <Input aria-label="Ref 输入" ref={inputRef} />
        </div>
        <Separator />
        <div className="preview-row">
          <TooltipProvider>
            <TooltipRoot open>
              <TooltipTrigger asChild>
                <Button variant="ghost" aria-label="固定提示">
                  固定样张
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" shortcut="Esc">
                关闭面板
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        </div>
      </section>
      <OverlayPreview />
    </main>
  );
}
