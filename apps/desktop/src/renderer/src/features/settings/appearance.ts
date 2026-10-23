import { type AppearanceBridge, normalizeAccentColor } from '../../../../shared/appearance';

type AppearanceRoot = {
  style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'>;
  dataset: DOMStringMap;
};
export function applyAccentColor(root: AppearanceRoot, value: unknown) {
  const color = normalizeAccentColor(value);
  if (color) {
    root.style.setProperty('--color-accent', `#${color}`);
    root.dataset.systemAccent = 'true';
  } else {
    root.style.removeProperty('--color-accent');
    delete root.dataset.systemAccent;
  }
}
export function subscribeAccentColor(bridge: AppearanceBridge | undefined, root: AppearanceRoot) {
  let active = true;
  let changed = false;
  const receive = (color: string | null) => {
    if (!active) return;
    changed = true;
    applyAccentColor(root, color);
  };
  const unsubscribe = bridge?.onAccentColor(receive);
  void bridge?.getAccentColor().then(
    (color) => {
      if (active && !changed) applyAccentColor(root, color);
    },
    () => {
      if (active && !changed) applyAccentColor(root, null);
    },
  );
  if (!bridge) applyAccentColor(root, null);
  return () => {
    active = false;
    unsubscribe?.();
  };
}
export function observeWindowFocus(root: AppearanceRoot, target: Window = window) {
  const focused = () => {
    root.dataset.windowActive = 'true';
  };
  const blurred = () => {
    root.dataset.windowActive = 'false';
  };
  root.dataset.windowActive = String(target.document.hasFocus());
  target.addEventListener('focus', focused);
  target.addEventListener('blur', blurred);
  return () => {
    target.removeEventListener('focus', focused);
    target.removeEventListener('blur', blurred);
  };
}
