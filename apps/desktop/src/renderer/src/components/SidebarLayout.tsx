import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const minimum = 230;
const maximum = 320;
const clamp = (width: number) => Math.min(maximum, Math.max(minimum, Math.round(width)));
export function SidebarLayout({
  open,
  initialWidth,
  onWidthChange,
  sidebar,
  children,
}: {
  open: boolean;
  initialWidth: number;
  onWidthChange: (width: number) => void;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ pointer: number; x: number; start: number; current: number } | null>(null);
  const reduced = useReducedMotion();
  const transition =
    reduced || resizing ? { duration: 0 } : { type: 'spring' as const, duration: 0.26, bounce: 0 };
  function finish(cancel = false) {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    const next = cancel ? active.start : active.current;
    setWidth(next);
    setResizing(false);
    if (!cancel && next !== active.start) onWidthChange(next);
  }
  return (
    <div
      className="app-shell"
      data-collapsed={!open}
      data-resizing={resizing}
      style={{ '--sidebar-width': `${width}px` } as CSSProperties}
    >
      <motion.div
        className="sidebar-shell"
        initial={false}
        animate={{ x: open ? 0 : -width, opacity: open ? 1 : 0 }}
        transition={transition}
        inert={!open}
        aria-hidden={!open}
      >
        {sidebar}
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="调整侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={minimum}
          aria-valuemax={maximum}
          aria-valuenow={width}
          aria-valuetext={`${width} 像素`}
          tabIndex={open ? 0 : -1}
          title="拖动调整宽度，双击恢复默认宽度"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              start: width,
              current: width,
            };
            setResizing(true);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.pointer !== event.pointerId) return;
            const next = clamp(active.start + event.clientX - active.x);
            active.current = next;
            setWidth(next);
          }}
          onPointerUp={() => finish()}
          onPointerCancel={() => finish(true)}
          onLostPointerCapture={() => finish()}
          onDoubleClick={() => {
            setWidth(minimum);
            onWidthChange(minimum);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              finish(true);
              return;
            }
            let next = width;
            if (event.key === 'ArrowLeft') next -= event.shiftKey ? 1 : 10;
            else if (event.key === 'ArrowRight') next += event.shiftKey ? 1 : 10;
            else if (event.key === 'Home') next = minimum;
            else if (event.key === 'End') next = maximum;
            else return;
            event.preventDefault();
            next = clamp(next);
            setWidth(next);
            onWidthChange(next);
          }}
        />
      </motion.div>
      <motion.main
        className="workspace"
        initial={false}
        layout={!resizing && !reduced}
        transition={{ layout: transition }}
        style={{ marginLeft: open ? width : 0 }}
      >
        <motion.div
          className="workspace-content"
          layout={!resizing && !reduced}
          transition={{ layout: transition }}
        >
          {children}
        </motion.div>
      </motion.main>
    </div>
  );
}
