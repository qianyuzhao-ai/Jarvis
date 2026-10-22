import { lazy, Suspense, useCallback, useEffect, useState, useRef } from 'react';
import { PanelLeftOpen, Workflow } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { SidebarLayout } from './components/SidebarLayout';
import { Sidebar } from './components/Sidebar';
import { IconButton } from './components/IconButton';
import { GeneralSettings } from './features/settings/GeneralSettings';
import { useResolvedTheme } from './features/settings/theme';
import { Canvas } from './features/creation/Canvas';
import { ProjectList } from './features/creation/ProjectList';
import { ServiceSettings } from './features/creation/ServiceSettings';
import { loadWorkspace } from './features/creation/storage';
import { createProject, type Project, type WorkspaceData } from './features/creation/types';

import { useWorkspace } from './features/creation/useWorkspace';
import { useGeneration } from './features/creation/useGeneration';
import { useAssetUpload } from './features/creation/useAssetUpload';
import { useAgent } from './features/agent/use-agent';
import { ChatPage } from './features/agent/ChatPage';
import { ModelSettings } from './features/settings/ModelSettings';
import { PluginSettings } from './features/settings/PluginSettings';
import './features/agent/agent.css';
import { useAppUpdates } from './features/updates/use-app-updates';
import { useUpdateGuard } from './features/updates/use-update-guard';
import { UpdateStatus } from './features/updates/UpdateStatus';
import './features/updates/updates.css';
const WritingSpace = lazy(() =>
  import('./features/writing/WritingSpace').then((module) => ({ default: module.WritingSpace })),
);

