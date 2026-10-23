# UI V1 实施与验收

最后更新：2026-10-24

## 交付状态

第二批 E–H 已完成，`feature/ui-v1-overlays` 已推送并回读验证；完整回归 95/95，最终浮层复验 8/8。详见下方“第二批”章节。

A–D 已完成并通过各阶段门禁，分支 `feature/ui-v1-foundation` 已推送，远端分支回读包含全部四阶段提交。工作区代码保持版本 0.2.5，没有 PR、合并、标签或发布。

| 阶段 | 提交 SHA | 说明 |
| --- | --- | --- |
| A | `90cb20a7d5ab7dd1ef1b72a0f65d7b704c5ee51a` | 工作区、变量、旧样式隔离、测试定位与打包门禁 |
| B | `2a5114602f0276263129388578429329d861063d` | 系统强调色、原生侧栏与窗口焦点 |
| C | `2d2971bb469e47d1b0ee8f755d459a7a79513a0e` | 12 个组件家族、开发预览与截图回归 |
| D | `86cb31f38bac4c6a0bf214a7a6dcc5bfe3db76cd` | 设置试装、旧规则清理和最终回归 |


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

A–D 已实现；各阶段证据与最终验收见下文。

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

1. Button loading 保持原宽度、保留可访问名称，以居中 Spinner 替代可见内容。根据用户 2026-10-23 跟进修复文档确认，Figma 已同步为 `state=loading`，本次不改 loading 实现。
2. Figma 字体为 SF Pro，中文存在回退；实现使用指定系统字体栈，中文为设备实际字体。原生 select 菜单和字体栅格化会随平台变化，未把 Figma 静态菜单/字形作为图片复刻。
3. 预览按组件家族和可操作状态排列，不复刻 Figma 的整张评审画板坐标；颜色、高度、圆角、间距、阴影和图标依照参数。Figma 的 hover/pressed/focus 为静态展示，代码由真实交互产生。
4. Radix 当前单选 ToggleGroup 输出 radiogroup/radio；方向键移动焦点、Space/Enter 选择。设置页保留必选逻辑，不允许取消到空值。
5. 测试截图基准由当前 macOS 主机生成；Windows 字体与菜单需在对应平台另建基准并验收。

- C 最终验证：pnpm check、pnpm build、完整实窗回归 **89/89（3.2m）** 通过，包含两个已提交截图基准和组件交互；最终生产 renderer 扫描仍无预览入口标记。根目录工程检查包含 UI 包 strict 类型检查与变量门禁。

## D：设置页试装

- 通用：主题改为必选的 segmented ToggleGroup（跟随系统 / Light / Dark），保留系统监听、即时保存和重载恢复；下载“不再询问”改为 Radix Checkbox，选择目录与错误重试继续走原桥接。
- 模型：ModelSettings / RelaySettings 使用 Button、Field、Input、InputGroup、NativeSelect、Checkbox、Spinner；保留模型来源、协议、Key 加密存储/留空保留/显隐/清除、未保存提示、获取模型与测试连接逻辑。
- 内网：ServiceSettings 使用 Field + Input，登录域名使用自动增高 Textarea；保留地址校验、保存/取消和登录边界。PlatformLoginControls 同步替换 Button。
- 插件/技能：保留现有 Tab 语义、键盘行为和 Portal 操作区，按钮换 Button、启停换 Checkbox。UpdateStatus 仅在 settings 模式使用新 Button，其他页面更新提示仍沿用旧样式。
- ModelPicker 实际仅被 ChatComposer 调用，没有设置页调用点，本轮未迁移聊天模型选择器。全部 window.confirm 和业务存储格式保持原有实现。
- 清理 legacy.css 60 个、agent.css 42 个、updates.css 4 个过时选择器。混合文件剩余非设置页面的 51 个颜色字面量原值提升为 legacy-static-color 兼容变量，移除这三个 CSS 文件的白名单；没有把未迁移的聊天/画布换成 V1 配色。白名单只保留 canvas-vision.ts、canvas-agent.css、writing.css。
- 集成补充：Textarea autoResize 默认单行，28px 起始高度随内容和宽度增高，关闭自动增高时释放内联高度；保留固定 96px 模式。修正空 FieldError 不应使 Field 失效、NativeSelect 无受控值时的占位、ghost Input 的 invalid 焦点描边、InputGroup 仅外壳显示错误圈。对应预览断言与两张基准已更新，未删行为断言。
- 专项回归：通用/下载 2/2（4.1s），模型/聊天/画布 Agent 3/3（19.6s），内网/登录/技能/既有画布 7/7（33.0s），最终组件预览 3/3（5.9s）通过。最终 pnpm check、pnpm build 与完整实窗回归 **89/89（3.1m）** 通过。
- 最终目录包：`release/63791817-5fd2-4c62-a484-87332fccc4fa`；再次通过 360 项生产依赖、darwin arm64 真实启动、ASAR、版本 0.2.5 与更新 bridge。目录包未签名，未发布。
- 最终截图目录 `apps/desktop/test-results/ui-v1/phase-d/` 共 24 张：原八个页面 × Light/Dark，另加 model-form、model-deepseek、plugins-mcp、services-narrow 各两张。已检查通用、模型表单、内网、插件及窄窗口，未见横向溢出。原生透明区域在 PNG 中保留 alpha，不代表已完成桌面壁纸下的材质观感验收。

