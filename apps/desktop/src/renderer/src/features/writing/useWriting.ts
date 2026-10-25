import { useConfirm } from '@jarvis/ui/components/AlertDialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUpdateGuard } from '../updates/use-update-guard';
import { z } from 'zod';
import { restoreTabs } from '../shell/tabs';
import { isWritingText, writingFileType } from '../../../../shared/writing';
import type {
  WritingEntry,
  WritingFile,
  WritingResult,
  WritingRoot,
} from '../../../../shared/writing';

export interface DocumentSession {
  id: string;
  rootId: string;
  path: string;
  content: string;
  savedContent: string;
  manualSave?: boolean;
  fileType?: import('../../../../shared/writing').WritingFileType;
  size?: number;
  mtime?: number;
  revision: string;
  status: 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
  error: string;
}
export function unwrap<T>(result: WritingResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const bridge = () => {
  if (!window.desktop?.writing) throw new Error('写作接口尚未加载，请完全退出并重新启动应用');
  return window.desktop.writing;
};
const idFor = (rootId: string, path: string) => rootId + ':' + path;
const tabsSchema = z.object({ paths: z.array(z.string()).max(30), active: z.string() });
export const parentPath = (path: string) => path.split('/').slice(0, -1).join('/');

export function useWriting() {
  const confirm = useConfirm();
  const reloading = useRef(new Set<string>());
  const [legacyKeys, setLegacyKeys] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [roots, setRoots] = useState<WritingRoot[]>([]);
  const [root, setRoot] = useState<WritingRoot | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  const [directories, setDirectories] = useState<Record<string, WritingEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedDirectory, setSelectedDirectory] = useState('');
  const [documents, setDocuments] = useState<DocumentSession[]>([]);
  const documentsRef = useRef(documents);
  const [activeId, setActiveId] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const saves = useRef(new Map<string, Promise<boolean>>());
  const restoring = useRef(false);

  const updateDocuments = useCallback(
    (change: (documents: DocumentSession[]) => DocumentSession[]) => {
      documentsRef.current = change(documentsRef.current);
      setDocuments(documentsRef.current);
    },
    [],
  );
  const update = useCallback(
    (id: string, change: Partial<DocumentSession>) => {
      updateDocuments((docs) => docs.map((d) => (d.id === id ? { ...d, ...change } : d)));
    },
    [updateDocuments],
  );
  const save = useCallback(
    (id: string): Promise<boolean> => {
      const pending = saves.current.get(id);
      if (pending) return pending;
      const doc = documentsRef.current.find((d) => d.id === id);
      if (!doc || doc.content === doc.savedContent) return Promise.resolve(true);
      if (doc.status === 'conflict') return Promise.resolve(false);
      update(id, { status: 'saving', error: '' });
      const task = (async () => {
        try {
          const result = await bridge().saveFile({
            rootId: doc.rootId,
            path: doc.path,
            content: doc.content,
            revision: doc.revision,
          });
          if (!result.ok) {
            update(id, {
              status: result.code === 'CONFLICT' ? 'conflict' : 'error',
              error: result.error,
            });
            return false;
          }
          const current = documentsRef.current.find((d) => d.id === id);
          update(id, {
            revision: result.value.revision,
            mtime: result.value.mtime,
            savedContent: doc.content,
            manualSave: current?.content === doc.content ? false : current?.manualSave,
            status: current?.content === doc.content ? 'saved' : 'dirty',
            error: '',
          });
          return true;
        } catch (error) {
          update(id, {
            status: 'error',
            error: error instanceof Error ? error.message : '保存失败',
          });
          return false;
        } finally {
          saves.current.delete(id);
        }
      })();
      saves.current.set(id, task);
      return task;
    },
    [update],
  );
  const flush = useCallback(async () => {
    for (const d of documentsRef.current) {
      if (d.content !== d.savedContent && !(await save(d.id))) return false;
      const current = documentsRef.current.find((item) => item.id === d.id);
      if (current && current.content !== current.savedContent && !(await save(d.id))) return false;
    }
    return documentsRef.current.every((d) => d.content === d.savedContent);
  }, [save]);
  useUpdateGuard(async () => {
    if (restoring.current || loading) throw new Error('写作空间正在读取文件，请稍后重试安装。');
    if (!(await flush())) throw new Error('写作文档尚未保存或存在冲突，请处理后再重启安装。');
  });
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const d of documentsRef.current)
        if (d.status === 'dirty' && !d.manualSave) void save(d.id);
    }, 800);
    return () => clearTimeout(timer);
  }, [documents, save]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (documentsRef.current.some((d) => d.content !== d.savedContent)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, []);
  const refresh = useCallback(async (path = '') => {
    const current = rootRef.current;
    if (!current) return;
    try {
      const entries = unwrap(await bridge().listDirectory({ rootId: current.id, path }));
      if (rootRef.current?.id === current.id)
        setDirectories((dirs) => ({ ...dirs, [path]: entries }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '目录读取失败');
    }
  }, []);
  const switchRoot = useCallback(
    async (next: WritingRoot) => {
      if (!(await flush())) {
        setNotice('请先处理未保存文档，再切换文件夹');
        return;
      }
      setLoading(true);
      restoring.current = true;
      try {
        const entries = unwrap(await bridge().listDirectory({ rootId: next.id, path: '' }));
        rootRef.current = next;
        setRoot(next);
        setDirectories({ '': entries });
        setExpanded(new Set());
        setSelectedDirectory('');
        setNotice('');
        try {
          localStorage.setItem('jarvis:writing-root', next.id);
        } catch {
          setNotice('无法记录最近目录，下次启动需要重新选择');
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '目录无法打开');
      } finally {
        restoring.current = false;
        setLoading(false);
      }
    },
    [flush, updateDocuments],
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const recent = unwrap(await bridge().getRoots());
        if (!active) return;
        setRoots(recent);
        const last = localStorage.getItem('jarvis:writing-root');
        const next = recent.find((r) => r.id === last);
        if (next) await switchRoot(next);
        const stored = restoreTabs(localStorage.getItem('jarvis:window-tabs'));
        const wanted = stored.tabs
          .filter((t) => t.kind === 'writing' && t.rootId && t.ref)
          .map((t) => ({ rootId: t.rootId!, path: t.ref! }));
        const legacyKeys: string[] = [];
        for (const r of recent) {
          const key = 'jarvis:writing-tabs:' + r.id,
            raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            const saved = tabsSchema.parse(JSON.parse(raw));
            for (const path of saved.paths)
              if (!wanted.some((d) => d.rootId === r.id && d.path === path))
                wanted.push({ rootId: r.id, path });
            legacyKeys.push(key);
          } catch {
            setNotice('旧文档标签无法读取，原记录已保留');
          }
        }
        for (const item of wanted) {
          if (!recent.some((r) => r.id === item.rootId)) continue;
          const file = isWritingText(item.path)
            ? await bridge().readFile(item)
            : { ok: true as const, value: { content: '', revision: '' } };
          if (!file.ok) {
            setNotice('部分上次打开的文档已失效，其他文档已恢复');
            continue;
          }
          updateDocuments((docs) => [
            ...docs,
            {
              ...item,
              id: idFor(item.rootId, item.path),
              ...file.value,
              fileType: writingFileType(item.path),
              savedContent: file.value.content,
              status: 'saved',
              error: '',
            },
          ]);
        }
        const activeTab = stored.tabs.find((t) => t.id === stored.activeId);
        const preferred =
          activeTab?.rootId && activeTab.ref ? idFor(activeTab.rootId, activeTab.ref) : '';
        setActiveId(
          documentsRef.current.find((d) => d.id === preferred)?.id ??
            documentsRef.current.at(-1)?.id ??
            '',
        );
        setLegacyKeys(legacyKeys);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : '读取目录记录失败');
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [switchRoot, updateDocuments]);
  const chooseDirectory = async () => {
    if (!(await flush())) {
      setNotice('请先处理未保存文档，再切换文件夹');
      return;
    }
    try {
      const chosen = unwrap(await bridge().chooseDirectory());
      if (!chosen) return;
      setRoots((recent) => [chosen, ...recent.filter((r) => r.id !== chosen.id)]);
      await switchRoot(chosen);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '打开目录失败');
    }
  };
  const openDocument = async (entry: WritingEntry, rootId = rootRef.current?.id) => {
    const current =
      roots.find((r) => r.id === rootId) ??
      (rootRef.current?.id === rootId ? rootRef.current : null);
    if (!current || entry.kind !== 'file') return;
    const id = idFor(current.id, entry.path);
    if (documentsRef.current.some((d) => d.id === id)) {
      setActiveId(id);
      return;
    }
    try {
      const file = isWritingText(entry.path)
        ? unwrap(await bridge().readFile({ rootId: current.id, path: entry.path }))
        : { content: '', revision: '' };
      updateDocuments((docs) =>
        docs.some((d) => d.id === id)
          ? docs
          : [
              ...docs,
              {
                id,
                rootId: current.id,
                path: entry.path,
                fileType: writingFileType(entry.path),
                size: entry.size,
                ...file,
                savedContent: file.content,
                status: 'saved',
                error: '',
              },
            ],
      );
      setActiveId(id);
      setSelectedDirectory(parentPath(entry.path));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '文档无法打开');
    }
  };
  const toggleDirectory = async (path: string) => {
    setSelectedDirectory(path);
    if (!expanded.has(path)) await refresh(path);
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const create = async (name: string, kind: 'file' | 'directory') => {
    const current = rootRef.current;
    if (!current) return false;
    try {
      const entry = unwrap(
        await bridge().createEntry({ rootId: current.id, path: selectedDirectory, name, kind }),
      );
      await refresh(selectedDirectory);
      if (selectedDirectory) setExpanded((prev) => new Set([...prev, selectedDirectory]));
      if (entry.kind === 'file') await openDocument(entry);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '新建失败');
      return false;
    }
  };
  const closing = useRef(new Set<string>());
  const closeDocument = async (id: string) => {
    if (closing.current.has(id)) return false;
    closing.current.add(id);
    try {
      const doc = documentsRef.current.find((d) => d.id === id);
      if (
        doc &&
        doc.content !== doc.savedContent &&
        !(await confirm({ title: '放弃未保存的更改？', message: '关闭文档将放弃尚未保存的更改。' }))
      )
        return false;
      const pending = saves.current.get(id);
      if (pending) await pending;
      const remaining = documentsRef.current.filter((d) => d.id !== id);
      updateDocuments(() => remaining);
      if (activeId === id) setActiveId(remaining.at(-1)?.id ?? '');
      return true;
    } finally {
      closing.current.delete(id);
    }
  };
  const reload = async (id: string) => {
    const doc = documentsRef.current.find((d) => d.id === id);
    if (!doc || reloading.current.has(id)) return;
    reloading.current.add(id);
    try {
      if (
        !(await confirm({
          title: '放弃更改并重新读取？',
          message: '重新读取将放弃当前尚未保存的更改，是否继续？',
        }))
      )
        return;
      const file = unwrap(await bridge().readFile({ rootId: doc.rootId, path: doc.path }));
      update(id, { ...file, savedContent: file.content, status: 'saved', error: '' });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '重新读取失败');
    } finally {
      reloading.current.delete(id);
    }
  };
  const saveCopy = async (id: string) => {
    const doc = documentsRef.current.find((d) => d.id === id);
    if (!doc) return;
    try {
      const name =
        doc.path.split('/').at(-1)?.replace(/\.md$/i, '') + '-副本-' + Date.now() + '.md';
      const entry = unwrap(
        await bridge().createEntry({
          rootId: doc.rootId,
          path: parentPath(doc.path),
          name,
          kind: 'file',
        }),
      );
      const empty = unwrap(await bridge().readFile({ rootId: doc.rootId, path: entry.path }));
      unwrap(
        await bridge().saveFile({
          rootId: doc.rootId,
          path: entry.path,
          content: doc.content,
          revision: empty.revision,
        }),
      );
      await openDocument(entry, doc.rootId);
      updateDocuments((docs) => docs.filter((d) => d.id !== id));
      await refresh(parentPath(doc.path));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '副本保存失败');
    }
  };
  useEffect(() => {
    const reading = new Set<string>();
    const check = async (rootId?: string, paths?: string[]) => {
      for (const doc of documentsRef.current) {
        if (rootId && doc.rootId !== rootId) continue;
        if (paths && !paths.includes('') && !paths.includes(doc.path)) continue;
        if (
          !isWritingText(doc.path) ||
          reading.has(doc.id) ||
          saves.current.has(doc.id) ||
          doc.status === 'conflict'
        )
          continue;
        reading.add(doc.id);
        try {
          const file: WritingFile = unwrap(
            await bridge().readFile({ rootId: doc.rootId, path: doc.path }),
          );
          const current = documentsRef.current.find((d) => d.id === doc.id);
          if (!current || saves.current.has(doc.id) || current.revision === file.revision) continue;
          if (current.content !== current.savedContent)
            update(doc.id, { status: 'conflict', error: '文件已在外部修改，当前编辑内容已保留' });
          else update(doc.id, { ...file, savedContent: file.content, status: 'saved', error: '' });
        } catch (error) {
          update(doc.id, {
            status: 'error',
            error: error instanceof Error ? error.message : '无法读取磁盘文档',
          });
        } finally {
          reading.delete(doc.id);
        }
      }
    };
    const off = bridge().onChanged(({ rootId, paths }) => void check(rootId, paths));
    const timer = window.setInterval(() => void check(), 2500);
    const focus = () => void check();
    window.addEventListener('focus', focus);
    return () => {
      off();
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [update]);
  const watchKey = JSON.stringify([
    ...new Set([root?.id, ...documents.map((d) => d.rootId)].filter((id): id is string => !!id)),
  ]);
  useEffect(() => {
    const ids = JSON.parse(watchKey) as string[];
    for (const rootId of ids) void bridge().watch({ rootId });
    return () => {
      for (const rootId of ids) void bridge().unwatch({ rootId });
    };
  }, [watchKey]);
  useEffect(
    () =>
      bridge().onChanged(({ rootId }) => {
        if (rootRef.current?.id !== rootId) return;
        void refresh();
        for (const path of expanded) void refresh(path);
      }),
    [refresh, expanded],
  );
  useEffect(
    () =>
      bridge().onRenamed(({ rootId, from, to }) => {
        const rename = (path: string) =>
          path === from || path.startsWith(from + '/') ? to + path.slice(from.length) : path;
        updateDocuments((docs) =>
          docs.map((d) =>
            d.rootId === rootId
              ? {
                  ...d,
                  path: rename(d.path),
                  id: idFor(rootId, rename(d.path)),
                  fileType: writingFileType(rename(d.path)),
                }
              : d,
          ),
        );
        setActiveId((id) =>
          id.startsWith(rootId + ':') ? idFor(rootId, rename(id.slice(rootId.length + 1))) : id,
        );
        if (rootRef.current?.id === rootId) {
          setExpanded((paths) => new Set([...paths].map(rename)));
          setSelectedDirectory(rename);
          void refresh();
        }
      }),
    [updateDocuments, refresh],
  );
  return {
    ready,
    legacyKeys,
    getDocuments: () => documentsRef.current,
    roots,
    root,
    directories,
    expanded,
    selectedDirectory,
    setSelectedDirectory,
    documents,
    activeId,
    setActiveId,
    notice,
    setNotice,
    loading,
    refresh,
    chooseDirectory,
    switchRoot,
    openDocument,
    toggleDirectory,
    create,
    closeDocument,
    save,
    flush,
    reload,
    saveCopy,
    change: (id: string, content: string, manualSave = false) => {
      const current = documentsRef.current.find((d) => d.id === id);
      if (current)
        update(id, {
          content,
          manualSave: manualSave || current.manualSave,
          status:
            current.status === 'conflict'
              ? 'conflict'
              : content === current.savedContent
                ? 'saved'
                : 'dirty',
        });
    },
  };
}
