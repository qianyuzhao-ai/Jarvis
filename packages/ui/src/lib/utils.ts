import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'large-title',
        'title-1',
        'title-2',
        'title-3',
        'headline',
        'body',
        'body-relaxed',
        'callout',
        'subheadline',
        'footnote',
      ],
    },
  },
});
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
