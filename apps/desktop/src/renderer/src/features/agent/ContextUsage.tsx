import { useState } from 'react';
import { Button } from '@jarvis/ui/components/Button';
import { ProgressField, ProgressRing } from '@jarvis/ui/components/Progress';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
} from '@jarvis/ui/components/Popover';
import { Tooltip } from '@jarvis/ui/components/Tooltip';

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
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const percent = used != null && capacity ? Math.round((used / capacity) * 100) : null;
  const label = `Context ${tokens(used)} / ${tokens(capacity)}${percent === null ? '' : ` (${percent}%)`}`;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setTooltipOpen(false);
      }}
    >
      <Tooltip content={label} open={!open && tooltipOpen} onOpenChange={setTooltipOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="上下文占用">
            <ProgressRing
              value={percent ?? 0}
              tone={percent !== null && percent >= 90 ? 'danger' : 'accent'}
              aria-label="上下文使用进度"
            />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="end" aria-label="上下文用量" className="w-70">
        <PopoverTitle>上下文用量</PopoverTitle>
        <ProgressField
          size="small"
          label="已使用 / 上下文容量"
          value={percent}
          valueLabel={percent === null ? '未知' : `${percent}%`}
          hint={label}
        />
        <PopoverDescription>系统指令、消息与工具结果都会计入上下文。</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
