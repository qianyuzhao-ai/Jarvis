import * as Primitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from '@jarvis/ui/icons';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
export const DropdownMenu = Primitive.Root;
export function DropdownMenuTrigger({
  className,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger {...props} className={cn('cursor-default', className)} />;
}
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuSub = Primitive.Sub;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;
const panel = 'ui-floating ui-menu rounded-panel bg-surface-raised p-1 text-fg shadow-popover';
const item =
  'ui-menu-item relative flex cursor-default items-center gap-2 rounded-small px-2 text-body';
export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        sideOffset={sideOffset}
        data-ui="menu"
        className={cn(panel, className)}
      />
    </Primitive.Portal>
  );
}
export function DropdownMenuSubContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.Portal>
      <Primitive.SubContent
        {...props}
        sideOffset={sideOffset}
        data-ui="menu"
        className={cn(panel, className)}
      />
    </Primitive.Portal>
  );
}
export function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: ComponentProps<typeof Primitive.Item> & { destructive?: boolean }) {
  return (
    <Primitive.Item
      {...props}
      data-ui="menu-item"
      data-destructive={destructive}
      className={cn(item, className)}
    />
  );
}
export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.SubTrigger>) {
  return (
    <Primitive.SubTrigger {...props} data-ui="menu-item" className={cn(item, className)}>
      {children}
      <ChevronRight className="ui-menu-chevron ml-auto" aria-hidden="true" />
    </Primitive.SubTrigger>
  );
}
export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem {...props} data-ui="menu-item" className={cn(item, className)}>
      <Primitive.ItemIndicator className="ui-menu-check">
        <Check aria-hidden="true" />
      </Primitive.ItemIndicator>
      {children}
    </Primitive.CheckboxItem>
  );
}
/** `indicator="trailing"` marks the chosen item with a check at the right edge instead of a dot. */
export function DropdownMenuRadioItem({
  className,
  children,
  indicator = 'leading',
  ...props
}: ComponentProps<typeof Primitive.RadioItem> & { indicator?: 'leading' | 'trailing' }) {
  return (
    <Primitive.RadioItem
      {...props}
      data-ui="menu-item"
      data-indicator={indicator}
      className={cn(item, className)}
    >
      {indicator === 'leading' && (
        <Primitive.ItemIndicator className="ui-menu-check">
          <Circle aria-hidden="true" />
        </Primitive.ItemIndicator>
      )}
      {children}
      {indicator === 'trailing' && (
        <Primitive.ItemIndicator className="ui-menu-check-trailing">
          <Check aria-hidden="true" />
        </Primitive.ItemIndicator>
      )}
    </Primitive.RadioItem>
  );
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      {...props}
      className={cn('px-2 py-1 text-subheadline text-fg-secondary', className)}
    />
  );
}
export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator {...props} className={cn('mx-2 my-1 h-px bg-separator', className)} />
  );
}
export function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return <span {...props} className={cn('ml-auto text-callout text-fg-secondary', className)} />;
}