## 检查结果汇总

耗时为命令输出的 Turbo 任务耗时与 Playwright 套件耗时，不含工具调度时间。

| 阶段 | pnpm check | pnpm build | pnpm test:smoke |
| --- | --- | --- | --- |
| A | Biome 181 文件；类型任务 2/2，6.625s | 成功，0.766s | 84/84，3.1m |
| B | Biome 186 文件；类型任务 2/2，6.253s | 成功，0.614s | 86/86，3.1m |
| C | Biome 203 文件；类型任务 2/2，7.15s | 成功，1.101s | 89/89，3.2m |
| D | Biome 204 文件；类型任务 2/2，6.307s | 成功，0.696s | 89/89，3.1m |

完整输出保存在 `apps/desktop/test-results/ui-v1/verification/`。早期失败均在上文记录并修复：A 为定位误迁移；B 为 Playwright 强制焦点模拟；C/D 为实际样式层级、字号合并和组合边界。没有通过删除业务断言绕过失败。

## 主要文件

- A：`packages/ui/package.json`、`src/styles/tokens.css`、`src/lib/utils.ts`；renderer `styles.css` / `legacy.css` / `App.tsx` / `PromptMentionMenu.tsx`；`scripts/check-tokens.mjs`、`token-legacy-allowlist.json`、`capture-ui.mjs`；原有 Electron 测试及稳定 data-testid。
- B：`apps/desktop/src/main/appearance/bridge.ts`、`shared/appearance.ts`、`shared/desktop-info.ts`、`preload/index.ts`、main `index.ts`；renderer `features/settings/appearance.ts` / `appearance.css`；`tests/appearance.spec.ts`。
- C：`packages/ui/src/components/` 的 12 个家族、`hooks/use-textarea-resize.ts`、`styles/base.css`；renderer `dev/UiPreview.tsx`；`tests/ui-preview.spec.ts`、安全预览 fixture 与截图基准。
- D：GeneralSettings / DownloadSettings / ModelSettings / RelaySettings / ServiceSettings / PlatformLoginControls / PluginSettings / SkillsSettings / UpdateStatus；`settings.css`、旧规则清理与兼容变量；主题测试的新 radiogroup 语义及集成边界回归。

## 待实机验收与范围

- 当前自动化主机 macOS 27.0.1；macOS 13/26 材质观感、真实系统强调色设置变化，以及 Windows 强调色通知和字体/原生菜单仍待目标机器验收。
- 对接真实公司登录、模型与生成服务不属于本轮视觉迁移；测试使用既有模拟服务与隔离配置。
- 未创建 PR、合并、打标签或发布；Figma 只读核对，未修改设计。

- 字体取舍：新控件与设置使用指定系统字体栈，README 已纠正旧 Noto Sans SC 描述；未引用的 @fontsource/noto-sans-sc 旧依赖暂保留，优先满足主实施说明要求的生产依赖清单不变（360 项）。Google Doc 中提到的依赖清理未在本批执行。

- D 全量首次 88/89，通过设置与组件全部用例；既有侧栏动画固定两帧采样偶发仍在起点，单独复跑又出现末次拖动更新未完成的时序波动。测试改为在有界 RAF 窗口等待真实中间位移、鼠标释放前等待最后宽度，不修改应用侧栏逻辑；保留中间位移、宽度、持久化、反向动画、焦点恢复和减少动态效果全部断言。专项 2/2（5.4s）通过，最终全量结果见汇总。


## 推按钮禁用态跟进修复（2026-10-23）

