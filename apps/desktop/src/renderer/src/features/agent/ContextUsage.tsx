import { useEffect, useId, useRef, useState } from 'react';

function tokens(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
  return String(value);
}

export function ContextUsage({
  used,
  capacity,
}: {
  used?: number | null;
  capacity?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const percent =
    used !== null && used !== undefined && capacity ? Math.round((used / capacity) * 100) : null;
  const label = `Context ${tokens(used)} / ${tokens(capacity)}${percent === null ? '' : ` (${percent}%)`}`;
  useEffect(() => {
    if (!open) return;
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
  return (
    <div className="composer-context" ref={ref} data-open={open}>
      <button
        type="button"
        ref={trigger}
        className="context-ring"
        aria-label="上下文占用"
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".25"
          />
          {percent !== null && (
            <circle
              className="context-used"
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${Math.min(100, percent) * 0.5655} 56.55`}
              transform="rotate(-90 12 12)"
            />
          )}
        </svg>
      </button>
      <div id={id} className="context-summary" role="tooltip">
        {label}
      </div>
    </div>
  );
}
