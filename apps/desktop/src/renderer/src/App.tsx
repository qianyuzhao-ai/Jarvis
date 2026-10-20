import { useCallback, useEffect, useState, useRef } from 'react';
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

function Workbench({ initial }: { initial: WorkspaceData }) {
  const { data, update, commit, getCurrent, status, saveError } = useWorkspace(initial);
  const generate = useGeneration(data, commit, getCurrent);
  const [route, setRoute] = useState<'projects' | 'settings' | 'canvas'>('projects');
  const [settingsSection, setSettingsSection] = useState<'general' | 'services'>('general');
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
  function openSettings(section: 'general' | 'services') {
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
  function create() {
    const next = createProject();
    update((p) => ({ ...p, projects: [...p.projects, next] }));
    openProject(next.id);
  }
  return (
    <div className="theme-root" data-theme={theme}>
      {saveError && (
        <div role="alert" className="save-error">
          {saveError}
          <button onClick={() => update((p) => ({ ...p }))}>重试保存</button>
        </div>
      )}
      {route === 'canvas' && project ? (
        <Canvas
          project={project}
          onGenerate={(nodeId) => void generate(project.id, nodeId)}
          onChange={changeProject}
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
                  : '内网地址'
                : 'AIGC 创作空间'}
            </span>
            <div className="toolbar-end">
              <span className="save-status" role="status">
                {status}
              </span>
              <Workflow size={16} />
            </div>
          </header>
          {route === 'settings' && settingsSection === 'general' ? (
            <GeneralSettings
              value={data.theme}
              onChange={(theme) => update((p) => ({ ...p, theme }))}
            />
          ) : route === 'settings' ? (
            <ServiceSettings
              key="settings"
              value={data.settings}
              onSave={(settings) => update((p) => ({ ...p, settings }))}
              onDirtyChange={setSettingsDirty}
              status={status}
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
