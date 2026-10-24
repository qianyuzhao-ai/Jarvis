import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { Tooltip } from '@jarvis/ui/components/Tooltip';
import type { ReactNode } from 'react';
export function ParameterControl({
  label,
  value,
  display,
  disabled,
  onChange,
  children,
  model = false,
  hint,
}: {
  label: string;
  value: string;
  display: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
  model?: boolean;
  hint?: string;
}) {
  return (
    <Tooltip content={hint ?? label}>
      <label
        data-testid="parameter-control"
        data-model={model}
        className={`parameter-control ${model ? 'parameter-control-model' : ''}`}
        data-disabled={disabled}
        title={hint ?? `${label}：${display}`}
      >
        <NativeSelect
          appearance="compact"
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </NativeSelect>
      </label>
    </Tooltip>
  );
}
