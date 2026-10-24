import { createContext } from 'react';
export const NodeActionsContext = createContext<{
  generate: (id: string) => void;
  details: (id: string) => void;
  measure: (id: string, height: number) => void;
} | null>(null);
export const mediaHeight = (width: number, height: number) =>
  width > 0 && height > 0 ? Math.round(Math.max(180, Math.min(320, (320 * height) / width))) : 180;
export const mediaTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
