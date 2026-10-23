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