- 依据用户 `codex-prompt-ui-v1-fix-disabled.md`，在 feature/ui-v1-foundation、483648c 基础上修复。修改集中在 packages/ui/src/styles/base.css；没有改组件业务或 loading 实现。
- secondary Button（含图标、capsule / circle）、default NativeSelect、outline Toggle off 禁用时使用 surface-raised + hairline separator 边框，去阴影，文字/图标用 fg-disabled；outline Toggle on 禁用保留 fill 背景并补 separator 边框。Select 箭头单独随禁用状态变色。
- 专用禁用规则覆盖 hover / pressed，Button 明确排除 data-loading=true；default/destructive/ghost Button、Input/Textarea/InputGroup、compact Select、default Toggle 的原禁用规则保持。
- 测试在 Light/Dark 分别精确检查四种禁用态的背景/边框/文字/阴影、实际鼠标 hover/按下、箭头/图标颜色、全部 Button 尺寸及 capsule/circle，并保留 loading 与未变控件断言。预览新增两个禁用 outline Toggle 样张，不移动其他组件布局。
- 复现证据：修复前 secondary 禁用背景实际为 rgba(0,0,0,0.05)，与期望白底断言不符。修复后预览 3/3（6.6s）、变量门禁通过；pnpm check 检查 204 个文件、两个类型任务通过（7.684s），pnpm build 通过（0.703s），pnpm test:smoke 完整 **89/89（3.1m）** 通过。
- macOS 27.0.1 已重生成 `tests/ui-preview.spec.ts-snapshots/preview-light-darwin.png` / `preview-dark-darwin.png`。有意的样式变化仅在禁用相关区域；原已提交基准还包含上一轮 InputGroup 错误圈的过时像素，本次原 CSS 同环境重采已证实这不是禁用修复造成的变化。新基准如实反映当前 UI，不作人工像素拼接。
- 同环境原 CSS / 新 CSS 对比：Light 12222、Dark 12355 个不同像素；四个禁用区域（含阴影边缘）以外分别仅 15 / 157 个零散栅格化像素。原始基准、即时前后截图、差异图和区域坐标均在 `apps/desktop/test-results/ui-v1/fix-disabled/`，详见 fresh-snapshot-diff.json；不能将整张图称为非禁用区域逐像素完全一致。
- 设置截图：`node scripts/capture-ui.mjs fix-disabled-settings` 生成 `apps/desktop/test-results/ui-v1/fix-disabled-settings/` 共 16 张浅深截图；已核对通用“检查更新”和内网平台登录按钮的禁用外观。截图保留原生透明区域 alpha。

- 本次修改文件：`packages/ui/src/styles/base.css`、`apps/desktop/src/renderer/src/dev/UiPreview.tsx`、`apps/desktop/tests/ui-preview.spec.ts`、两张 macOS 预览基准、`memory/design.md` 与本报告。完整检查日志保存于 `apps/desktop/test-results/ui-v1/fix-disabled/verification/`。

## 第二批：浮层与反馈（2026-10-24）

依据用户 `codex-prompt-ui-v1-batch2.md`，从最新 origin/develop 创建 `feature/ui-v1-overlays`。授权 E–H 独立提交与最终推送，不创建 PR、合并、标签或发布。设计分支只读参考，未合入；Google Docs v0.2 与 Figma 当前节点已读取。本任务明确授权实现第二批初稿。

### E：变量与依赖

- 新增 scrim 语义色及 bg-scrim 映射：Light black-25、Dark black-50；补齐 secondary Button 的 data-disabled 禁用选择器，浅深测试直接验证 asChild 链接的背景、描边、文字及阴影。
- 精确依赖：Radix popover 1.3.1、dropdown-menu 2.2.1、dialog 1.3.1、alert-dialog 1.2.1、tabs 1.2.1、collapsible 1.2.1、toast 1.3.1。Progress 计划用原生 ARIA + 百分比宽度与 SVG，避免为无交互展示引入额外依赖。
- 检查与构建通过；完整窗口回归 89/89（3.1m）通过。首轮 87/89，新增测试样例与旧选择器冲突；恢复样例属性后预览 3/3（6.4s），全量重跑通过。日志：`apps/desktop/test-results/ui-v1/batch2-verification/e-*.log`。

### 第二批设计来源

Figma 文件 `mIwnyR5nAlECFMam1NvmER`、V1-Components 页 `332:28013`。本轮只读核对 Popover `358:30609`、DropdownMenu `360:30994`、Dialog `362:31494`、AlertDialog Review `363:32030`、Tabs Trigger `367:31760`、Collapsible `369:31917`、Alert `370:32084`、Toast `371:32325`、Badge `376:32522`、Progress `378:32536`。以用户任务数值优先于初稿局部差异（如 Tabs 字号、AlertDialog 图标尺寸及 Collapsible 内边距）。

