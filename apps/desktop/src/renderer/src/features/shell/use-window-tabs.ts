import { useCallback, useEffect, useRef, useState } from 'react';
import { restoreTabs, serializeTabs, type WindowState } from './tabs';
export function useWindowTabs() {
  const [state, setState] = useState(() => restoreTabs(localStorage.getItem('jarvis:window-tabs')));
  const current = useRef(state);
  const [error, setError] = useState('');
  const change = useCallback((update: (s: WindowState) => WindowState) => {
    const next = update(current.current);
    current.current = next;
    setState(next);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('jarvis:window-tabs', serializeTabs(state));
    } catch {
      setError('窗口标签无法保存，下次启动可能无法恢复');
    }
  }, [state]);
  return { state, current, change, error };
}
