import { useState } from 'react';
import { LayoutGrid, PanelLeftClose, PanelLeftOpen, Settings2, SquarePen } from 'lucide-react';

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const desktop = window.desktop;

  if (!desktop) {
    return (
      <main className="launch-message">
        <h1>请从桌面窗口打开 Jarvis</h1>
        <p>在项目根目录运行 pnpm dev。当前不提供独立网页版本。</p>
      </main>
    );
  }

  return (
    <div className="app-shell" data-collapsed={!sidebarOpen}>
      <aside id="sidebar" className="sidebar" hidden={!sidebarOpen} aria-label="主导航">
        <div className="sidebar-chrome window-drag">
          <button
            className="icon-button"
            type="button"
            aria-label="收起侧栏"
            aria-controls="sidebar"
            aria-expanded={sidebarOpen}
            title="收起侧栏"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="brand">
          <strong>Jarvis</strong>
          <span>个人工作台</span>
        </div>
        <nav className="navigation" aria-label="工作台功能">
          <button className="nav-button" type="button" disabled>
            <SquarePen size={18} strokeWidth={1.75} />
            <span>新对话</span>
            <span className="pending-label">待接入</span>
          </button>
          <button className="nav-button" type="button" disabled>
            <LayoutGrid size={18} strokeWidth={1.75} />
            <span>AIGC 创作空间</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <span>基础工程</span>
          <button className="icon-button" type="button" disabled aria-label="设置尚未接入">
            <Settings2 size={18} strokeWidth={1.75} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header
          className="workspace-toolbar window-drag"
          data-platform={desktop.platform}
          data-collapsed={!sidebarOpen}
        >
          {!sidebarOpen && (
            <button
              className="icon-button"
              type="button"
              aria-label="展开侧栏"
              aria-controls="sidebar"
              aria-expanded={sidebarOpen}
              title="展开侧栏"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeftOpen size={18} strokeWidth={1.75} />
            </button>
          )}
          <span>工作台</span>
        </header>
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="max-w-[640px]">
            <p className="eyebrow">JARVIS · DESKTOP</p>
            <h1 id="welcome-title">基础工作台已就绪</h1>
            <p className="welcome-description">
              桌面窗口与界面已连接。接下来可以在这个基础上实现对话、创作空间和设置。
            </p>
            <dl className="runtime-info" aria-label="桌面运行环境">
              <div>
                <dt>Electron</dt>
                <dd>{desktop.versions.electron}</dd>
              </div>
              <div>
                <dt>Chromium</dt>
                <dd>{desktop.versions.chromium}</dd>
              </div>
              <div>
                <dt>Node.js</dt>
                <dd>{desktop.versions.node}</dd>
              </div>
            </dl>
            <p className="scope-note">当前版本仅包含工程骨架，尚未接入模型或 Agent。</p>
          </div>
        </section>
      </main>
    </div>
  );
}