### F：组件与预览

- E 提交：`157ce2d`。F 新增 Popover/CandidateList、DropdownMenu、Dialog、AlertDialog/ConfirmProvider、Tabs、Collapsible、Alert、Toast、Badge、Progress 家族。组件可透传 ref/className/ARIA；复杂结构采用组合 API，样式状态放 utilities 层，未增加 token 白名单。
- `#/ui-preview` 追加第二批全部家族，含各尺寸/语义色、候选空态/长文本、可操作浮层、菜单复选/单选/子菜单、独立文档关闭按钮、通知队列与加载更新。
- 预览专项 8/8（23.5s），检查 216 文件、类型 2/2（6.373s），构建成功（633ms）。完整回归 94/94（3.3m）通过。
- macOS 基准由 1280×2137 扩展为 1280×3780。第一批内容区 y<2070 与旧基准相比 Light 110 / Dark 76 个不同像素，属于少量字形栅格化差异；含旧底部留白/Tooltip 阴影的全旧画布范围分别 1339 / 1305 像素。未改第一批布局与组件规则。浅深整图已目视检查。
- 取舍：Progress 用 ARIA 和百分比宽度，圆环使用 SVG；没有 Radix Progress 依赖。Collapsible 使用状态切换和 chevron 旋转，未引入高度动画；减少动态效果时去掉旋转过渡。MediaEditor 是否替换在 H 评估。

### G：低风险页面接入

- F 提交：`a73903a`。App 根 ConfirmProvider 统一 9 处确认，保留原文案并拆出标题；设置导航、模型配置返回、模型删除、对话删除、重新生成、写作重新读取均在等待前加锁，取消不改变数据。生成确认后重新读取当前项目/节点，避免旧快照请求。
- PluginSettings 使用 segment Tabs；WritingSpace 辅助栏使用 underline Tabs。ChatActivity 三类 details 与 GenerationDetails 改为 Collapsible；UpdateStatus 使用 ProgressField；References / Canvas 使用 BadgeCount。
- 原生确认测试改为实际操作 AlertDialog；保留删除模型/对话的取消与确认断言，补齐设置离开、未知结果重新生成、写作冲突重新读取的两条路径。进度断言改用 aria-valuenow，数量用可访问名称与数字验证。
- 集成发现 Radix 默认卸载关闭内容，与原生 details 语义不同：CollapsibleContent 默认 forceMount 并在关闭时 display:none，保留既有内容/组件状态及业务断言。首轮生成/导出失败源于这一差异，已修复；引用数量旧文本断言同步迁到新角标语义。
- 最终门禁：检查 216 文件、类型 2/2（7.559s），构建成功（731ms），完整回归 95/95（3.3m）通过。写作专项 5/5（14.8s）。新增写作用例曾错误假设另存副本保留原标签，现独立验证冲突重新读取；原另存副本断言保留。未改数据、存储或原生接口。

### H：浮层与反馈页面接入

- G 提交：`d7ed150`。写作文件夹及更多菜单换为 DropdownMenu，移除与 Portal 冲突的手写外部点击监听；原菜单项、禁用条件和刷新/目录切换调用保留。
- SkillPicker 与 PromptMentionMenu 使用 CandidateList；保留稳定 option id、aria-activedescendant、CodeMirror 键盘/组合输入、Portal 位置和滚动跟随。文件名继续为主文字，引用编号为说明；悬停更新 active，mousedown 保留输入焦点。
- GenerationNotice 使用 Toast，仍按既有队列逐条显示，阅读时间为 max(12 秒, 字数×200ms)，关闭/到期才推进原队列。组件卸载清理不触发业务 dismiss。CanvasExport 以同一 id 从 loading 更新 success/error，保留防重复导出、取消和异常语义；原实现没有“打开文件”动作，未新增原生接口或虚构操作。
- ChatPage 错误、WritingSpace 提示/冲突、Canvas 连接/导入错误、CanvasAgentSidebar 错误、GenerationDetails 任务错误/警告/复制错误使用 Alert；表单字段错误保持原实现。画布拖入引导是操作期间状态，保存状态为持续状态，均保留；未发现需改 Toast 的其他临时 status。
- 按文件清理失效 CSS：legacy.css 28、agent.css 17、writing.css 12、updates.css 4、settings.css 1、canvas-agent.css 6 个规则删除或收敛；无文件删除。canvas-agent.css 的差异色改用 success/danger 语义变量，移出白名单；保留 canvas-vision.ts 与 writing.css 中本批未迁移部分的旧例外。
- 补充组件说明到 packages/ui/README.md。排队确认继承最初触发位置；第二个请求在第一个已打开后到达的焦点恢复已纳入预览回归。Tabs 禁用规则覆盖选中外观。第二批图标统一 1.75 线宽，缩略图内图标居中；高频候选列表直接出现，其他浮层使用统一时长、曲线与减少动态效果策略。
- 阶段 H 专项首轮 33/36：业务链路通过，失败为 @ 引用旧深色背景断言和两张预览基准。更新旧颜色断言为 surface-raised 后，预览 + @ 引用专项 10/10（28.1s）通过，中文组合输入、原子删除、撤销、剪切/粘贴断言全部保留。基准变化只在第二批图标与缩略图区域。

