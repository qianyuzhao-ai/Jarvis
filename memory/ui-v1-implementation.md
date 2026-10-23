# UI V1 实施与验收

最后更新：2026-10-23

任务依据：用户提供的 `codex-prompt-ui-v1.md`。当前授权覆盖 A–D 实现、阶段提交与功能分支推送，不包括 PR、合并或发布。从 origin/develop 创建 feature/ui-v1-foundation；设计分支只读参考，未合入。

设计来源：[方案 v0.2](https://docs.google.com/document/d/1Z2vZyoCYf3dsKiBwbDrzSDeXsLjj6bJWfk6BwnTLd2M/edit)、[V1 Components](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=332-28013)。当前任务明确授权按初稿实施，替代旧设计笔记中本批组件“仅设计、待授权实现”的边界；不改变其他未确认设计的状态。

## A：规范与基建

- 新增 @jarvis/ui 源码工作区、精确 peerDependencies、clsx 2.1.1 与 tailwind-merge 3.7.0；desktop 以 devDependencies 引用，两个 tsconfig 均覆盖 UI 源码。
- tokens.css 保留用户指定全部基础值与浅深语义变量；Tailwind inline 映射、清空默认色板/字号/圆角/阴影。迁移前未发现业务组件使用默认颜色、字号、圆角或阴影工具类。
- 原 styles.css 规则移到 legacy.css；入口统一声明 theme/base/legacy/components/utilities 顺序并加载各功能 CSS。重叠的旧颜色/圆角/字体改用 legacy 前缀保留原值。避免 JavaScript 模块导入顺序提前创建 legacy 层导致 reset 覆盖页面。
- 主题属性移至 html，旧变量也提升到根作用域，Prompt Portal 挂到 body。theme-root 保留布局与更新安装 inert 状态。
- 变量检查器按文件与具体字面量计数约束现存例外；白名单文件也不能新增颜色或任意值。另检查 UI 包对 Electron / window.desktop / 应用路径的依赖边界。检查器回归 1/1 通过。
- tests 顶层 TypeScript 文件中 locator/querySelector/querySelectorAll 的 class/id 调用 270 → 66；其中应用自有样式类调用 208 → 0。剩余为 React Flow / CodeMirror 第三方类（含 React Flow selected 状态）。16 条 toHaveCSS 断言保留。口径与原文估计的 247/13 不同，报告使用实际扫描值。
- 16 张截图（Chat、项目列表、画布、写作、通用、模型服务、内网地址、插件 × Light/Dark）逐像素差异全部为零。目录 `apps/desktop/test-results/ui-v1/before/` 与 `apps/desktop/test-results/ui-v1/phase-a/`；可用 `node scripts/capture-ui.mjs <阶段>` 重采。该基线覆盖页面默认状态，复杂行为由实窗回归覆盖。
- `pnpm check`、`pnpm build` 已通过；最终完整实窗回归 **84/84（3.1m）** 通过。初轮定位迁移误替换 React Flow selected 类，已恢复第三方定位，没有删除行为断言。
- `pnpm package:dir` 成功。目录包 `release/4c9421f4-f67f-458e-b03e-cfb38f7aff46`；verify-packaged-startup.mjs 检查 360 项生产依赖、真实 darwin arm64 启动、ASAR renderer、版本 0.2.5 和更新 bridge 全部通过。必需依赖数未变化；无签名目录包不是发布产物。

## 后续阶段

B、C 已实现，D 尚未实施。最终报告在各阶段验证后补齐。

## B：原生外观能力

- 新增只读 appearance bridge（getAccentColor / onAccentColor），沿用主窗口、mainFrame、完整 URL 信任校验；没有通用 IPC、文件或系统执行入口。
- 根据 [Electron systemPreferences 官方文档](https://www.electronjs.org/docs/latest/api/system-preferences) 和安装的 Electron 44.9.1 electron.d.ts 核对：macOS 订阅 AppleColorPreferencesChangedNotification，Windows 订阅 accent-color-changed；应用退出释放原生订阅，窗口销毁移除发送目标。
- 只接受 RRGGBBAA；读取失败/非法值/浏览器环境回退 tokens 默认蓝，避免异步初始读取覆盖更新事件，卸载后不再写入。通过 color-mix 派生 hover、pressed、focus-ring、selection，浅深比例分别处理。
- tokens 纳入 theme 层，使应用层系统外观覆盖和默认回退可按层级工作。html 监听 focus/blur，失焦 selection 使用 inactive 值；Button 中性外观将在 C 接入。
- macOS 使用 vibrancy=sidebar、visualEffectState=followWindow 和透明 backgroundColor，ready-to-show 后显示；页面根透明、侧栏半透明、内容区不透明。Windows 和 prefers-reduced-transparency 使用不透明侧栏。
- 原生 API 已按版本类型声明核对；macOS 13 / 26 桌面壁纸透视观感、真实系统设置变更通知和 Windows 实机仍待人工验收。自动化不修改用户系统强调色。

- 当前测试主机为 macOS 27.0.1。初轮完整回归 85/86 通过，仅 BrowserWindow.blur() 在单窗口下未触发失焦断言；改为第二个真实窗口取得焦点后切回，未改应用焦点逻辑。定位确认 Playwright 默认 Emulation.setFocusEmulationEnabled=true；测试关闭该模拟后使用第二个真实窗口验证，新增 2/2 通过。最终 pnpm check、pnpm build、完整实窗 **86/86（3.1m）** 通过。

## C：12 个基础组件家族

- @jarvis/ui 实现 Button（含 IconButton）、Input、Field、InputGroup、Textarea、NativeSelect、Checkbox、Toggle、ToggleGroup、Spinner、Separator、Tooltip；共享工具不引用应用目录或原生能力。
- 依赖精确锁定：Radix slot 1.5.0、checkbox 1.4.1、toggle 1.2.1、toggle-group 1.2.1、separator 1.2.0、tooltip 1.4.1；cva 0.7.1；Lucide 1.60.0 与应用一致。
- 读取并检查 Figma Light/Dark 评审样张：Button 336:27572（具体实例 336:27586）、Input 340:28052、Field 341:28089、InputGroup 342:28596、Textarea 343:28776、NativeSelect 344:29698、Checkbox 345:29178、Toggle 346:29445、ToggleGroup 347:30224、Spinner 349:29841、Separator 350:30304、Tooltip 351:30352。未改 Figma。
- 按需开发入口 `#/ui-preview`；预览通过独立安全 Electron 窗口和临时 loopback Vite 服务测试，生产入口受 import.meta.env.DEV 控制。已扫描生产 renderer，未发现 UI V1 Preview / ui-preview / 切换预览主题。
- 两张截图基准提交到 `apps/desktop/tests/ui-preview.spec.ts-snapshots/preview-{light,dark}-darwin.png`。覆盖全家族、所有尺寸/变体、长文字、图标、禁用/加载/只读/错误、三态复选框、分段单选与 tooltip；hover/pressed/focus 通过真实操作验证。
- 预览回归 3/3（5.5s）通过：浅深 screenshot、精确默认/悬停颜色、20/24/28/32 高度和图标方形、按压颜色、3px 焦点环、失焦 default 按钮、标签/描述/错误关联、只读可聚焦、loading 宽度及重复提交拦截（含 asChild）、Checkbox 标签与 Space、ToggleGroup 方向键/Space、ref、原生选择、Textarea 自动增高和中文组合事件、Tooltip Esc、Tab 顺序。
- 修复验证发现：tailwind-merge 默认会把 text-body 等当文字颜色，已扩展项目字号词表；状态规则纳入 utilities 层以免静态背景工具类盖过 disabled / readOnly。旧规则仍隔离在 legacy 层。

### 与 Figma / 说明的差异与取舍

1. Button loading 按实施说明保持原宽度、保留可访问名称，以居中 Spinner 替代可见内容；Figma 样张是 Spinner 与文字并排，会增加宽度。此处优先用户明确的“宽度稳定”。
2. Figma 字体为 SF Pro，中文存在回退；实现使用指定系统字体栈，中文为设备实际字体。原生 select 菜单和字体栅格化会随平台变化，未把 Figma 静态菜单/字形作为图片复刻。
3. 预览按组件家族和可操作状态排列，不复刻 Figma 的整张评审画板坐标；颜色、高度、圆角、间距、阴影和图标依照参数。Figma 的 hover/pressed/focus 为静态展示，代码由真实交互产生。
4. Radix 当前单选 ToggleGroup 输出 radiogroup/radio；方向键移动焦点、Space/Enter 选择。设置页保留必选逻辑，不允许取消到空值。
5. 测试截图基准由当前 macOS 主机生成；Windows 字体与菜单需在对应平台另建基准并验收。

- C 最终验证：pnpm check、pnpm build、完整实窗回归 **89/89（3.2m）** 通过，包含两个已提交截图基准和组件交互；最终生产 renderer 扫描仍无预览入口标记。根目录工程检查包含 UI 包 strict 类型检查与变量门禁。
