import { z } from 'zod';

export const writingPathSchema = z.object({
  rootId: z.string().min(1).max(64),
  path: z.string().max(4096),
});
export const writingSaveSchema = writingPathSchema.extend({
  content: z.string().max(4 * 1024 * 1024),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});
export const writingCreateSchema = writingPathSchema.extend({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(['file', 'directory']),
});
export interface WritingRoot {
  id: string;
  name: string;
  directory: string;
}
export interface WritingEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
}
export interface WritingFile {
  content: string;
  revision: string;
}
export type WritingResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: 'CONFLICT' | 'IO' };
export interface WritingBridge {
  getRoots(): Promise<WritingResult<WritingRoot[]>>;
  chooseDirectory(): Promise<WritingResult<WritingRoot | null>>;
  listDirectory(request: { rootId: string; path: string }): Promise<WritingResult<WritingEntry[]>>;
  searchFiles(request: { rootId: string; query: string }): Promise<WritingResult<WritingEntry[]>>;
  readFile(request: { rootId: string; path: string }): Promise<WritingResult<WritingFile>>;
  saveFile(request: z.infer<typeof writingSaveSchema>): Promise<WritingResult<WritingFile>>;
  createEntry(request: z.infer<typeof writingCreateSchema>): Promise<WritingResult<WritingEntry>>;
}
