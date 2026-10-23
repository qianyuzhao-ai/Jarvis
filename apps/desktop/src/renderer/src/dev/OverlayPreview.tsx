import { useState } from 'react';
import { BookOpen, File, Plus } from 'lucide-react';
import { Button } from '@jarvis/ui/components/Button';
import { Input } from '@jarvis/ui/components/Input';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverFooter,
  PopoverClose,
} from '@jarvis/ui/components/Popover';
import {
  CandidateList,
  CandidateListItem,
  CandidateListLabel,
  CandidateListEmpty,
} from '@jarvis/ui/components/CandidateList';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@jarvis/ui/components/DropdownMenu';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from '@jarvis/ui/components/Dialog';
import { ConfirmProvider, useConfirm } from '@jarvis/ui/components/AlertDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent, TabsClose } from '@jarvis/ui/components/Tabs';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@jarvis/ui/components/Collapsible';
import { Alert } from '@jarvis/ui/components/Alert';
import { Badge, BadgeCount, StatusDot } from '@jarvis/ui/components/Badge';
import { Progress, ProgressField, ProgressRing } from '@jarvis/ui/components/Progress';
import { toast, Toaster } from '@jarvis/ui/components/Toast';
function Examples() {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [menuChecked, setMenuChecked] = useState(false);
  const [radio, setRadio] = useState('name');
  const [active, setActive] = useState(0);
  const [loadingId, setLoadingId] = useState('');
  const [tabClosed, setTabClosed] = useState(false);
  const [showAlert, setShowAlert] = useState(true);
  return (
    <>
      <section aria-label="Popover CandidateList">
        <h2>Popover / CandidateList</h2>
        <div className="preview-row">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">打开信息浮层</Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverTitle>上下文用量</PopoverTitle>
              <PopoverDescription>
                系统指令、消息与工具结果都会计入上下文。达到本地保护上限后需新建对话。
              </PopoverDescription>
              <PopoverFooter>
                <PopoverClose asChild>
                  <Button size="sm">知道了</Button>
                </PopoverClose>
              </PopoverFooter>
            </PopoverContent>
          </Popover>
          <div className="w-70">
            <Input
              aria-label="候选输入"
              role="combobox"
              aria-expanded="true"
              aria-controls="preview-candidates"
              aria-activedescendant={`candidate-${active}`}
            />
            <CandidateList id="preview-candidates" aria-label="预览候选">
              <CandidateListLabel>技能</CandidateListLabel>
              {[0, 1].map((i) => (
                <CandidateListItem
                  id={`candidate-${i}`}
                  key={i}
                  active={active === i}
                  media={<BookOpen />}
                  description="说明文字与足够长的技能描述保持在可用空间内"
                  meta="手动"
                  onActive={() => setActive(i)}
                  onClick={() => setAnswer(`候选${i}`)}
                >
                  候选 {i}
                </CandidateListItem>
              ))}
            </CandidateList>
          </div>
          <CandidateList aria-label="素材候选" className="w-70">
            <CandidateListItem
              id="thumbnail-option"
              active
              media={<File />}
              thumbnail
              description="人物正面.png"
              meta="图片 1"
            >
              素材缩略图
            </CandidateListItem>
          </CandidateList>
          <CandidateList aria-label="空候选" className="w-70">
            <CandidateListEmpty>没有匹配的已启用技能</CandidateListEmpty>
          </CandidateList>
        </div>
      </section>
      <section aria-label="DropdownMenu">
        <h2>DropdownMenu</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">打开预览菜单</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label="预览菜单">
            <DropdownMenuLabel>文件</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setAnswer('新建')}>
              <Plus />
              新建文档<DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>禁用操作</DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={menuChecked} onCheckedChange={setMenuChecked}>
              显示大纲
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>排序方式</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={radio} onValueChange={setRadio}>
                  <DropdownMenuRadioItem value="name">名称</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="time">时间</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setAnswer('删除')}>
              删除文件
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <output aria-label="菜单选择">{`${menuChecked} ${radio}`}</output>
      </section>
      <section aria-label="Dialog AlertDialog">
        <h2>Dialog / AlertDialog</h2>
        <div className="preview-row">
          {(['sm', 'default', 'lg'] as const).map((size) => (
            <Dialog key={size}>
              <DialogTrigger asChild>
                <Button variant="secondary">打开对话框 {size}</Button>
              </DialogTrigger>
              <DialogContent size={size}>
                <DialogHeader>
                  <DialogTitle>重命名项目</DialogTitle>
                  <DialogDescription>新名称会同步到项目列表与导出文件名。</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <Input aria-label="新项目名称" defaultValue="示例项目" />
                </DialogBody>
                <DialogFooter note="已保存到本机">
                  <DialogClose asChild>
                    <Button variant="secondary">取消编辑</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>保存项目</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ))}
          {(['default', 'destructive'] as const).map((tone) => (
            <Button
              key={tone}
              variant="secondary"
              onClick={async () =>
                setAnswer(
                  String(
                    await confirm({
                      title: '确认操作？',
                      message: '说明这个操作的后果，取消会保留原有数据。',
                      tone,
                      checkboxLabel: '不再询问',
                      onCheckedChange: setChecked,
                    }),
                  ),
                )
              }
            >
              确认 {tone}
            </Button>
          ))}
          <Button
            variant="secondary"
            onClick={async () => {
              void confirm({ title: '队列一', message: '第一项' }).then((v) => setAnswer(`一${v}`));
              await new Promise((resolve) => setTimeout(resolve, 100));
              void confirm({ title: '队列二', message: '第二项' }).then((v) => setAnswer(`二${v}`));
              setAnswer('已排队');
            }}
          >
            确认排队
          </Button>
          <output aria-label="确认结果">{answer}</output>
          <output aria-label="不再询问结果">{String(checked)}</output>
        </div>
      </section>
      <section aria-label="Tabs">
        <h2>Tabs</h2>
        {(['segment', 'underline'] as const).map((appearance) => (
          <Tabs key={appearance} appearance={appearance} defaultValue="one">
            <TabsList aria-label={`预览标签 ${appearance}`}>
              <TabsTrigger value="one">
                <File />
                第一页
              </TabsTrigger>
              <TabsTrigger value="two">第二页</TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                不可用
              </TabsTrigger>
              {!tabClosed && (
                <div className="flex items-center">
                  <TabsTrigger value="doc">文档</TabsTrigger>
                  <TabsClose name="文档" onClick={() => setTabClosed(true)} />
                </div>
              )}
            </TabsList>
            <TabsContent value="one">第一个面板</TabsContent>
            <TabsContent value="two">第二个面板</TabsContent>
            <TabsContent value="doc">文档内容</TabsContent>
          </Tabs>
        ))}
      </section>
      <section aria-label="Collapsible">
        <h2>Collapsible</h2>
        {(['plain', 'card'] as const).map((appearance) => (
          <Collapsible key={appearance} appearance={appearance} className="my-3 w-80">
            <CollapsibleTrigger meta="3 项参数">展开 {appearance}</CollapsibleTrigger>
            <CollapsibleContent>模型、参数、任务 ID 和结果链接</CollapsibleContent>
          </Collapsible>
        ))}
      </section>
      <section aria-label="Alert">
        <h2>Alert</h2>
        <div className="grid gap-3">
          {(['info', 'success', 'warning', 'error'] as const).map((tone) => (
            <Alert
              key={tone}
              tone={tone}
              title={`${tone} 标题`}
              action={
                <Button variant="secondary" size="sm">
                  重试
                </Button>
              }
            >
              说明文字，持续显示的提示不会自动消失。较长内容可以自然换行。
            </Alert>
          ))}
          {showAlert && <Alert onDismiss={() => setShowAlert(false)}>可关闭提示</Alert>}
        </div>
      </section>
      <section aria-label="Toast">
        <h2>Toast</h2>
        <div className="preview-row">
          {(['info', 'success', 'warning', 'error', 'loading'] as const).map((tone) => (
            <Button
              key={tone}
              variant="secondary"
              onClick={() => {
                const id = toast({ title: `${tone} 通知`, description: '详细说明', tone });
                if (tone === 'loading') setLoadingId(id);
              }}
            >
              通知 {tone}
            </Button>
          ))}
          <Button
            variant="secondary"
            onClick={() => toast.update(loadingId, { tone: 'success', title: '任务完成' })}
          >
            完成加载通知
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: '短时通知', duration: 800 })}>
            短时通知
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              for (let i = 0; i < 4; i++) toast({ title: `排队通知 ${i}`, tone: 'error' });
            }}
          >
            通知堆叠
          </Button>
        </div>
      </section>
      <section aria-label="Badge">
        <h2>Badge / Count / Dot</h2>
        {(['subtle', 'solid'] as const).map((appearance) => (
          <div className="preview-row" key={appearance}>
            {(['neutral', 'accent', 'success', 'warning', 'danger', 'info'] as const).map(
              (tone) => (
                <Badge key={tone} tone={tone} appearance={appearance}>
                  <File />
                  {tone}
                </Badge>
              ),
            )}
          </div>
        ))}
        <div className="preview-row">
          {(['accent', 'danger', 'neutral'] as const).map((tone) => (
            <BadgeCount key={tone} tone={tone} count={120} />
          ))}
          {(['neutral', 'accent', 'success', 'warning', 'danger'] as const).map((tone) => (
            <span className="flex items-center gap-1" key={tone}>
              <StatusDot tone={tone} />
              {tone}
            </span>
          ))}
        </div>
      </section>
      <section aria-label="Progress">
        <h2>Progress</h2>
        <div className="grid gap-3">
          {(['small', 'regular'] as const).map((size) => (
            <div className="grid gap-3" key={size}>
              {(['accent', 'success', 'danger'] as const).map((tone) => (
                <Progress
                  key={tone}
                  aria-label={`${size} ${tone}`}
                  value={60}
                  tone={tone}
                  size={size}
                />
              ))}
              <Progress aria-label={`不确定 ${size}`} size={size} />
            </div>
          ))}
          {(['accent', 'success', 'danger'] as const).map((tone) => (
            <ProgressField
              key={tone}
              label={`${tone} 下载`}
              value={42}
              tone={tone}
              hint="剩余时间或失败原因"
            />
          ))}
          <div className="preview-row">
            {([16, 24] as const).flatMap((size) =>
              (['accent', 'danger'] as const).map((tone) => (
                <ProgressRing
                  key={`${size}-${tone}`}
                  aria-label={`${size} ${tone} 环`}
                  size={size}
                  tone={tone}
                  value={60}
                />
              )),
            )}
          </div>
        </div>
      </section>
      <Toaster />
    </>
  );
}
export function OverlayPreview() {
  return (
    <ConfirmProvider>
      <Examples />
    </ConfirmProvider>
  );
}
