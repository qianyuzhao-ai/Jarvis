import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { IconButton } from '@jarvis/ui/components/Button';
import { Toggle } from '@jarvis/ui/components/Toggle';
import { Tooltip } from '@jarvis/ui/components/Tooltip';
import { WindowTab, WindowTabs } from '@jarvis/ui/components/WindowTabs';
import {
  ArrowLeft,
  ArrowRight,
  PanelLeft,
  PanelRight,
  House,
  LayoutGrid,
  PenLine,
  Calendar,
  Settings,
  MessageCircle,
  FileText,
  Plus,
} from '@jarvis/ui/icons';
import type { WindowState, TabView } from '../features/shell/tabs';
import { SidebarLayout } from './SidebarLayout';
export function AppShell({
  state,
  dirty,
  sidebar,
  children,
  right,
  width,
  onWidth,
  onSidebar,
  onRight,
  onActivate,
  onClose,
  onNew,
  onTravel,
  onSpace,
}: {
  state: WindowState;
  dirty?: (id: string) => boolean;
  sidebar: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  width: number;
  onWidth: (n: number) => void;
  onSidebar: () => void;
  onRight: () => void;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onTravel: (offset: number) => void;
  onSpace: (kind: TabView['kind']) => void;
}) {
  const active = state.tabs.find((t) => t.id === state.activeId)!;
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabs.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [state.activeId, state.tabs.length]);
  const icons = { chat: MessageCircle, canvas: LayoutGrid, writing: FileText, settings: Settings };
  return (
    <div
      className="window-shell"
      data-platform={window.desktop?.platform}
      style={{ '--shell-sidebar-width': `${state.sidebarOpen ? width : 0}px` } as CSSProperties}
    >
      <header className="shell-titlebar window-drag">
        <div className="shell-navigation">
          <IconButton
            aria-label="后退"
            variant="ghost"
            disabled={active.cursor === 0}
            onClick={() => onTravel(-1)}
          >
            <ArrowLeft />
          </IconButton>
          <IconButton
            aria-label="前进"
            variant="ghost"
            disabled={active.cursor === active.history.length - 1}
            onClick={() => onTravel(1)}
          >
            <ArrowRight />
          </IconButton>
          <IconButton
            aria-label={state.sidebarOpen ? '收起侧栏' : '展开侧栏'}
            variant="ghost"
            aria-expanded={state.sidebarOpen}
            aria-controls="sidebar"
            onClick={(event) => {
              event.currentTarget.focus();
              onSidebar();
            }}
          >
            <PanelLeft />
          </IconButton>
        </div>
        <WindowTabs ref={tabs} aria-label="窗口标签" className="shell-tabs">
          {state.tabs.map((tab) => {
            const Icon = icons[tab.kind];
            return (
              <WindowTab
                key={tab.id}
                title={tab.title}
                active={tab.id === state.activeId}
                dirty={dirty?.(tab.id)}
                icon={<Icon />}
                onClick={() => onActivate(tab.id)}
                onClose={() => onClose(tab.id)}
              />
            );
          })}
        </WindowTabs>
        <IconButton variant="ghost" size="icon-sm" aria-label="新建标签" onClick={onNew}>
          <Plus />
        </IconButton>
        <div className="shell-titlebar-end">
          {(active.kind === 'canvas' || active.kind === 'writing') && (
            <Tooltip content={active.kind === 'canvas' ? '画布助手' : '写作助手'}>
              <Toggle
                aria-label={
                  active.kind === 'canvas'
                    ? state.tabs.find((t) => t.id === state.activeId)?.rightPanelOpen
                      ? '收起画布助手'
                      : '展开画布助手'
                    : active.rightPanelOpen
                      ? '收起右侧栏'
                      : '展开右侧栏'
                }
                pressed={active.rightPanelOpen}
                onPressedChange={onRight}
                onClick={(event) => event.currentTarget.focus()}
              >
                <PanelRight />
              </Toggle>
            </Tooltip>
          )}
        </div>
      </header>
      <nav className="shell-rail" aria-label="空间导航">
        {(
          [
            { kind: 'chat', title: '首页', Icon: House },
            { kind: 'canvas', title: 'AIGC 创作空间', Icon: LayoutGrid },
            { kind: 'writing', title: '写作空间', Icon: PenLine },
          ] as const
        ).map(({ kind, title, Icon }) => (
          <Tooltip key={kind} content={title}>
            <Toggle
              aria-label={title}
              pressed={active.kind === kind}
              onPressedChange={() => onSpace(kind)}
            >
              <Icon />
            </Toggle>
          </Tooltip>
        ))}
        <Tooltip content="即将推出">
          <span>
            <Toggle disabled aria-label="日历（即将推出）">
              <Calendar />
            </Toggle>
          </span>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip content="设置">
          <Toggle
            aria-label="设置"
            pressed={active.kind === 'settings'}
            onPressedChange={() => onSpace('settings')}
          >
            <Settings />
          </Toggle>
        </Tooltip>
      </nav>
      <div className="shell-body">
        <div className="shell-panel" data-testid="shell-panel">
          <SidebarLayout
            open={state.sidebarOpen}
            initialWidth={width}
            onWidthChange={onWidth}
            sidebar={sidebar}
          >
            {children}
          </SidebarLayout>
        </div>
        {right}
      </div>
    </div>
  );
}
