import * as Primitive from '@radix-ui/react-separator';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
export function Separator({
  orientation = 'horizontal',
  decorative = true,
  className,
  ...props
}: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      {...props}
      data-ui="separator"
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-separator',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-4 w-px self-stretch',
        className,
      )}
    />
  );
}
