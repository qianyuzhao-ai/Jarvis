import * as Primitive from '@radix-ui/react-toggle-group';
import { createContext, useContext, type ComponentProps } from 'react';
import { cn } from '../lib/utils';
type Options = { variant?: 'segmented' | 'default'; size?: 'sm' | 'default' };
const GroupContext = createContext<Options>({ variant: 'segmented', size: 'default' });
export type ToggleGroupProps = Omit<
  Extract<ComponentProps<typeof Primitive.Root>, { type: 'single' }>,
  'type'
> &
  Options & { type?: 'single' };
export function ToggleGroup({
  variant = 'segmented',
  size = 'default',
  className,
  children,
  ...props
}: ToggleGroupProps) {
  return (
    <GroupContext.Provider value={{ variant, size }}>
      <Primitive.Root
        {...props}
        type="single"
        data-ui="toggle-group"
        data-variant={variant}
        data-size={size}
        className={cn(
          'inline-flex w-fit items-center rounded-control',
          variant === 'segmented' ? 'bg-fill p-0.5' : 'gap-1',
          className,
        )}
      >
        {children}
      </Primitive.Root>
    </GroupContext.Provider>
  );
}
export function ToggleGroupItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  const { variant, size } = useContext(GroupContext);
  return (
    <Primitive.Item
      {...props}
      data-ui="toggle-item"
      data-variant={variant}
      data-size={size}
      className={cn(
        'ui-toggle-item inline-flex items-center justify-center gap-1 rounded-small px-3 text-fg-secondary',
        size === 'sm' ? 'h-(--control-h-mini) text-callout' : 'h-(--control-h-small) text-body',
        variant === 'default' &&
          (size === 'sm' ? 'h-(--control-h-small) px-2' : 'h-(--control-h-regular) px-2'),
        className,
      )}
    />
  );
}
