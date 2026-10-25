import { z } from 'zod';

export type WritingFileType = 'markdown' | 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary';
const extensions: Record<Exclude<WritingFileType, 'binary'>, string[]> = {
  markdown: ['md', 'markdown'],
  text: 'txt json yaml yml toml csv tsv log ini xml js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp css scss html sh zsh sql'.split(
    ' ',
  ),
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
  pdf: ['pdf'],
  audio: ['mp3', 'wav', 'm4a', 'ogg'],
  video: ['mp4', 'webm', 'mov'],
};
export function writingFileType(name: string): WritingFileType {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  for (const [type, values] of Object.entries(extensions))
    if (name.includes('.') && values.includes(extension)) return type as WritingFileType;
  return 'binary';
}
export const isWritingText = (name: string) => ['markdown', 'text'].includes(writingFileType(name));
export function validateEntryName(input: string) {
  const name = input.trim();
  if (
    !name ||
    name.startsWith('.') ||
    /[<>:"/\\|?*]/.test(name) ||
    Array.from(name).some((c) => c.charCodeAt(0) < 32) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)
  )
    throw new Error('名称包含不支持的字符');
  if (new TextEncoder().encode(name).length > 240) throw new Error('名称过长，请使用更短的文件名');
  return name;
}
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
export const writingRenameSchema = writingPathSchema.extend({ name: z.string().min(1).max(240) });
export const writingMoveSchema = writingPathSchema.extend({ targetDir: z.string().max(4096) });
export const writingTrashSchema = writingPathSchema;
export const writingRevealSchema = writingPathSchema;
export const writingAssetSchema = z.object({
  rootId: z.string().min(1).max(64),
  documentPath: z.string().min(1).max(4096),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.length > 0 && bytes.length <= 10 * 1024 * 1024),
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
  fileType?: WritingFileType;
  size?: number;
  mtime?: number;
}
export interface WritingFile {
  mtime?: number;
  content: string;
  revision: string;
}
export type WritingResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: 'CONFLICT' | 'IO' };
export interface WritingChanged {
  rootId: string;
  paths: string[];
}
export interface WritingRenamed {
  rootId: string;
  from: string;
  to: string;
}
export interface WritingBridge {
  rename(request: z.infer<typeof writingRenameSchema>): Promise<WritingResult<WritingEntry>>;
  move(request: z.infer<typeof writingMoveSchema>): Promise<WritingResult<WritingEntry>>;
  duplicate(request: z.infer<typeof writingPathSchema>): Promise<WritingResult<WritingEntry>>;
  trash(request: z.infer<typeof writingPathSchema>): Promise<WritingResult<void>>;
  reveal(request: z.infer<typeof writingPathSchema>): Promise<WritingResult<void>>;
  saveAsset(request: z.infer<typeof writingAssetSchema>): Promise<WritingResult<string>>;
  watch(request: { rootId: string }): Promise<WritingResult<boolean>>;
  unwatch(request: { rootId: string }): Promise<WritingResult<void>>;
  onChanged(listener: (event: WritingChanged) => void): () => void;
  onRenamed(listener: (event: WritingRenamed) => void): () => void;
  getRoots(): Promise<WritingResult<WritingRoot[]>>;
  chooseDirectory(): Promise<WritingResult<WritingRoot | null>>;
  listDirectory(request: { rootId: string; path: string }): Promise<WritingResult<WritingEntry[]>>;
  searchFiles(request: { rootId: string; query: string }): Promise<WritingResult<WritingEntry[]>>;
  readFile(request: { rootId: string; path: string }): Promise<WritingResult<WritingFile>>;
  saveFile(request: z.infer<typeof writingSaveSchema>): Promise<WritingResult<WritingFile>>;
  createEntry(request: z.infer<typeof writingCreateSchema>): Promise<WritingResult<WritingEntry>>;
}
