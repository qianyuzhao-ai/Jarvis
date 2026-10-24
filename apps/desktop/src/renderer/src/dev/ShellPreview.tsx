import { useState } from 'react';
import { SidebarItem } from '@jarvis/ui/components/SidebarItem';
import { WindowTabs, WindowTab } from '@jarvis/ui/components/WindowTabs';
import { Composer, ComposerAction } from '@jarvis/ui/components/Composer';
import { AssistantPanel, AssistantEmpty } from '@jarvis/ui/components/AssistantPanel';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { MessageCircle, LayoutGrid, FileText, Ellipsis, Sparkles, Plus, X } from '@jarvis/ui/icons';
export function ShellPreview() {
  const [active, setActive] = useState('聊天');
  const [tabs, setTabs] = useState(['聊天', '视觉系统', '周报草稿.md']);
  return (
    <section aria-label="Shell components">
      <h2>SidebarItem · WindowTabs · Composer · AssistantPanel</h2>
      <div className="preview-row">
        <div className="w-62 bg-fill p-2">
          {['默认', '选中', '禁用', '缩进'].map((name, index) => (
            <SidebarItem
              key={name}
              asChild={index === 0}
              selected={index === 1}
              disabled={index === 2}
              depth={index === 3 ? 1 : 0}
              icon={<MessageCircle />}
              meta="2 天"
              trailing={
                <IconButton aria-label={`更多 ${name}`} variant="ghost" size="icon-xs">
                  <Ellipsis />
                </IconButton>
              }
            >
              {index === 0 ? <a href="#/ui-preview">{name}</a> : name}
            </SidebarItem>
          ))}
        </div>
        <WindowTabs aria-label="预览窗口标签">
          {tabs.map((title, index) => (
            <WindowTab
              key={title}
              title={title}
              active={active === title}
              dirty={index === 2}
              icon={index === 0 ? <MessageCircle /> : index === 1 ? <LayoutGrid /> : <FileText />}
              onClick={() => setActive(title)}
              onClose={() => {
                setTabs(tabs.filter((t) => t !== title));
                if (active === title) setActive(tabs.find((t) => t !== title) ?? '');
              }}
            />
          ))}
        </WindowTabs>
      </div>
      {(['empty', 'filled', 'busy'] as const).map((state) => (
        <div className="preview-row" key={state}>
          <Composer
            context={
              <>
                <LayoutGrid size={14} /> 已选 3 个节点
              </>
            }
            toolbar={
              <Button variant="ghost" size="sm">
                <Plus /> 技能
              </Button>
            }
            actions={<ComposerAction state={state} />}
          >
            <div className="min-h-11 text-body">
              {state === 'filled'
                ? '帮我整理本周选题'
                : state === 'busy'
                  ? '继续输入，回复完成后发送'
                  : '随心输入'}
            </div>
          </Composer>
          <Composer
            layout="compact"
            className="max-w-85"
            toolbar={
              <Button variant="ghost" size="sm">
                技能
              </Button>
            }
            actions={<ComposerAction state={state} />}
          >
            <div className="min-h-10 text-body">
              {state === 'filled' ? '改写选中段落' : '随心输入'}
            </div>
          </Composer>
        </div>
      ))}
      <AssistantPanel
        aria-label="预览助手"
        title="写作助手"
        actions={
          <IconButton variant="ghost" aria-label="关闭预览助手">
            <X />
          </IconButton>
        }
        composer={
          <Composer layout="compact" actions={<ComposerAction state="empty" />}>
            <div className="min-h-10 text-body text-fg-tertiary">随心输入</div>
          </Composer>
        }
      >
        <AssistantEmpty
          title="写作助手"
          icon={<Sparkles />}
          suggestions={
            <Button variant="secondary" size="sm">
              为全文写一段摘要
            </Button>
          }
        >
          读取当前文档，帮你改写、续写、总结
        </AssistantEmpty>
      </AssistantPanel>
    </section>
  );
}
