import { useCallback, useLayoutEffect, type RefObject } from 'react';
export function useTextareaResize(
  node: RefObject<HTMLTextAreaElement | null>,
  enabled: boolean,
  value: unknown,
) {
  const resize = useCallback(() => {
    const element = node.current;
    if (!element) return;
    if (!enabled) {
      element.style.removeProperty('height');
      return;
    }
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
  }, [enabled, node]);
  useLayoutEffect(resize, [resize, value]);
  useLayoutEffect(() => {
    if (!enabled || !node.current) return;
    let width = node.current.clientWidth;
    const observer = new ResizeObserver(() => {
      const next = node.current?.clientWidth;
      if (next !== undefined && next !== width) {
        width = next;
        resize();
      }
    });
    observer.observe(node.current);
    return () => observer.disconnect();
  }, [enabled, node, resize]);
  return resize;
}
