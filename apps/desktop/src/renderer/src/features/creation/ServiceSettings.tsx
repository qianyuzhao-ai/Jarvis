import { Button } from '@jarvis/ui/components/Button';
import { Field, FieldLabel } from '@jarvis/ui/components/Field';
import { Input } from '@jarvis/ui/components/Input';
import { Textarea } from '@jarvis/ui/components/Textarea';
import { useState } from 'react';
import type { Settings } from './types';
import { loginAddress, loginOrigins } from '../../../../shared/generation-login';
import { PlatformLoginControls } from './PlatformLoginControls';
const fields = [
  ['reqFrom', 'req_from'],
  ['generateUrl', '生成任务地址'],
  ['imageUploadUrl', 'upload 地址'],
  ['audioUploadUrl', 'upload-media 地址'],
  ['loginUrl', '平台登录地址'],
] as const;
export function ServiceSettings({
  value,
  onSave,
  onDirtyChange,
  status,
}: {
  value: Settings;
  onSave: (next: Settings) => void;
  onDirtyChange: (dirty: boolean) => void;
  status: string;
}) {
  const [draft, setDraft] = useState(value);
  const [errors, setErrors] = useState<Partial<Record<keyof Settings, string>>>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...draft };
    const issues: typeof errors = {};
    for (const [key] of fields) {
      next[key] = (next[key] ?? '').trim();
      if (key === 'reqFrom') {
        if (next[key].length > 100) issues[key] = '最多 100 个字符';
        continue;
      }
      if (!next[key]) continue;
      try {
        if (key === 'loginUrl') {
          next.loginUrl = loginAddress(next.loginUrl ?? '').href;
          continue;
        }
        const url = new URL(next[key]);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          !url.hostname ||
          url.username ||
          url.password
        )
          throw new Error();
        next[key] = next[key].replace(/\/+$/, '');
      } catch {
        issues[key] = '请输入完整的 http:// 或 https:// 地址，不包含账号密码';
      }
    }
    next.loginDomains = (next.loginDomains ?? '').trim();
    if (next.loginUrl || next.loginDomains) {
      if (!next.generateUrl) issues.generateUrl = '请先填写生成任务地址';
      else {
        try {
          loginOrigins(next.generateUrl, next.loginUrl ?? '', next.loginDomains);
        } catch (error) {
          issues.loginDomains = error instanceof Error ? error.message : '登录域名无效';
        }
      }
    }
    setErrors(issues);
    if (Object.keys(issues).length) return;
    onSave(next);
    setDraft(next);
    onDirtyChange(false);
  }
  return (
    <form
      data-testid="settings-form"
      className="v1-settings mx-auto flex w-full max-w-175 min-w-0 flex-col px-10 pt-6 pb-10 font-sans text-body text-fg"
      onSubmit={submit}
      noValidate
    >
      <div className="mb-6">
        <h1 className="text-title-1">配置内网服务</h1>
        <p className="mt-2 text-body-relaxed text-fg-secondary">
          请手动填写请求来源标识及实际服务地址，应用不预设内网地址。
        </p>
      </div>
      {fields.map(([key, label]) => (
        <Field
          orientation="horizontal"
          controlId={key}
          key={key}
          error={errors[key]}
          className="border-b border-separator py-3"
        >
          <FieldLabel>{label}</FieldLabel>
          <Input
            id={key}
            name={key}
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder={`请输入 ${label}`}
            value={draft[key] ?? ''}
            onChange={(e) => {
              const next = { ...draft, [key]: e.target.value };
              setDraft(next);
              onDirtyChange(JSON.stringify(next) !== JSON.stringify(value));
              setErrors({ ...errors, [key]: undefined });
            }}
          />
        </Field>
      ))}
      <Field
        orientation="horizontal"
        controlId="loginDomains"
        error={errors.loginDomains}
        description="平台登录地址填写平台首页或登录入口；这里填写跳转经过的其他域名，每行一个（也可用逗号分隔）。平台自身域名自动允许。"
        className="border-b border-separator py-3"
      >
        <FieldLabel>允许的统一登录域名</FieldLabel>
        <Textarea
          autoResize
          id="loginDomains"
          value={draft.loginDomains ?? ''}
          placeholder="请输入登录跳转经过的域名，每行一个"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            const next = { ...draft, loginDomains: event.target.value };
            setDraft(next);
            setErrors({ ...errors, loginDomains: undefined });
            onDirtyChange(JSON.stringify(next) !== JSON.stringify(value));
          }}
        />
      </Field>
      <PlatformLoginControls settings={value} dirty={dirty} />
      <div data-testid="form-actions" className="mt-6 flex items-center justify-end gap-3">
        <span role="status" className="mr-auto text-subheadline text-fg-secondary">
          {dirty ? '更改尚未保存' : status}
        </span>
        <Button
          variant="secondary"
          disabled={!dirty}
          onClick={() => {
            setDraft(value);
            setErrors({});
            onDirtyChange(false);
          }}
        >
          取消
        </Button>
        <Button type="submit" disabled={!dirty}>
          保存更改
        </Button>
      </div>
    </form>
  );
}
