import type { Ref } from 'react';
import {
  ChevronLeft,
  BookmarkCheck,
  Cpu,
  Database,
  Folder,
  FileText,
  Info,
  LayoutGrid,
  PanelLeftClose,
  Plug,
  Settings2,
  SquarePen,
  MessageSquare,
} from 'lucide-react';
import { IconButton } from './IconButton';
import type { ChatSession } from '../../../shared/agent';
export function Sidebar({
  settings,
  onProjects,
  onSettings,
  onCollapse,
  section,
  onGeneral,
  onServices,
  collapseRef,
  onWriting,
  onModels,
  onSkills,
  onNewChat,
  onSelectChat,
  chatSessions,
  currentChatId,
  currentRoute,
}: {
  settings: boolean;
  onProjects: () => void;
  onSettings: () => void;
  onCollapse: () => void;
  section: 'general' | 'services' | 'models' | 'skills';
  onGeneral: () => void;
  onServices: () => void;
  collapseRef: Ref<HTMLButtonElement>;
  onWriting: () => void;
  onModels: () => void;
  onSkills: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  chatSessions: ChatSession[];
  currentChatId: string | null;
  currentRoute: string;
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
      {settings && (
        <button type="button" className="sidebar-back" onClick={onProjects}>
          <ChevronLeft size={14} strokeWidth={1.75} />
          返回工作台
        </button>
      )}
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
            <button
              className={`side-link ${section === 'models' ? 'selected' : ''}`}
              onClick={onModels}
              aria-current={section === 'models' ? 'page' : undefined}
            >
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
            <button
              className={`side-link ${section === 'skills' ? 'selected' : ''}`}
              onClick={onSkills}
              aria-current={section === 'skills' ? 'page' : undefined}
            >
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
            <button className="nav-button" onClick={onNewChat}>
              <SquarePen size={18} />
              <span>新对话</span>
            </button>
            <button
              className={`side-link ${currentRoute === 'projects' ? 'selected' : ''}`}
              onClick={onProjects}
              aria-current={currentRoute === 'projects' ? 'page' : undefined}
            >
              <LayoutGrid />
              AIGC 创作空间
            </button>
            <button className="side-link" onClick={onWriting}>
              <FileText />
              写作空间
            </button>
          </>
        )}
      </nav>
      {!settings && (
        <div className="chat-history" aria-label="聊天记录">
          <small>最近对话</small>
          {chatSessions.length ? (
            [...chatSessions]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((s) => (
                <button
                  key={s.id}
                  className={`side-link ${currentRoute === 'chat' && currentChatId === s.id ? 'selected' : ''}`}
                  onClick={() => onSelectChat(s.id)}
                  aria-label={`打开对话：${s.title}`}
                  aria-current={
                    currentRoute === 'chat' && currentChatId === s.id ? 'page' : undefined
                  }
                >
                  <MessageSquare size={16} />
                  <span>{s.title}</span>
                  {s.runId && (
                    <span className="history-running" aria-label="回复中">
                      •
                    </span>
                  )}
                </button>
              ))
          ) : (
            <p>还没有对话</p>
          )}
        </div>
      )}
      {!settings && (
        <div className="sidebar-footer">
          <span>本地工作台</span>
          <IconButton label="设置" onClick={onSettings}>
            <Settings2 size={18} />
          </IconButton>
        </div>
      )}
    </aside>
  );
}
