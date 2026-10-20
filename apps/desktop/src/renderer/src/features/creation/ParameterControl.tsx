import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
export function ParameterControl({
  label,
  value,
  display,
  disabled,
  onChange,
  children,
  icon,
  model = false,
  hint,
}: {
  label: string;
  value: string;
  display: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
  icon?: ReactNode;
  model?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={`parameter-control ${model ? 'parameter-control-model' : ''}`}
      data-disabled={disabled}
      title={hint ?? label}
    >
      <span className="parameter-control-value">
        {icon}
        <span>{display}</span>
        <ChevronDown size={12} />
      </span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
