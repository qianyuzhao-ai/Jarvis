import { useEffect, useRef, useState } from 'react';

export function ModelPicker({
  model,
  disabled,
  onChange,
}: {
  model: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(model);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  function apply() {
    if (!value.trim()) return;
    onChange(value.trim());
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className="composer-model" ref={ref}>
      <button
        type="button"
        ref={trigger}
        className="model-trigger"
        disabled={disabled}
        title={model || '先配置模型'}
        aria-expanded={open}
        onClick={() => {
          setValue(model);
          setOpen(!open);
        }}
      >
        <span>{model || '先配置模型'}</span>
      </button>
      {open && (
        <div className="composer-popover model-popover">
          <label htmlFor="chat-model">模型 ID</label>
          <input
            ref={input}
            id="chat-model"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={200}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                e.preventDefault();
                apply();
              }
            }}
          />
          <button type="button" disabled={!value.trim()} onClick={apply}>
            使用此模型
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}