### 逐处迁移结果与保留项

| 位置 | 结果 |
| --- | --- |
| App 四处离开/导航确认 | 已替换，统一等待锁，取消保持路由与编辑值 |
| RelaySettings 返回 | 已替换，未保存配置确认与等待锁 |
| ModelSettings 删除 | 已替换，destructive，取消保留模型/记录 |
| CanvasConversations 删除 | 已替换，destructive，submitting 在确认前锁定 |
| useGeneration 未知结果重试 | 已替换，确认按钮“仍要重新生成”，取消不发请求，确认后重读节点 |
| useWriting 重新读取 | 已替换，取消保留冲突缓冲，确认后读取磁盘 |
| PluginSettings / WritingSpace 辅助栏 | 已替换 Tabs，保留内容和持久化选中项 |
| ChatActivity 三处 / GenerationDetails | 已替换 Collapsible，保留原默认展开与关闭内容挂载 |
| UpdateStatus | 已替换 ProgressField，保留百分比、大小、速率与错误 |
| References / Canvas 下载数量 | 已替换 BadgeCount，保留数量可访问名称 |
| WritingSpace 两处菜单 | 已替换 DropdownMenu |
| ChatComposer.menuOpen | 实际为技能 listbox，经 SkillPicker 接入 CandidateList，无普通菜单可替换 |
| SkillPicker / PromptMentionMenu | 已替换 CandidateList，输入和定位仍由原业务控制 |
| GenerationNotice / CanvasExport | 已替换 Toast，原队列与导出 API 不变 |
| ChatPage / WritingSpace / Canvas / CanvasAgentSidebar / GenerationDetails 持续错误 | 已替换 Alert |
| MediaEditor 放大外壳 | 评估后保留：普通态和放大态共用同一个 CodeMirror 实例；切换到 body Portal 会重挂载编辑器，风险涉及历史/选区、引用 Portal 与 Esc 两级还原。此外已有 960×600 尺寸验收，与 Dialog lg=800 不同。本批不重构该交互，既有实窗覆盖继续验证 |
| Popover / ContextUsage | Popover 已在预览交付；ContextUsage 同时支持 hover tooltip 与点击保持，现有测试明确验证两种行为，本批保留混合提示，不改成仅点击弹层 |

### 第二批与设计的差异及验收边界

1. 采用任务文件优先：Candidate 描述/meta 为 callout 12px、内边距 8、active 全白；部分 Figma 初稿仍为 11/10px、纵向 4 和说明 85% opacity。Tabs segment callout 12px、图标 16；AlertDialog 图标 20；Collapsible 内边距按任务明确值。色彩方向与组件结构保持原稿。
2. Progress 的百分比宽度与动态 SVG 替代 Figma paddingRight/静态圆弧，符合任务要求；小圆环 viewBox 的 3 单位线宽经 16/24 缩放为实际 2px，大圆环为 2.5px。
3. 系统字体、动态系统强调色沿用第一批。Figma 静态 SF Pro 与当前 macOS 字形栅格化存在差异。候选缩略图取真实素材，Lucide 图标复用已安装库；未引用临时 Figma URL。
4. 预览按家族排列而非复制评审画板坐标；Dialog、Popover、菜单和确认框用真实触发器打开。截图补充打开状态，行为通过实窗测试验证。
5. 当前主机 macOS 27.0.1；macOS 13/26、Windows 字体、系统强调色及浮层表现仍需目标设备人工验收。真实内网/第三方生成服务不在本轮验证范围。
6. 未创建 PR、合并、打标签或发布。四阶段功能提交已推送并回读验证，后附提交表。

