import * as Primitive from '@radix-ui/react-tabs';
import { cva } from 'class-variance-authority';
import { createContext, useContext, type ComponentProps } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './Button';
type Appearance = 'segment' | 'underline';
const AppearanceContext = createContext<Appearance>('segment');
export function Tabs({
  appearance = 'segment',
  ...props
}: ComponentProps<typeof Primitive.Root> & { appearance?: Appearance }) {
  return (
    <AppearanceContext.Provider value={appearance}>
      <Primitive.Root {...props} data-ui="tabs" data-appearance={appearance} />
    </AppearanceContext.Provider>
  );
}
const list = cva('flex items-center', {
  variants: {
    appearance: {
      segment: 'w-fit rounded-control bg-fill p-0.5',
      underline: 'gap-1 border-b border-separator',
    },
  },
});
export function TabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  const appearance = useContext(AppearanceContext);
  return (
    <Primitive.List
      {...props}
      data-ui="tabs-list"
      data-appearance={appearance}
      className={cn(list({ appearance }), className)}
    />
  );
}
const trigger = cva(
  'ui-tab relative inline-flex cursor-default items-center justify-center gap-1 bg-transparent text-fg-secondary',
  {
    variants: {
      appearance: {
        segment: 'h-(--control-h-small) rounded-small px-3 text-callout',
        underline: 'h-(--control-h-large) px-2 text-body',
      },
    },
  },
);
export function TabsTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  const appearance = useContext(AppearanceContext);
  return (
    <Primitive.Trigger
      {...props}
      data-ui="tab"
      data-appearance={appearance}
      className={cn(trigger({ appearance }), className)}
    />
  );
}
export function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Content {...props} data-ui="tab-panel" className={cn('min-w-0', className)} />;
}
export function TabsClose({
  name,
  className,
  ...props
}: ComponentProps<typeof Button> & { name: string }) {
  return (
    <Button
      {...props}
      variant="ghost"
      size="icon-xs"
      aria-label={`关闭 ${name}`}
      className={cn('text-fg-tertiary', className)}
    >
      <X />
    </Button>
  );
}
