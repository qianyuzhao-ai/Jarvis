import { z } from 'zod';
export const tabViewSchema = z.object({
  kind: z.enum(['chat', 'canvas', 'writing', 'settings', 'calendar']),
  ref: z.string().max(4096).nullable(),
  title: z.string().max(500),
  rootId: z.string().optional(),
  fileType: z.enum(['markdown', 'text', 'image', 'pdf', 'audio', 'video', 'binary']).optional(),
});
export type TabView = z.infer<typeof tabViewSchema>;
export type WindowTab = TabView & {
  id: string;
  history: TabView[];
  cursor: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  visited: number;
};
export type WindowState = { tabs: WindowTab[]; activeId: string; sidebarOpen: boolean };
export const blankView: TabView = { kind: 'chat', ref: null, title: '新对话' };
export function makeTab(view: TabView = blankView): WindowTab {
  return {
    ...view,
    id: crypto.randomUUID(),
    history: [view],
    cursor: 0,
    rightPanelOpen: false,
    rightPanelWidth: 360,
    visited: Date.now(),
  };
}
export function initialTabs(): WindowState {
  const tab = makeTab();
  return { tabs: [tab], activeId: tab.id, sidebarOpen: true };
}
export function sameObject(a: TabView, b: TabView) {
  return (
    a.kind === b.kind &&
    (a.kind === 'settings' ||
      a.kind === 'calendar' ||
      (a.ref === b.ref && a.rootId === b.rootId && (a.ref !== null || a.kind !== 'chat')))
  );
}
export function activateTab(state: WindowState, id: string): WindowState {
  if (!state.tabs.some((t) => t.id === id)) return state;
  return {
    ...state,
    activeId: id,
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, visited: Date.now() } : t)),
  };
}
export function openTabView(state: WindowState, view: TabView, newTab = false): WindowState {
  const existing = state.tabs.find((t) => sameObject(t, view));
  if (existing && existing.kind !== 'settings') return activateTab(state, existing.id);
  const id = existing?.id ?? state.activeId;
  if (newTab && !existing) {
    const tab = makeTab(view);
    return { ...state, activeId: tab.id, tabs: [...state.tabs, tab] };
  }
  return {
    ...state,
    activeId: id,
    tabs: state.tabs.map((t) =>
      t.id !== id
        ? t
        : {
            ...t,
            ...view,
            visited: Date.now(),
            history: [...t.history.slice(0, t.cursor + 1), view],
            cursor: t.cursor + 1,
          },
    ),
  };
}
export function closeTab(state: WindowState, id: string): WindowState {
  const index = state.tabs.findIndex((t) => t.id === id);
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (!tabs.length) return { ...initialTabs(), sidebarOpen: state.sidebarOpen };
  return {
    ...state,
    tabs,
    activeId: state.activeId === id ? tabs[Math.min(index, tabs.length - 1)]!.id : state.activeId,
  };
}
export function travelTab(state: WindowState, offset: number): WindowState {
  const tab = state.tabs.find((t) => t.id === state.activeId);
  if (!tab) return state;
  const cursor = tab.cursor + offset,
    view = tab.history[cursor];
  if (!view) return state;
  const existing = state.tabs.find((t) => t.id !== tab.id && sameObject(t, view));
  if (existing) return activateTab(state, existing.id);
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === tab.id ? { ...t, ...view, cursor } : t)),
  };
}
const storedSchema = z.object({
  tabs: z
    .array(
      tabViewSchema.extend({
        id: z.string().uuid(),
        rightPanelOpen: z.boolean(),
        rightPanelWidth: z.number().min(240).max(560),
        visited: z.number(),
      }),
    )
    .min(1)
    .max(100),
  activeId: z.string(),
  sidebarOpen: z.boolean().default(true),
});
export function serializeTabs(state: WindowState) {
  return JSON.stringify({
    ...state,
    tabs: state.tabs.map(({ history: _history, cursor: _cursor, ...tab }) => tab),
  });
}
export function restoreTabs(raw: string | null): WindowState {
  if (!raw) return initialTabs();
  try {
    const stored = storedSchema.parse(JSON.parse(raw));
    const seen: TabView[] = [];
    const seenIds = new Set<string>();
    const tabs = stored.tabs
      .filter((t) => {
        if (seenIds.has(t.id) || seen.some((v) => sameObject(v, t))) return false;
        seenIds.add(t.id);
        seen.push(t);
        return true;
      })
      .map((t) => ({
        ...t,
        rightPanelWidth:
          t.kind === 'writing'
            ? Math.min(400, Math.max(240, t.rightPanelWidth))
            : Math.min(560, Math.max(340, t.rightPanelWidth)),
        history: [{ kind: t.kind, ref: t.ref, title: t.title, rootId: t.rootId }],
        cursor: 0,
      }));
    return {
      ...stored,
      tabs,
      activeId: tabs.some((t) => t.id === stored.activeId) ? stored.activeId : tabs[0]!.id,
    };
  } catch {
    return initialTabs();
  }
}
export function pruneTabs(state: WindowState, exists: (view: TabView) => boolean): WindowState {
  let next = state;
  for (const tab of state.tabs) if (!exists(tab)) next = closeTab(next, tab.id);
  const tabs = next.tabs.map((tab) => {
    const history = tab.history.filter(exists);
    return history.length === tab.history.length
      ? tab
      : { ...tab, history, cursor: tab.history.slice(0, tab.cursor).filter(exists).length };
  });
  if (tabs.some((tab, index) => tab !== next.tabs[index])) next = { ...next, tabs };
  return next;
}
