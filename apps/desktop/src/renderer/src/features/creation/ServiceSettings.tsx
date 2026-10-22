import { useState } from 'react';
import type { Settings } from './types';
const fields = [
  ['reqFrom', 'req_from'],
  ['generateUrl', 'aigc 地址'],
  ['imageUploadUrl', 'upload 地址'],
  ['audioUploadUrl', 'upload-media 地址'],
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
      next[key] = next[key].trim();
      if (key === 'reqFrom') {
        if (next[key].length > 100) issues[key] = '最多 100 个字符';
        continue;
      }
      if (!next[key]) continue;
      try {
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
    setErrors(issues);
    if (Object.keys(issues).length) return;
    onSave(next);
    setDraft(next);
    onDirtyChange(false);
  }
  return (
    <form className="settings-page settings-form" onSubmit={submit} noValidate>
      <div>
        <h1>配置内网服务</h1>
        <p>填写请求来源标识及各服务地址。</p>
      </div>
      {fields.map(([key, label]) => (
        <label className="settings-row form-field" key={key} htmlFor={key}>
          <span>{label}</span>
          <input
            id={key}
            name={key}
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder={`请输入 ${label}`}
            value={draft[key]}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={errors[key] ? `${key}-error` : undefined}
            onChange={(e) => {
              const next = { ...draft, [key]: e.target.value };
              setDraft(next);
              onDirtyChange(JSON.stringify(next) !== JSON.stringify(value));
              setErrors({ ...errors, [key]: undefined });
            }}
          />
          {errors[key] && (
            <small id={`${key}-error`} className="error-text">
              {errors[key]}
            </small>
          )}
        </label>
      ))}
      <div className="form-actions">
        <span role="status">{dirty ? '更改尚未保存' : status}</span>
        <button
          className="secondary-button"
          type="button"
          disabled={!dirty}
          onClick={() => {
            setDraft(value);
            setErrors({});
            onDirtyChange(false);
          }}
        >
          取消
        </button>
        <button className="primary-button" type="submit" disabled={!dirty}>
          保存更改
        </button>
      </div>
    </form>
  );
}
