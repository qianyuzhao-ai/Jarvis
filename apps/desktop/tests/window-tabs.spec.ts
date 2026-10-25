import { expect, test } from '@playwright/test';
import {
  initialTabs,
  openTabView,
  activateTab,
  closeTab,
  travelTab,
  restoreTabs,
  serializeTabs,
  pruneTabs,
} from '../src/renderer/src/features/shell/tabs';
test('window tabs deduplicate objects, isolate history and restore only references and preferences', () => {
  let s = initialTabs();
  const first = s.activeId;
  s = openTabView(s, { kind: 'canvas', ref: 'p1', title: 'Project 1' }, true);
  const canvas = s.activeId;
  s = openTabView(s, { kind: 'canvas', ref: 'p2', title: 'Project 2' });
  expect(s.tabs.find((t) => t.id === canvas)?.history.map((v) => v.ref)).toEqual(['p1', 'p2']);
  s = travelTab(s, -1);
  expect(s.tabs.find((t) => t.id === canvas)?.ref).toBe('p1');
  s = activateTab(s, first);
  s = openTabView(s, { kind: 'canvas', ref: 'p1', title: 'Project 1' }, true);
  expect(s.activeId).toBe(canvas);
  expect(s.tabs).toHaveLength(2);
  s = openTabView(s, { kind: 'settings', ref: 'general', title: '设置' }, true);
  s = openTabView(s, { kind: 'settings', ref: 'models', title: '设置' }, true);
  expect(s.tabs.filter((t) => t.kind === 'settings')).toHaveLength(1);
  s.tabs[1]!.rightPanelOpen = true;
  s.tabs[1]!.rightPanelWidth = 440;
  const restored = restoreTabs(serializeTabs(s));
  expect(restored.tabs[1]?.rightPanelWidth).toBe(440);
  expect(restored.tabs[1]?.rightPanelOpen).toBe(true);
  expect(restored.tabs.every((t) => t.history.length === 1 && t.cursor === 0)).toBe(true);
  s = pruneTabs(restored, (t) => t.kind !== 'canvas');
  expect(s.tabs.some((t) => t.kind === 'canvas')).toBe(false);
  for (const t of [...s.tabs]) s = closeTab(s, t.id);
  expect(s.tabs).toHaveLength(1);
  expect(s.tabs[0]?.kind).toBe('chat');
  expect(restoreTabs('{broken').tabs).toHaveLength(1);
});
test('writing identity includes its root and navigation cuts only the active forward history', () => {
  let s = initialTabs();
  s = openTabView(s, { kind: 'writing', ref: 'a.md', rootId: 'root-a', title: 'a.md' });
  s = openTabView(s, { kind: 'writing', ref: 'a.md', rootId: 'root-b', title: 'a.md' }, true);
  expect(s.tabs).toHaveLength(2);
  s = openTabView(s, { kind: 'writing', ref: 'b.md', rootId: 'root-b', title: 'b.md' });
  s = travelTab(s, -1);
  s = openTabView(s, { kind: 'writing', ref: 'c.md', rootId: 'root-b', title: 'c.md' });
  expect(s.tabs[1]?.history.map((v) => v.ref)).toEqual(['a.md', 'c.md']);
  expect(s.tabs[0]?.rootId).toBe('root-a');
});

test('deleting a project removes its open tab and back/forward history in other tabs', () => {
  let state = initialTabs();
  state = openTabView(state, { kind: 'canvas', ref: 'deleted', title: 'Delete me' });
  state = openTabView(state, { kind: 'canvas', ref: 'kept', title: 'Keep me' });
  state = openTabView(state, { kind: 'canvas', ref: 'deleted', title: 'Delete me' }, true);
  state = pruneTabs(state, (view) => view.kind !== 'canvas' || view.ref !== 'deleted');
  expect(state.tabs).toHaveLength(1);
  const tab = state.tabs[0]!;
  expect(tab.ref).toBe('kept');
  expect(tab.history.map((view) => view.ref)).toEqual([null, 'kept']);
  expect(tab.cursor).toBe(1);
  expect(travelTab(state, -1).tabs[0]?.ref).toBeNull();
  expect(travelTab(travelTab(state, -1), 1).tabs[0]?.ref).toBe('kept');
});

test('restored tabs accept valid long document paths and reject duplicate identities', () => {
  let state = initialTabs();
  state = openTabView(state, {
    kind: 'writing',
    ref: 'folder/'.repeat(300) + 'file.md',
    rootId: 'root',
    title: '文档'.repeat(120),
  });
  const tab = state.tabs[0]!;
  tab.rightPanelWidth = 500;
  const restored = restoreTabs(
    serializeTabs({ ...state, tabs: [tab, { ...tab, ref: 'other.md' }] }),
  );
  expect(restored.tabs).toHaveLength(1);
  expect(restored.tabs[0]?.ref).toBe(tab.ref);
  expect(restored.tabs[0]?.rightPanelWidth).toBe(400);
});
