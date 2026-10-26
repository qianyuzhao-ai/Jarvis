import { Button } from '@jarvis/ui/components/Button';
import { Toaster } from '@jarvis/ui/components/Toast';
import { Alert } from '@jarvis/ui/components/Alert';
import { ConfirmProvider, useConfirm } from '@jarvis/ui/components/AlertDialog';
import { subscribeAccentColor, observeWindowFocus } from './features/settings/appearance';
import { Suspense, lazy, useLayoutEffect, useCallback, useEffect, useState, useRef } from 'react';
import { MotionConfig } from 'motion/react';
import { AppShell } from './components/AppShell';
import { ShellSidebar } from './features/shell/ShellSidebar';
import {
  activateTab,
  closeTab,
  openTabView,
  travelTab,
  pruneTabs,
  serializeTabs,
  type TabView,
} from './features/shell/tabs';
import { useWindowTabs } from './features/shell/use-window-tabs';
import { GeneralSettings } from './features/settings/GeneralSettings';
import { AboutSettings } from './features/settings/AboutSettings';
import { useResolvedTheme } from './features/settings/theme';
import { Canvas } from './features/creation/Canvas';
import { ServiceSettings } from './features/creation/ServiceSettings';
import { CalendarSpace } from './features/calendar/CalendarSpace';
import { loadWorkspace } from './features/creation/workspace-load';
import type { ProjectRecord } from '../../shared/project';
import type { NavigationTarget } from '../../shared/agent';
import { createProject, type Project, type WorkspaceData } from './features/creation/types';
import { useWorkspace } from './features/creation/useWorkspace';
import { useGeneration } from './features/creation/useGeneration';
import { GenerationNotice } from './features/creation/GenerationNotice';
import { useAssetUpload } from './features/creation/useAssetUpload';
import { useOsSnapshot } from './features/agent/use-agent';
import { AgentTab } from './features/agent/AgentViews';
import { ProjectSidebar } from './features/agent/ProjectSidebar';
import { placeExists, placeOf, placeTitle } from './features/agent/os-view';
import { setThreadOpener } from './features/agent/open-thread';
import { ModelSettings } from './features/settings/ModelSettings';
import { PluginSettings } from './features/settings/PluginSettings';
import { useAppUpdates } from './features/updates/use-app-updates';
import { useUpdateGuard } from './features/updates/use-update-guard';
import { UpdateStatus } from './features/updates/UpdateStatus';
import { useWriting } from './features/writing/useWriting';
const WritingSpace = lazy(() =>
  import('./features/writing/WritingSpace').then((m) => ({ default: m.WritingSpace })),
);
type SettingsSection = 'general' | 'services' | 'models' | 'plugins' | 'about';
function Workbench({ initial }: { initial: { data: WorkspaceData; records: ProjectRecord[] } }) {
  const confirm = useConfirm();
  const updates = useAppUpdates();
  const { data, update, commit, hold, getCurrent, status, saveError } = useWorkspace(initial);
  const { generate, notice, dismissNotice } = useGeneration(data, commit, getCurrent);
  const importAssets = useAssetUpload(commit, getCurrent);
  const agent = useOsSnapshot();
  const writing = useWriting();
  const shell = useWindowTabs();
  const { state, change } = shell;
  const active = state.tabs.find((t) => t.id === state.activeId)!;
  const route = active.kind;
  const settingsSection = (active.ref ?? 'general') as SettingsSection;
  const [settingsDirty, setSettingsDirty] = useState(false);
  const leaving = useRef(false);
  const [leftHost, setLeftHost] = useState<HTMLDivElement | null>(null);
  const [rightHost, setRightHost] = useState<HTMLDivElement | null>(null);
  const theme = useResolvedTheme(data.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.platform = window.desktop?.platform ?? 'browser';
    const unsubscribe = subscribeAccentColor(window.desktop?.appearance, root);
    const stopFocus = observeWindowFocus(root);
    return () => {
      unsubscribe();
      stopFocus();
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useUpdateGuard(() => {
    if (settingsDirty) throw new Error('设置尚未保存，请先保存或取消更改，再重启安装。');
  });
  async function mayLeave() {
    if (leaving.current) return false;
    if (!settingsDirty) return true;
    leaving.current = true;
    try {
      const yes = await confirm({
        title: '放弃未保存的更改？',
        message: '更改尚未保存，确定放弃这些更改吗？',
      });
      if (yes) setSettingsDirty(false);
      return yes;
    } finally {
      leaving.current = false;
    }
  }
  function syncView(view: TabView) {
    if (view.kind === 'writing') {
      const doc = writing.documents.find((d) => d.path === view.ref && d.rootId === view.rootId);
      if (doc) writing.setActiveId(doc.id);
    }
  }
  async function open(view: TabView, newTab = false) {
    const current = shell.current.current.tabs.find((t) => t.id === shell.current.current.activeId);
    if (current?.kind === view.kind && current.ref === view.ref && view.kind !== 'chat' && !newTab)
      return;
    if (current?.kind === 'settings' && view.kind === 'settings' && current.ref === view.ref)
      return;
    if (!(await mayLeave())) return;
    change((s) => openTabView(s, view, newTab));
    syncView(view);
  }
  async function activate(id: string) {
    if (id === shell.current.current.activeId) return;
    if (!(await mayLeave())) return;
    const tab = shell.current.current.tabs.find((t) => t.id === id);
    if (!tab) return;
    change((s) => activateTab(s, id));
    syncView(tab);
  }
  async function close(id: string) {
    const tab = shell.current.current.tabs.find((t) => t.id === id);
    if (!tab || (tab.kind === 'settings' && !(await mayLeave()))) return;
    if (tab.kind === 'writing' && tab.ref) {
      const doc = writing.documents.find((d) => d.rootId === tab.rootId && d.path === tab.ref);
      if (doc && !(await writing.closeDocument(doc.id))) return;
    }
    change((s) => closeTab(s, id));
    syncView(shell.current.current.tabs.find((t) => t.id === shell.current.current.activeId)!);
  }
  async function travel(offset: number) {
    if (!(await mayLeave())) return;
    change((s) => travelTab(s, offset));
    syncView(shell.current.current.tabs.find((t) => t.id === shell.current.current.activeId)!);
  }
  const projectView = (p: Project): TabView => ({ kind: 'canvas', ref: p.id, title: p.name });
  /**
   * Opens what the main Agent asked for, a project (possibly just created) or a document, in a new
   * tab so the conversation's tab stays where it is.
   */
  const navigate = useRef<(target: NavigationTarget) => Promise<void>>(async () => {});
  navigate.current = async (target) => {
    if (target.kind === 'canvas') {
      // A project the Agent just created reaches this window with the store's next push.
      let project = getCurrent().projects.find((p) => p.id === target.projectId);
      for (let i = 0; i < 30 && !project; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        project = getCurrent().projects.find((p) => p.id === target.projectId);
      }
      if (!project) return agent.setError('要打开的项目还没有同步到窗口，请稍后从画布列表打开');
      await open(projectView(project), true);
      return;
    }
    const root = writing.roots.find((r) => r.id === target.rootId);
    if (!root) return agent.setError('没有这个写作文件夹');
    if (writing.root?.id !== target.rootId) await writing.switchRoot(root);
    const name = target.path.split('/').at(-1) ?? target.path;
    await writing.openDocument({ kind: 'file', path: target.path, name });
    await open({ kind: 'writing', ref: target.path, rootId: target.rootId, title: name }, true);
  };
  useEffect(
    () =>
      window.desktop?.os.onNavigate((target) => {
        void navigate
          .current(target)
          .catch((error: unknown) =>
            agent.setError(error instanceof Error ? error.message : '打开失败'),
          );
      }),
    [agent.setError],
  );
  async function space(kind: TabView['kind']) {
    const recent = [...shell.current.current.tabs]
      .filter((t) => t.kind === kind)
      .sort((a, b) => b.visited - a.visited)[0];
    if (recent) return activate(recent.id);
    const project = [...data.projects].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const doc = writing.documents.find((d) => d.id === writing.activeId);
    return open(
      kind === 'canvas'
        ? project
          ? projectView(project)
          : { kind, ref: null, title: '创作空间' }
        : kind === 'writing'
          ? {
              kind,
              ref: doc?.path ?? null,
              rootId: doc?.rootId ?? writing.root?.id,
              title: doc?.path.split('/').at(-1) ?? '写作空间',
            }
          : {
              kind,
              ref: kind === 'settings' ? 'general' : null,
              title: kind === 'settings' ? '设置' : kind === 'calendar' ? '日历' : '协调对话',
            },
      true,
    );
  }
  const openSettings = (section: SettingsSection) =>
    open({ kind: 'settings', ref: section, title: '设置' }, true);
  function create() {
    const project = createProject();
    update((p) => ({ ...p, projects: [...p.projects, project] }));
    void open(projectView(project));
  }
  const changeProject = useCallback(
    (id: string, changeProject: (p: Project) => Project) =>
      update((previous) => ({
        ...previous,
        projects: previous.projects.map((p) =>
          p.id === id ? { ...changeProject(p), updatedAt: Date.now() } : p,
        ),
      })),
    [update],
  );
  useEffect(() => {
    if (!agent.loading)
      change((s) => pruneTabs(s, (t) => t.kind !== 'chat' || placeExists(agent.snapshot, t.ref)));
  }, [agent.loading, agent.snapshot, change]);
  // The conversation on screen: its rounds go first and it raises no system notification.
  const viewing =
    route === 'chat'
      ? ((placeOf(active.ref).kind === 'session'
          ? active.ref
          : active.ref
            ? null
            : agent.current?.coordinatorId) ?? null)
      : null;
  useEffect(() => {
    void window.desktop?.os.setViewing(viewing ? [viewing] : []);
  }, [viewing]);
  // A clicked system notification shows its conversation, reusing a tab that already has it.
  const reveal = useRef<(sessionId: string) => void>(() => {});
  reveal.current = (sessionId) => {
    const tab = shell.current.current.tabs.find((t) => t.kind === 'chat' && t.ref === sessionId);
    if (tab) return void activate(tab.id);
    void open(
      { kind: 'chat', ref: sessionId, title: placeTitle(agent.snapshot, sessionId) ?? '线程' },
      true,
    );
  };
  useEffect(() => window.desktop?.os.onOpen((sessionId) => reveal.current(sessionId)), []);
  useEffect(() => setThreadOpener((sessionId) => reveal.current(sessionId)), []);
  useEffect(() => {
    if (agent.loading) return;
    change((s) => {
      const titled = s.tabs.map((t) => {
        const title = t.kind === 'chat' ? placeTitle(agent.snapshot, t.ref) : undefined;
        return title && title !== t.title ? { ...t, title } : t;
      });
      return titled.some((t, i) => t !== s.tabs[i]) ? { ...s, tabs: titled } : s;
    });
  }, [agent.loading, agent.snapshot, change]);
  useEffect(() => {
    change((s) =>
      pruneTabs(
        s,
        (t) => t.kind !== 'canvas' || !t.ref || data.projects.some((p) => p.id === t.ref),
      ),
    );
  }, [data.projects, change]);
  const recordSession = useCallback(
    (tabId: string, id: string, title: string) => {
      change((s) => {
        const tab = s.tabs.find((t) => t.id === tabId);
        if (!tab || tab.kind !== 'chat' || (tab.ref === id && tab.title === title)) return s;
        return {
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  ref: id,
                  title,
                  history: t.history.map((v, i) => (i === t.cursor ? { ...v, ref: id, title } : v)),
                }
              : t,
          ),
        };
      });
    },
    [change],
  );
  useEffect(() => {
    change((s) => ({
      ...s,
      tabs: s.tabs.map((t) => ({
        ...t,
        title:
          t.kind === 'canvas'
            ? (data.projects.find((p) => p.id === t.ref)?.name ?? t.title)
            : t.title,
        history: t.history.map((v) =>
          v.kind === 'canvas'
            ? { ...v, title: data.projects.find((p) => p.id === v.ref)?.name ?? v.title }
            : v,
        ),
      })),
    }));
  }, [data.projects, change]);
  const restoredWriting = useRef(false);
  useEffect(() => {
    if (!writing.ready || restoredWriting.current) return;
    restoredWriting.current = true;
    change((state) => {
      let next = pruneTabs(
        state,
        (t) =>
          t.kind !== 'writing' ||
          !t.ref ||
          writing.documents.some((d) => d.rootId === t.rootId && d.path === t.ref),
      );
      const activeId = next.activeId;
      for (const doc of writing.documents) {
        if (
          !next.tabs.some(
            (t) => t.kind === 'writing' && t.rootId === doc.rootId && t.ref === doc.path,
          )
        )
          next = openTabView(
            next,
            {
              kind: 'writing',
              rootId: doc.rootId,
              ref: doc.path,
              title: doc.path.split('/').at(-1)!,
              fileType: doc.fileType,
            },
            true,
          );
      }
      return { ...next, activeId };
    });
    try {
      localStorage.setItem('jarvis:window-tabs', serializeTabs(shell.current.current));
      for (const key of writing.legacyKeys) localStorage.removeItem(key);
    } catch {
      writing.setNotice('标签迁移未能保存，旧记录已保留');
    }
  }, [
    writing.ready,
    writing.documents,
    writing.legacyKeys,
    writing.setNotice,
    change,
    shell.current,
  ]);
  useEffect(
    () =>
      window.desktop?.writing.onRenamed(({ rootId, from, to }) => {
        const rename = (v: TabView) =>
          v.kind === 'writing' &&
          v.rootId === rootId &&
          v.ref &&
          (v.ref === from || v.ref.startsWith(from + '/'))
            ? {
                ...v,
                ref: to + v.ref.slice(from.length),
                title: (to + v.ref.slice(from.length)).split('/').at(-1)!,
              }
            : v;
        change((s) => ({
          ...s,
          tabs: s.tabs.map((t) => ({ ...t, ...rename(t), history: t.history.map(rename) })),
        }));
      }),
    [change],
  );
  const lastDocument = useRef('');
  useEffect(() => {
    if (!writing.ready || !writing.activeId || lastDocument.current === writing.activeId) return;
    lastDocument.current = writing.activeId;
    const doc = writing.documents.find((d) => d.id === writing.activeId);
    if (!doc) return;
    const tab = shell.current.current.tabs.find((t) => t.id === shell.current.current.activeId);
    if (tab?.kind !== 'writing') return;
    change((s) =>
      openTabView(
        s,
        {
          kind: 'writing',
          ref: doc.path,
          rootId: doc.rootId,
          title: doc.path.split('/').at(-1)!,
        },
        Boolean(
          tab.ref && writing.documents.some((d) => d.path === tab.ref && d.rootId === tab.rootId),
        ),
      ),
    );
  }, [writing.ready, writing.activeId, writing.documents, change, shell.current]);
  useEffect(() => {
    if (!writing.ready) return;
    change((s) =>
      pruneTabs(
        s,
        (t) =>
          t.kind !== 'writing' ||
          !t.ref ||
          writing.documents.some((d) => d.rootId === t.rootId && d.path === t.ref),
      ),
    );
  }, [writing.ready, writing.documents, change]);
  const shortcuts = useRef({ close, activate, open });
  shortcuts.current = { close, activate, open };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.isComposing ||
        e.keyCode === 229 ||
        document.querySelector('[role="alertdialog"],[role="dialog"],dialog[open]')
      )
        return;
      const s = shell.current.current,
        mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 't') {
        e.preventDefault();
        void shortcuts.current.open({ kind: 'chat', ref: null, title: '协调对话' }, true);
      } else if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        void shortcuts.current.close(s.activeId);
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const i = s.tabs.findIndex((t) => t.id === s.activeId);
        void shortcuts.current.activate(
          s.tabs[(i + (e.shiftKey ? -1 : 1) + s.tabs.length) % s.tabs.length]!.id,
        );
      } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const t = s.tabs[e.key === '9' ? s.tabs.length - 1 : Number(e.key) - 1];
        if (t) void shortcuts.current.activate(t.id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [shell.current]);
  const writingVisible = route === 'writing';
  const sidebar = (
    <>
      <div ref={setLeftHost} hidden={!writingVisible} className="shell-writing-sidebar" />
      {!writingVisible && (
        <ShellSidebar
          kind={route}
          section={settingsSection}
          projects={data.projects}
          activeProject={active.ref}
          onCreate={create}
          onOpenProject={(p, n) => void open(projectView(p), n)}
          home={
            <ProjectSidebar
              snapshot={agent.snapshot}
              activeRef={route === 'chat' ? active.ref : undefined}
              onOpen={(ref, title, newTab) => void open({ kind: 'chat', ref, title }, newTab)}
              onError={agent.setError}
            />
          }
          onRenameProject={async (id, title) => {
            await commit((s) => ({
              ...s,
              projects: s.projects.map((p) =>
                p.id === id ? { ...p, name: title, updatedAt: Date.now() } : p,
              ),
            }));
            return true;
          }}
          onDeleteProject={async (id) => {
            await commit((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }), true);
            return true;
          }}
          busy={agent.anyBusy}
          onSettings={openSettings}
        />
      )}
    </>
  );
  return (
    <div
      data-testid="theme-root"
      className="theme-root"
      inert={updates.state?.phase === 'installing'}
    >
      <GenerationNotice notice={notice} onDismiss={dismissNotice} />
      {(route !== 'settings' || settingsSection !== 'about') && <UpdateStatus updates={updates} />}
      {saveError && (
        <Alert
          tone="error"
          action={
            <Button variant="secondary" size="sm" onClick={() => update((p) => ({ ...p }))}>
              重试保存
            </Button>
          }
        >
          {saveError}
        </Alert>
      )}
      {shell.error && <Alert tone="error">{shell.error}</Alert>}
      <AppShell
        state={state}
        width={data.sidebarWidth}
        onWidth={(sidebarWidth) => update((p) => ({ ...p, sidebarWidth }))}
        sidebar={sidebar}
        right={<div ref={setRightHost} className="shell-assistant-host" />}
        dirty={(id) => {
          const tab = state.tabs.find((t) => t.id === id);
          return tab?.kind === 'settings'
            ? settingsDirty
            : writing.documents.some(
                (d) =>
                  d.path === tab?.ref && d.rootId === tab?.rootId && d.content !== d.savedContent,
              );
        }}
        onSidebar={() => change((s) => ({ ...s, sidebarOpen: !s.sidebarOpen }))}
        onRight={() =>
          change((s) => ({
            ...s,
            tabs: s.tabs.map((t) =>
              t.id === s.activeId ? { ...t, rightPanelOpen: !t.rightPanelOpen } : t,
            ),
          }))
        }
        onActivate={(id) => void activate(id)}
        onClose={(id) => void close(id)}
        onNew={() => void open({ kind: 'chat', ref: null, title: '协调对话' }, true)}
        onTravel={(n) => void travel(n)}
        onSpace={(kind) => void space(kind)}
      >
        {state.tabs
          .filter((t) => t.kind === 'chat')
          .map((tab) => (
            <div key={tab.id} className="shell-view" hidden={state.activeId !== tab.id}>
              <AgentTab
                key={tab.ref ?? 'draft'}
                tabRef={tab.ref}
                onOpen={(ref, title, newTab) => void open({ kind: 'chat', ref, title }, newTab)}
                onPlace={(id, title) => recordSession(tab.id, id, title)}
                onConfigure={() => void openSettings('models')}
              />
            </div>
          ))}
        <div className="shell-view" hidden={route !== 'calendar'}>
          {route === 'calendar' && <CalendarSpace active />}
        </div>
        <div className="shell-view" hidden={route !== 'settings'}>
          {route === 'settings' && (
            <header className="shell-settings-toolbar">
              <span>
                {
                  {
                    general: '通用',
                    models: '模型',
                    services: '内网地址',
                    plugins: '插件',
                    about: '关于 Jarvis',
                  }[settingsSection]
                }
              </span>
              <span
                data-testid="save-status"
                role="status"
                hidden={
                  settingsSection === 'models' ||
                  settingsSection === 'plugins' ||
                  settingsSection === 'about'
                }
              >
                {status}
              </span>
            </header>
          )}
          {route === 'settings' && settingsSection === 'general' ? (
            <GeneralSettings
              value={data.theme}
              onChange={(theme) => update((p) => ({ ...p, theme }))}
            />
          ) : route === 'settings' && settingsSection === 'about' ? (
            <AboutSettings updates={updates} />
          ) : route === 'settings' && settingsSection === 'models' ? (
            agent.loading ? (
              <p className="launch-message">正在读取模型配置…</p>
            ) : (
              <ModelSettings value={agent.configuration} busy={agent.anyBusy} />
            )
          ) : route === 'settings' && settingsSection === 'plugins' ? (
            agent.loading ? (
              <p className="launch-message">正在读取插件…</p>
            ) : (
              <PluginSettings
                skills={agent.snapshot.skills ?? []}
                busy={agent.anyBusy}
                mcp={agent.snapshot.mcp ?? []}
              />
            )
          ) : route === 'settings' ? (
            <ServiceSettings
              key="settings"
              value={data.settings}
              onSave={(settings) => update((p) => ({ ...p, settings }))}
              onDirtyChange={setSettingsDirty}
              status={status}
            />
          ) : null}
        </div>
        {data.projects
          .filter((p) => route === 'canvas' && active.ref === p.id)
          .map((project) => (
            <div
              className="shell-view"
              hidden={route !== 'canvas' || active.ref !== project.id}
              key={project.id}
            >
              <Canvas
                project={project}
                onImport={(files, point, onNotice) =>
                  importAssets(project.id, files, point, onNotice)
                }
                onGenerate={(nodeId) => void generate(project.id, nodeId)}
                onChange={(fn) => changeProject(project.id, fn)}
                onCommit={(fn) =>
                  commit(
                    (previous) => ({
                      ...previous,
                      projects: previous.projects.map((p) =>
                        p.id === project.id ? { ...fn(p), updatedAt: Date.now() } : p,
                      ),
                    }),
                    true,
                  )
                }
                onConfigureAgent={() => void openSettings('models')}
                onHold={(held) => hold(project.id, held)}
                agentBusy={false}
                theme={theme}
                status={status}
                shell={{
                  active: route === 'canvas' && active.ref === project.id,
                  rightHost,
                  open: active.ref === project.id && active.rightPanelOpen,
                  width: active.rightPanelWidth,
                  onClose: () =>
                    change((s) => ({
                      ...s,
                      tabs: s.tabs.map((t) =>
                        t.kind === 'canvas' && t.ref === project.id
                          ? { ...t, rightPanelOpen: false }
                          : t,
                      ),
                    })),
                  onWidth: (width) =>
                    change((s) => ({
                      ...s,
                      tabs: s.tabs.map((t) =>
                        t.ref === project.id && t.kind === 'canvas'
                          ? { ...t, rightPanelWidth: width }
                          : t,
                      ),
                    })),
                }}
              />
            </div>
          ))}
        {route === 'canvas' && !active.ref && (
          <div className="empty-projects">
            <h1>开始你的第一个画布</h1>
            <Button variant="secondary" onClick={create}>
              创建画布
            </Button>
            <span data-testid="save-status">{status}</span>
          </div>
        )}
        <div className="shell-view" hidden={!writingVisible}>
          <Suspense fallback={<p>正在打开写作空间…</p>}>
            <WritingSpace
              writing={writing}
              shell={{
                active: writingVisible,
                leftHost,
                rightHost,
                rightOpen: writingVisible && active.rightPanelOpen,
                rightWidth: active.rightPanelWidth,
                configure: () => void openSettings('models'),
                onWidth: (width) =>
                  change((s) => ({
                    ...s,
                    tabs: s.tabs.map((t) =>
                      t.id === s.activeId ? { ...t, rightPanelWidth: width } : t,
                    ),
                  })),
                onClose: () => {
                  change((s) => ({
                    ...s,
                    tabs: s.tabs.map((t) =>
                      t.id === s.activeId ? { ...t, rightPanelOpen: false } : t,
                    ),
                  }));
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLButtonElement>('[aria-label="展开右侧栏"]')?.focus(),
                  );
                },
                onAssistant: () =>
                  change((s) => ({
                    ...s,
                    tabs: s.tabs.map((t) =>
                      t.id === s.activeId ? { ...t, rightPanelOpen: true } : t,
                    ),
                  })),
                onOpen: (path, newTab, rootId) => {
                  if (writing.root)
                    void open(
                      {
                        kind: 'writing',
                        ref: path,
                        rootId: rootId ?? writing.root.id,
                        title: path.split('/').at(-1)!,
                      },
                      newTab ||
                        (active.kind === 'writing' &&
                          !!active.ref &&
                          active.rootId !== writing.root.id),
                    );
                },
              }}
            />
          </Suspense>
        </div>
      </AppShell>
    </div>
  );
}
export function App() {
  const [initial, setInitial] = useState<Awaited<ReturnType<typeof loadWorkspace>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void loadWorkspace()
      .then((value) => {
        if (active) setInitial(value);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : '读取失败');
      });
    return () => {
      active = false;
    };
  }, []);
  if (!window.desktop)
    return (
      <main className="launch-message">
        <h1>请从桌面窗口打开 Jarvis</h1>
        <p>在项目根目录运行 pnpm dev。</p>
      </main>
    );
  if (error)
    return (
      <main className="launch-message">
        <h1>无法读取本地工作台</h1>
        <p role="alert">{error}</p>
        <Button variant="secondary" onClick={() => location.reload()}>
          重新加载
        </Button>
      </main>
    );
  if (!initial)
    return (
      <main className="launch-message" role="status">
        正在打开工作台…
      </main>
    );
  return (
    <MotionConfig reducedMotion="user">
      <ConfirmProvider>
        <Workbench initial={initial} />
        <Toaster />
      </ConfirmProvider>
    </MotionConfig>
  );
}
