import type { EditorState as SourceState } from '@codemirror/state';
import type { EditorState as BlockState } from '@tiptap/pm/state';
export interface BufferSelection {
  from: number;
  to: number;
}
export interface ExternalEdit {
  runId?: string;
  startedAt?: number;
  first?: boolean;
  undo?: boolean;
}
export interface BufferView {
  id: string;
  content(): string;
  getSelection(): BufferSelection;
  setSelection(selection: BufferSelection): void;
  applyExternal(content: string, meta?: ExternalEdit): void;
  finishAgent(): void;
  agentRun(): string | null;
  focus(): void;
  scrollTo(offset: number): void;
}
export function createViewCache() {
  return {
    generations: new Map<string, number>(),
    source: new Map<string, { state: SourceState; scroll: number }>(),
    blocks: new Map<string, { state: BlockState; scroll: number }>(),
    selections: new Map<string, BufferSelection>(),
  };
}
export type ViewCache = ReturnType<typeof createViewCache>;
export function clearViewCache(cache: ViewCache, id: string) {
  cache.generations.set(id, (cache.generations.get(id) ?? 0) + 1);
  cache.source.delete(id);
  cache.blocks.delete(id);
}