### 第二批检查与文件索引

| 阶段 | pnpm check | pnpm build | pnpm test:smoke |
| --- | --- | --- | --- |
| E | Biome 204 文件，类型 2/2，6.153s | 成功，639ms | 89/89，3.1m |
| F | Biome 216 文件，类型 2/2，6.373s | 成功，633ms | 94/94，3.3m |
| G | Biome 216 文件，类型 2/2，7.559s | 成功，731ms | 95/95，3.3m |
| H | Biome 216 文件，类型 2/2，7.58s | 成功，700ms | 95/95，3.4m；最终浮层复验 8/8，25.5s |

耗时口径沿用第一批：Turbo 任务耗时和 Playwright 套件耗时，不含工具调度。原始日志位于 `apps/desktop/test-results/ui-v1/batch2-verification/`，保留首轮失败与修复后输出。

- E：packages/ui/package.json、pnpm-lock.yaml、tokens.css/base.css、renderer styles.css、ui-preview.spec.ts。
- F：packages/ui/src/components 的 11 个文件（Popover 与 CandidateList 为一个家族）、base.css/tokens.css、dev/OverlayPreview.tsx / UiPreview.tsx、ui-preview.spec.ts 和两张 macOS 基准。
- G：App、RelaySettings、ModelSettings、CanvasConversations、useGeneration、useWriting、PluginSettings、WritingSpace、ChatActivity、GenerationDetails、UpdateStatus、References、Canvas；对应行为测试及 Collapsible 挂载语义修正。
- H：SkillPicker、ChatComposer、PromptMentionMenu、PromptEditor、WritingSpace、GenerationNotice、CanvasExport、ChatPage、CanvasAgentSidebar、Canvas、GenerationDetails；六份旧 CSS、token-legacy-allowlist.json、capture-ui.mjs、组件 API 说明与截图/行为验证。
- 源码截图基准：`apps/desktop/tests/ui-preview.spec.ts-snapshots/preview-{light,dark}-darwin.png`；额外证据目录 `apps/desktop/test-results/ui-v1/phase-h/`（本机测试产物，不提交 Git）。


H 最终证据：`h-smoke-verified.log` 95/95（3.4m），最终 `h-check-final.log` / `h-build-final.log` 与 `h-overlays-final.log` 全部通过。Popover 外部关闭也恢复触发焦点；排队确认在已打开时追加请求后恢复最初触发点；折叠悬停颜色和叠卡数量不被遮挡均有断言。复查收敛聊天提示宽度、叠卡角标层级及折叠样式优先级后完成上述验证。

`node scripts/capture-ui.mjs phase-h` 成功。目录共 **36 张 PNG**：八个页面 × 两主题（16）、真实设置确认/写作菜单打开（4）、组件候选/确认/对话框/菜单/Popover/Toast 三条堆叠 × 两主题（12）、真实技能与 @ 引用两主题（4）。已目视检查浅深组件、确认框、菜单、Toast 堆叠、技能候选和引用菜单。`flow-screenshot-sources.json` 记录四张业务截图来源与校验值；`batch2-verification/preview-diff.json` 记录第一批内容区域与 E 提交基准的像素差异。

本批授权范围内没有未完成的必做实现或自动化验收；MediaEditor / ContextUsage 的评估保留项及目标系统人工验收见上表。源码版本维持 0.2.5，无文件删除、无新增原生接口、无真实模型/生成服务请求。


### 第二批提交与推送

| 阶段 | 提交 SHA | 说明 |
| --- | --- | --- |
| E | `157ce2dd4740180480c5667da15b5e4651bf41b1` | scrim、精确依赖、asChild 禁用修复 |
| F | `a73903a088ab74d3b89f91ef8844cb492a41be86` | 全部第二批组件、浅深预览与交互回归 |
| G | `d7ed1503792d8ae04a5bdb005ab02e5d81ae2155` | 九处确认与低风险页面接入 |
| H | `34871025f309e643d988ead219624d77feac7b7e` | 菜单、候选、Toast、Alert、旧规则清理与最终验收 |

`git push -u origin feature/ui-v1-overlays` 成功；`git ls-remote --heads origin feature/ui-v1-overlays` 回读为阶段 H 完整 SHA。其后仅追加本验收索引和工程/Git 记忆的文档提交，并随同一功能分支推送。没有 PR、合并、版本标签或发布。
