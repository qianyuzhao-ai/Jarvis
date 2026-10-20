import { useEffect, useState } from 'react';
export type ThemePreference = 'system' | 'light' | 'dark';
export function useResolvedTheme(preference: ThemePreference): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
