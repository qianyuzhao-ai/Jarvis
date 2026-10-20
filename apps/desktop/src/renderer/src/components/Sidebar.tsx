import type { Ref } from 'react';
import {
  ArrowLeft,
  BookmarkCheck,
  Cpu,
  Database,
  Folder,
  Info,
  LayoutGrid,
  PanelLeftClose,
  Plug,
  Settings2,
  SquarePen,
} from 'lucide-react';
import { IconButton } from './IconButton';
export function Sidebar({
  settings,
  onProjects,
  onSettings,
  onCollapse,
  section,
  onGeneral,
  onServices,
  collapseRef,
}: {
  settings: boolean;
  onProjects: () => void;
  onSettings: () => void;
  onCollapse: () => void;
  section: 'general' | 'services';
  onGeneral: () => void;
  onServices: () => void;
  collapseRef: Ref<HTMLButtonElement>;
}) {
  return (
    <aside id="sidebar" className="sidebar" aria-label="主导航">
      <div className="sidebar-chrome window-drag">
        <IconButton
          ref={collapseRef}
          label="收起侧栏"
          aria-controls="sidebar"
          aria-expanded={true}
          onClick={onCollapse}
        >
          <PanelLeftClose size={18} />
        </IconButton>
      </div>
      <div className="brand">
        <strong>{settings ? '设置' : 'Jarvis'}</strong>
        {!settings && <span>个人工作台</span>}
      </div>
      <nav className="navigation" aria-label={settings ? '设置分类' : '工作台功能'}>
        {settings ? (
          <>
            <button
              className={`side-link ${section === 'general' ? 'selected' : ''}`}
              onClick={onGeneral}
              aria-current={section === 'general' ? 'page' : undefined}
            >
              <Settings2 />
              通用
            </button>
            <button className="side-link" disabled>
              <Cpu />
              模型服务
            </button>
            <button
              className={`side-link ${section === 'services' ? 'selected' : ''}`}
              onClick={onServices}
              aria-current={section === 'services' ? 'page' : undefined}
            >
              <Plug />
              内网地址
            </button>
            <button className="side-link" disabled>
              <Folder />
              文件与权限
            </button>
            <button className="side-link" disabled>
              <Plug />
              MCP 连接
            </button>
            <button className="side-link" disabled>
              <BookmarkCheck />
              Skill
            </button>
            <button className="side-link" disabled>
              <Database />
              数据与隐私
            </button>
            <button className="side-link" disabled>
              <Info />
              关于 Jarvis
            </button>
          </>
        ) : (
          <>
            <button className="nav-button" disabled>
              <SquarePen size={18} />
              <span>新对话</span>
              <span className="pending-label">待接入</span>
            </button>
            <button className="side-link selected" onClick={onProjects} aria-current="page">
              <LayoutGrid />
              AIGC 创作空间
            </button>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        {settings ? (
          <button className="text-button" onClick={onProjects}>
            <ArrowLeft size={14} />
            返回工作台
          </button>
        ) : (
          <>
            <span>本地工作台</span>
            <IconButton label="设置" onClick={onSettings}>
              <Settings2 size={18} />
            </IconButton>
          </>
        )}
      </div>
    </aside>
  );
}