function Workbench({ initial }: { initial: WorkspaceData }) {
  const updates = useAppUpdates();
  const { data, update, commit, getCurrent, status, saveError } = useWorkspace(initial);
  const generate = useGeneration(data, commit, getCurrent);
  const importAssets = useAssetUpload(commit, getCurrent);
  const [route, setRoute] = useState<'chat' | 'projects' | 'settings' | 'canvas' | 'writing'>(
    'chat',
  );
  const [settingsSection, setSettingsSection] = useState<
    'general' | 'services' | 'models' | 'plugins'
  >('general');
  const agent = useAgent();
  const theme = useResolvedTheme(data.theme);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const expandButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  function collapseSidebar() {
    setSidebarOpen(false);
    requestAnimationFrame(() => expandButton.current?.focus());
  }
  function expandSidebar() {
    setSidebarOpen(true);
    requestAnimationFrame(() => collapseButton.current?.focus());
  }
  const [settingsDirty, setSettingsDirty] = useState(false);
  useUpdateGuard(() => {
    if (settingsDirty) throw new Error('设置尚未保存，请先保存或取消更改，再重启安装。');
  });
  const changeProject = useCallback(
    (change: (project: Project) => Project) =>
      update((previous) => ({
        ...previous,
        projects: previous.projects.map((p) =>
          p.id === projectId ? { ...change(p), updatedAt: Date.now() } : p,
        ),
      })),
    [projectId, update],
  );
  function openSettings(section: 'general' | 'services' | 'models' | 'plugins') {
    if (
      settingsDirty &&
      section !== settingsSection &&
      !window.confirm('更改尚未保存，确定放弃这些更改吗？')
    )
      return;
    if (section !== settingsSection) setSettingsDirty(false);
    setSettingsSection(section);
    setRoute('settings');
  }
  const openProject = (id: string) => {
    setProjectId(id);
    setRoute('canvas');
  };
  const project = data.projects.find((p) => p.id === projectId);
  function returnToProjects() {
    if (settingsDirty && !window.confirm('更改尚未保存，确定放弃这些更改并返回工作台吗？')) return;
    setSettingsDirty(false);
    setRoute('projects');
  }
  function navigateChat(id: string | null) {
    if (settingsDirty && !window.confirm('更改尚未保存，确定放弃这些更改吗？')) return;
    setSettingsDirty(false);
    if (id) agent.select(id);
    else agent.newChat();
    setRoute('chat');
  }
  function create() {
    const next = createProject();
    update((p) => ({ ...p, projects: [...p.projects, next] }));
    openProject(next.id);
  }
  return (
    <div className="theme-root" data-theme={theme} inert={updates.state?.phase === 'installing'}>
      {(route !== 'settings' || settingsSection !== 'general') && (
        <UpdateStatus updates={updates} />
      )}
      {saveError && (
        <div role="alert" className="save-error">
          {saveError}
          <button onClick={() => update((p) => ({ ...p }))}>重试保存</button>
        </div>
      )}
      {route === 'writing' ? (
        <Suspense
          fallback={
            <main className="launch-message" role="status">
              正在打开写作空间…
            </main>
          }
        >
          <WritingSpace onBack={() => setRoute('projects')} />
        </Suspense>
      ) : route === 'canvas' && project ? (
        <Canvas
          project={project}
          onImport={(files, point, onNotice) => importAssets(project.id, files, point, onNotice)}
          onGenerate={(nodeId) => void generate(project.id, nodeId)}
          onChange={changeProject}
          onCommit={(change) =>
            commit(
              (previous) => ({
                ...previous,
                projects: previous.projects.map((p) =>
                  p.id === project.id ? { ...change(p), updatedAt: Date.now() } : p,
                ),
              }),
              true,
            )
          }
          onConfigureAgent={() => openSettings('models')}
          agentBusy={agent.busyProjectId === project.id}
          onBack={() => setRoute('projects')}
          theme={theme}
          status={status}
        />
      ) : (
        <SidebarLayout
          open={sidebarOpen}
          initialWidth={data.sidebarWidth}
          onWidthChange={(sidebarWidth) => update((previous) => ({ ...previous, sidebarWidth }))}
          sidebar={
            <Sidebar
              settings={route === 'settings'}
              onProjects={returnToProjects}
              onSettings={() => openSettings('general')}
              onCollapse={collapseSidebar}
              collapseRef={collapseButton}
              section={settingsSection}
              onGeneral={() => openSettings('general')}
              onServices={() => openSettings('services')}
              onModels={() => openSettings('models')}
              onPlugins={() => openSettings('plugins')}
              onNewChat={() => navigateChat(null)}
              onSelectChat={(id) => navigateChat(id)}
              chatSessions={agent.snapshot.sessions}
              currentChatId={agent.session?.id ?? null}
              currentRoute={route}
              onWriting={() => {
                if (settingsDirty && !window.confirm('更改尚未保存，确定放弃这些更改吗？')) return;
                setSettingsDirty(false);
                setRoute('writing');
              }}
            />
          }
        >
          <header
            className="workspace-toolbar window-drag"
            data-platform={window.desktop?.platform}
            data-collapsed={!sidebarOpen}
          >
            {!sidebarOpen && (
              <IconButton
                ref={expandButton}
                label="展开侧栏"
                aria-controls="sidebar"
                aria-expanded={false}
                onClick={expandSidebar}
              >
                <PanelLeftOpen size={18} />
              </IconButton>
            )}
            <span>
              {route === 'settings'
                ? settingsSection === 'general'
                  ? '通用'
                  : settingsSection === 'models'
                    ? '模型服务'
                    : settingsSection === 'plugins'
                      ? '插件'
                      : '内网地址'
                : route === 'chat'
                  ? '新对话'
                  : 'AIGC 创作空间'}
            </span>
            <div className="toolbar-end">
              <span
                className="save-status"
                role="status"
                hidden={
                  route === 'chat' ||
                  (route === 'settings' &&
                    (settingsSection === 'models' || settingsSection === 'plugins'))
                }
              >
                {status}
              </span>
              {route !== 'chat' && <Workflow size={16} />}
            </div>
          </header>
          {route === 'settings' && settingsSection === 'general' ? (
            <GeneralSettings
              updates={updates}
              value={data.theme}
              onChange={(theme) => update((p) => ({ ...p, theme }))}
            />
          ) : route === 'settings' && settingsSection === 'models' ? (
            agent.loading ? (
              <p className="launch-message">正在读取模型配置…</p>
            ) : (
              <ModelSettings
                value={agent.configuration}
                onSaved={agent.setConfiguration}
                onDirtyChange={setSettingsDirty}
              />
            )
          ) : route === 'settings' && settingsSection === 'plugins' ? (
            agent.loading ? (
              <p className="launch-message">正在读取插件…</p>
            ) : (
              <PluginSettings
                skills={agent.snapshot.skills ?? []}
                busy={!!agent.snapshot.busySessionId}
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
          ) : route === 'chat' ? (
            <ChatPage
              key={`${agent.session?.id ?? 'draft'}-${agent.draftKey}`}
              agent={agent}
              onConfigure={() => openSettings('models')}
            />
          ) : (
            <ProjectList projects={data.projects} onCreate={create} onOpen={openProject} />
          )}
        </SidebarLayout>
      )}
    </div>
  );
}
export function App() {
  const [initial, setInitial] = useState<WorkspaceData | null>(null);
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
        <button onClick={() => location.reload()}>重新加载</button>
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
      <Workbench initial={initial} />
    </MotionConfig>
  );
}
