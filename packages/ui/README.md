# @jarvis/ui

仓库内部 React DOM 控件，以源码导出，由 renderer Vite 编译。应用将本包放在 devDependencies；不依赖 Electron、window.desktop 或业务数据。

```tsx
import { Button } from '@jarvis/ui/components/Button';
import { Field, FieldLabel, FieldDescription } from '@jarvis/ui/components/Field';
import { Input } from '@jarvis/ui/components/Input';

<Field controlId="model-name" orientation="horizontal">
  <FieldLabel>模型名称</FieldLabel>
  <Input />
  <FieldDescription>用于模型列表的显示名称。</FieldDescription>
</Field>
<Button type="submit" loading={saving}>保存</Button>
```

Field 的 controlId 与内部控件及标签关联；error 属性会替换 description 并设置 aria-invalid / aria-describedby。也可直接组合 FieldError / FieldDescription。使用已有控件 id 时，将相同 id 传入 controlId。一个 Field 对应一个主控件。

Button 默认 type=button。variant 为 default / secondary / ghost / destructive；文字和图标尺寸共八档。circle 仅接受 icon 尺寸。loading 保留原内容宽度及可访问名称，以居中 Spinner 替代可见内容，并阻止点击；异步完成与错误由调用方管理。asChild 使用 Radix Slot，禁用或加载中的链接也会阻止触发。

IconButton 要求 aria-label，并自动附带 Tooltip。Checkbox 使用 Radix checked / defaultChecked / onCheckedChange，mixed 值为 indeterminate。ToggleGroup 首批只支持 type=single，Radix 输出 radiogroup / radio，方向键移动焦点、Space 选择；必选场景由调用方忽略空值。

InputGroup 组合 Input、InputGroupAddon 与末尾 Button。尺寸传给 InputGroup；组内 Input 继承文字与高度。禁用表单使用原生 fieldset disabled，避免只改变外观。Textarea 默认固定高度，autoResize 跟随内容和宽度变化，保留调用方键盘与组合输入事件。

组件状态规则处于 utilities 层，以免静态颜色工具类覆盖 hover、disabled 等状态；旧样式位于 legacy 层。变量只能从 tokens.css 取得，cn 已识别项目字号阶梯。开发时运行 pnpm dev 后打开 #/ui-preview；生产构建按 import.meta.env.DEV 移除该入口。

第二批浮层均在 html 主题作用域内 Portal 到 body，调用方无需指定主题容器。Popover / DropdownMenu / Dialog / AlertDialog 导出 Root、Trigger、Content 和结构部件；菜单自动根据同一面板内的复选或单选项预留勾选列。

CandidateList 只提供 listbox / option 展示。每项必须传稳定 id 和 active，调用方维护输入框的 aria-activedescendant、方向键、Enter/Tab/Esc、组合输入与光标定位。onActive 用于悬停更新当前项，mousedown 保持输入框焦点。

Tabs 的 appearance 为 segment / underline。文档关闭按钮用 TabsClose，与 TabsTrigger 并列，不能嵌套在 Trigger 中。Collapsible 支持 plain / card，默认保留关闭内容的挂载与状态，关闭时隐藏。

在应用根挂载一个 ConfirmProvider，组件内 useConfirm() 获取异步 confirm。confirm({title, message, confirmLabel, cancelLabel, tone}) 返回 Promise<boolean>；请求按顺序展示，默认聚焦取消，Esc 返回 false，Provider 卸载取消全部待处理请求。业务调用方在 await 之前设置防重复锁，在 finally 中释放。可选 checkboxLabel / onCheckedChange 供“不再询问”，是否保存由调用方在确认结果后决定。

在应用根挂载一个 Toaster。toast({title, description, tone, action, onDismiss}) 返回 id，toast.update(id, changes) 更新同一条通知，toast.dismiss(id) 关闭；最多显示三条，其余排队。info/success 默认五秒，error/loading 常驻，悬停和聚焦暂停计时。业务可以传 duration 延续原有阅读时长；卸载业务展示时用 toast.dismiss(id, false) 清理而不推进业务队列。

Alert 用于持续提示；临时反馈才使用 Toast。Badge 为只读状态，BadgeCount 自动显示 99+，StatusDot 必须配合文字。Progress value 为 null/undefined 时表示不确定，ProgressField 组合标签、数值和提示，ProgressRing 只用于确定进度。组件不解释业务数据或发起原生操作。
