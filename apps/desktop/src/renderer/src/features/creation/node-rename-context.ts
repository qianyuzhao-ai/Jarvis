import { createContext } from 'react';

export const NodeRenameContext = createContext<((id: string, name: string) => void) | null>(null);
