# 执行计划书：UI V1 第三阶段 · 窗口外壳、跨空间标签、空间 Agent 与画布节点

最后更新：2026-10-24（用户确认：跨空间标签页本阶段实现；写作空间右边栏去掉大纲；右边栏只是 Agent 对话，并能操作所在标签页的空间）

你在仓库 `qianyuzhao-ai/Jarvis`（Electron + React 桌面工作台）中工作。前两批 22 个基础组件已在 `develop`（`packages/ui`、tokens、预览页、截图回归）。本次按 Figma 定稿实现**新的窗口框架**（磨砂外壳 + 白色主面板 + 右边栏）、**跨空间标签页**、**页面迁移**（首页聊天、创作空间、写作空间、设置）、**右边栏空间 Agent**（创作空间沿用画布 Agent，写作空间新增写作 Agent）与**画布节点 / 节点编辑栏**的新样式。按阶段提交，完成后输出验收报告。设计已定稿为初稿，**按设计实现，不自行改变视觉方向，不扩展本计划之外的功能**。

## 0. 必读资料

1. 根目录 `AGENTS.md`：协作规则、命令、进程边界、**文件删除限制**（禁止 `rm -rf` 等批量删除，只能逐个删除明确路径的文件）、当前范围。本计划授权的范围变化：跨空间标签页、写作 Agent（只能读取 / 修改当前标签页打开的文档内容，见阶段 N）；完成后同步更新 `AGENTS.md` 的“当前范围”。
2. `memory/ui-v1-implementation.md`：前两批的实现方式、层级处理、测试与截图做法。**沿用同样约定**（cva、`cn`、状态规则放 utilities 层、`#/ui-preview`、`scripts/capture-ui.mjs`、`scripts/check-tokens.mjs`）。
3. `memory/design.md` 顶部 2026-10-24 的各节（“V1 页面框架”“图标库独立”“Composer”“Assistant Panel”“右边栏移到外壳”“写作空间页面”“项目列表展开状态”“画布工具栏背景”“画布节点”系列），已在 `develop`。设计稿与本计划冲突时以本计划为准（例如写作空间设计稿中的“周报”标签、大纲开关以本计划的跨空间标签与“去掉大纲”为准）。
4. Figma 文件 `mIwnyR5nAlECFMam1NvmER`。能访问 Figma MCP 就逐项核对；不能时以本说明数值为准。

### 设计来源索引

| 内容 | Figma 节点 |
|---|---|
| 页面 `V1-视觉换新` | `319:27345` |
| 首页聊天 Light / Dark | `389:26739` / `389:27224` |
| 创作空间（项目列表收起）Light / Dark | `400:33060` / `400:35061` |
| 创作空间（项目列表展开）Light / Dark | `402:34479` / `402:35041` |
| 写作空间 Light / Dark | `401:33851` / `401:34895` |
| 页面 `V1-Components` | `332:28013` |
| 24 Sidebar Item / Window Tab | `392:32673` / `392:32719`（Section `392:32720`） |
| 25 Composer | `395:33742`（Section `395:33743`） |
| 26 Assistant Panel | `399:34448`（Section `399:34449`） |
| 27 Generation Node / Asset Node / Node Editor | `407:34466` / `407:34737` / `409:35547`（Section `407:34738`，审阅 `418:37299`、放大态审阅 `412:39281`） |
| V1 图标库 `Icons · Lucide`（60 个 `Icon / *`） | Section `391:32605` |

## 1. 分支与提交

- 从最新 `origin/develop` 创建 `feature/ui-v1-shell`。本计划书本身位于 `memory/ui-v1-shell-plan.md`，实现中如有取舍变化请同步更新它。
- 阶段 I / J / K / N / L / M 各至少一个独立提交（按此顺序），中文信息（`feat: …` / `refactor: …` / `test: …`）。
- 完成后推送；**不要**创建 PR、合并、打标签或发布。保留已有未提交改动。
- 在 `memory/ui-v1-implementation.md` 追加“第三阶段”章节（阶段 SHA、证据、差异与取舍）。

## 2. 全局约束

- pnpm、TypeScript strict、Biome、Tailwind v4、Lucide；组件 PascalCase 文件名，其余 kebab-case。
- 不关闭 sandbox / contextIsolation；renderer 不导入 Electron / Node API；不向 renderer 暴露通用文件、Shell、IPC。允许的主进程改动只有两类：窗口外观参数（阶段 J）与写作 Agent 的最小工具 / 中转（阶段 N，照画布 Agent 的 broker 模式，沿用主窗口、mainFrame、URL 信任校验）。
- `packages/ui` 不得依赖 Electron、`window.desktop`、项目数据、Agent、生成协议或应用目录；画布节点、编辑栏、项目列表、文件树等业务组件留在 `apps/desktop/src/renderer/src/features`。
- 只用 tokens 变量类，**不新增颜色变量**（本阶段所需语义色均已存在：`window`、`sidebar`、`content`、`surface-raised`、`fill*`、`border`、`separator`、`selection*`、`focus-ring`、`scrim`、各语义色）。通过 `scripts/check-tokens.mjs`，不得新增白名单条目。
- **不改变工作区数据（IndexedDB）与文档文件格式**，不改变生成、上传、导出、画布 Agent、写作读写的业务逻辑与调用边界；中文输入法组合输入、Enter / Shift+Enter、焦点恢复、防重复提交、未保存提示、确认框等行为必须保留。允许的新增存储：标签页与界面偏好放 renderer `localStorage`（键 `jarvis:window-tabs`）；写作 Agent 会话按画布会话方式存储，会话记录新增可选的文档作用域字段（向后兼容，旧会话不受影响）。
- **范围外（不要实现）**：日历功能（只放禁用占位）；账户头像；生成取消；上传进度；“定位到节点”交互；首页聊天的右边栏；写作 Agent 对文件系统的任何直接访问（新建 / 删除 / 移动 / 读取其他文件）。
- 测试：不得删除行为断言来通过；布局重构导致的定位器变化可更新，但每条原有业务断言必须保留等价覆盖。唯一允许删除的是**写作右边栏大纲**相关断言（用户决定移除该功能），需在报告中列明。
- 每阶段结束必须通过 `pnpm check`、`pnpm build`、`pnpm test:smoke`；无法运行时如实说明。

---

## 阶段 I：图标模块与新基础组件（`packages/ui`）

### I1. 统一图标出口（对应 Figma 独立图标库）

- 新增 `packages/ui/src/icons.ts`（`exports` 增加 `"./icons": "./src/icons.ts"`），按 Figma `Icon / *` 清单从 `lucide-react` 重新导出新风格使用的图标（命名与 Lucide 一致），并统一默认线宽 1.75。
- 本阶段**新建或改动的文件**一律从 `@jarvis/ui/icons` 导入图标，不再直接导入 `lucide-react`；在 `check-tokens.mjs`（或新脚本）中加入检查：直接导入 `lucide-react` 的文件只允许出现在白名单中，白名单只能减少。目的：以后整体替换图标只改这一个模块。

### I2. 新组件（预览页 + 测试，Light / Dark）

| 组件 | 规格 |
|---|---|
| **SidebarItem** | 侧栏列表行：高 32，左 8 右 4，间距 8，radius-control，宽度填充；图标 16（默认 fg-secondary，选中 fg）；标题 body 单行省略；可选 `meta`（callout fg-tertiary，如时间）；`trailing` 插槽（hover / 选中 / 键盘聚焦时显示 ghost icon-xs 更多按钮）。状态：hover = fill，selected = fill-hover（窗口失焦用 selection-inactive），disabled = fg-disabled。支持缩进层级 `depth`（每级 16）。语义由调用方决定（导航用 `aria-current`，列表用 option / treeitem）。 |
| **WindowTab / WindowTabs** | 外壳顶栏标签：高 28，默认宽 200（容器内 120–240 自适应平分），左 10 右 4，间距 6，radius-control；active = surface-raised + 0.5px border + shadow-control、标题 Semibold；inactive = 透明 + fg-secondary，关闭按钮仅 hover / 聚焦时显示；hover = fill。图标 14，标题省略，关闭为**独立** ghost icon-xs（`aria-label="关闭 <标题>"`），可选未保存点。整条为 `tablist`；标签 no-drag。 |
| **Composer** | 对话输入框外观壳（不含业务逻辑）：`layout` wide（默认 720，居中）/ compact（填充栏宽）；可选上下文条（fill 底、radius 12、藏于输入框后 12px，插槽放 ghost sm 按钮）；输入框 surface-raised + 0.5px border + shadow-control、radius 16、内边距 12/16；文本区插槽（调用方放现有 textarea / 编辑器）；工具栏左右插槽；`state` empty / filled / busy 只影响发送按钮外观（busy 显示 secondary 停止按钮，仅在已有中止能力处使用）。 |
| **AssistantPanel** | 右边栏外观壳：默认宽 360（沿用现有可拖动宽度范围），**背景透明**（放在外壳毛玻璃上），头部 44（标题 headline + 头部操作插槽）、正文插槽、底部 Composer 插槽（左右 12、下 12）；提供 `AssistantEmpty`（图标 + 标题 + 说明 + 建议按钮列表）。 |

验收：预览页覆盖全部状态；键盘（Tab、方向键切换标签、关闭按钮可聚焦）；精确颜色断言 Light / Dark 各一次（SidebarItem selected、WindowTab active、Composer 输入框）；macOS 更新预览截图基准。

---

## 阶段 J：窗口外壳（Codex 式框架）

参照 `389:26739`。整体：窗口背景为 `color/sidebar`（macOS vibrancy 磨砂；Windows 与减少透明度时不透明），外壳 = 顶栏 + 左侧图标栏；主内容放在白色主面板里。

### J1. 主进程窗口参数（唯一允许的主进程改动）

- macOS：`trafficLightPosition` 调整为让交通灯在 44px 顶栏中垂直居中（参考 Figma 交通灯位于 (18, 16)，以实机目测居中为准），其余参数不变。
- Windows：保留原生标题栏，不做窗口按钮定制；顶栏左侧不预留交通灯区域。

### J2. 布局（新建 `components/AppShell.tsx`，替换 `SidebarLayout` 的职责）

- **顶栏 44**（整条 `-webkit-app-region: drag`，控件 no-drag）：交通灯预留区 → 后退 / 前进（ghost icon，`arrow-left` / `arrow-right`，无历史时禁用）→ 侧栏开关（`panel-left`，控制主面板内的侧栏列，沿用现有 `sidebarOpen` 与宽度持久化）→ 标签区（与主面板内容列左缘对齐）→ 右侧：右边栏开关 Toggle（`panel-right`，只在创作空间 / 写作空间显示，最右）。设计稿中的“更多”按钮本阶段不放。
- 后退 / 前进：**每个标签页**维护自己的视图历史（该标签内先后打开的对话 / 项目 / 文档 / 设置页），只在内存中、不新增 IPC；离开有未保存设置时仍走现有确认逻辑。
- **左侧图标栏 48**：Toggle（default，无文字，`aria-label` + Tooltip）：首页（聊天）、AIGC 创作空间、写作空间、日历（`disabled`，Tooltip“即将推出”，不可选中）；底部设置。当前空间为 pressed。头像不做。
- **主面板**：x = 48、顶部 44，右 / 下内缩 6，radius-panel，`color/content` + 0.5px border，`overflow: hidden`。面板内左侧为**侧栏列**（默认 248，可拖动范围沿用现有 230–320，`fill` 底 + 1px separator），右侧为内容区。
- **右边栏**：AssistantPanel 放在主面板**外侧**的外壳上（透明底，宽 360，可拖动），主面板随之变窄；只在创作空间与写作空间出现，开关在顶栏最右。
- 窗口失焦：沿用 `data-window-active`，选中态改 selection-inactive。

### J3. 跨空间标签页（本阶段实现）

参照首页 / 画布 / 写作设计稿顶部标签栏（“聊天”“视觉系统”“周报草稿.md”同时存在）。

- **标签模型**（renderer 状态，新建 `features/shell/tabs.ts` 一类的纯模块 + 单元测试）：`{ id, kind: 'chat' | 'canvas' | 'writing' | 'settings', ref, title, history, rightPanelOpen }`。`chat.ref` = 对话 id（新对话为 null）；`canvas.ref` = 项目 id；`writing.ref` = 当前写作文件夹内的文档相对路径；`settings.ref` = 设置分区（设置为单例标签）。标题取对话名 / 项目名 / 文件名 / “设置”，图标分别为 `message-circle` / `layout-grid` / `file-text` / `settings`。
- **打开规则**：
  - 侧栏列（最近对话、项目列表、文件树、设置导航）中点击：在**当前标签**内打开（当前标签切换到该对象，进入其历史）；⌘ / Ctrl + 点击或中键：新标签打开。
  - 同一对象已在其他标签打开时，直接激活那个标签，不重复打开。
  - 图标栏点击某个空间：激活该空间最近使用的标签；没有则新建一个该空间标签（聊天 = 新对话；创作 = 最近编辑项目，无项目则空状态；写作 = 最近文档，无则写作空状态）。日历禁用。
  - “+”：新建标签，默认打开首页新对话。
  - 写作空间：**现有打开文档列表（`writing-tab-list`）并入全局标签**——每个打开的文档就是一个写作标签；`writing.activeId` 与当前标签同步；文档内部的标签栏移除。
- **关闭**：标签上的关闭按钮、⌘ / Ctrl + W。写作标签有未保存修改时走现有放弃确认；设置有未保存修改时走现有确认；关闭最后一个标签时新建首页标签。
- **外观与溢出**：Window Tab 组件，宽度在 120–240 之间平分；超出时标签区横向滚动（两端渐隐），当前标签自动滚入可见区。
- **快捷键**（renderer 内处理，组合输入期间不响应）：⌘ / Ctrl + T 新标签，⌘ / Ctrl + W 关闭，Ctrl + Tab / Ctrl + Shift + Tab 切换，⌘ / Ctrl + 1…9 跳转。
- **持久化**：标签列表、当前标签、各标签右边栏开关存 `localStorage` 的 `jarvis:window-tabs`；启动时恢复，引用已不存在（对话 / 项目被删、文档不在当前文件夹）的标签丢弃。不写入工作区数据。
- **运行中任务**：切换标签不打断进行中的生成、上传、画布 Agent 运行；回到标签时状态正确。

验收：拖动窗口、交通灯居中（macOS 实机）、侧栏 / 右边栏开关与宽度持久化、图标栏导航、日历禁用不可选中、每标签的后退 / 前进；标签打开 / 去重 / 关闭 / 未保存确认 / 快捷键 / 溢出滚动 / 重启恢复；Windows 布局无交通灯预留。

---

## 阶段 K：页面迁移

### K1. 首页聊天（`389:26739`）

- 侧栏列：标题“Jarvis”（纯标题，不做下拉）+ 搜索（如现有无搜索则不放）；SidebarItem“新对话”（`square-pen`）；分组“最近对话”，每行 SidebarItem（meta 为相对时间），当前对话 selected；行内更多菜单沿用现有重命名 / 删除能力（没有的不加）。
- 内容区：欢迎态（图标 + title-1 + callout 说明）；底部 Composer wide，里面放现有 `ChatComposer` 的输入与逻辑（技能选择、模型选择、发送 / 停止），上下文条本阶段隐藏（设计中的“本地工作台 / 未关联项目”无对应数据）。麦克风不做。首页本身就是对话，**不显示右边栏与其开关**；设置标签同样不显示。
- 对话中状态沿用现有消息样式，只换外壳与输入框外观。

### K2. 创作空间（`400:33060`、`402:34479`）

- **路由合并**：图标栏“AIGC 创作空间”进入创作空间：侧栏列为**项目列表**（迁移 `ProjectList` 的数据与操作：标题“我的项目”+ 搜索、SidebarItem“新建项目”、“最近编辑”分组下每个项目一行，图标 `layout-grid`，meta 为最近编辑时间，当前项目 selected，行内更多菜单承载现有重命名 / 删除）。一个项目 = 一张画布；内容区显示当前项目画布，默认打开最近编辑的项目；没有项目时内容区显示空状态 + “新建项目”。原独立项目列表页与画布页内的返回按钮移除（导航改由图标栏 / 项目列表完成），原有项目创建、打开、排序、搜索断言改到新位置。
- **画布工具栏**（高 48，`color/window` 背景 + 底部 1px separator，置于画布上层）：左“项目名 + 保存状态”，居中“图像 / 视频（secondary sm）+ 上传（secondary icon-sm）”，右“导出 Excel”。右边栏开关在外壳顶栏。
- 左下缩放胶囊、右下视图开关（缩略图 / 网格 / 吸附）改为 surface-raised + border + shadow-popover 胶囊，内部为 Icon Button / Toggle。
- **右边栏**：`CanvasAgentSidebar` 迁移到 AssistantPanel（标题“画布助手”，头部历史 / 新对话 / 关闭沿用现有项目会话管理），正文沿用现有消息、回执与撤销，底部 Composer compact 内放现有 `ChatComposer`；上下文条显示现有“所选节点数 / 项目名”信息。右边栏属于**所在标签页**：只读取 / 操作该标签的项目；开关状态随标签保存；同时开着两个项目标签时各自的面板与会话互不影响。

### K3. 写作空间（`401:33851`）

- 进入外壳：侧栏列为文件树（SidebarItem，文件夹 `folder` / `folder-open`、文件 `file-text`，按层级缩进 16，当前文件 selected），头部为现有工作区 / 打开文件夹操作 + 新建文件 / 新建文件夹（沿用现有能力）；底部显示本地路径。
- 打开的文档改由外壳标签栏承载（见 J3），编辑区内原有文档标签栏移除。
- 编辑区：文档工具栏 48（路径 + 文件名 + 保存状态；右侧搜索），正文列最大 560 居中，底部状态栏 28（含所选段落数）。CodeMirror 只改为读取 V1 变量，不改编辑行为。
- **去掉大纲**：移除右侧栏“文章大纲”Tab 及其导航（用户决定，相关断言可删除并在报告列明）；设计稿中的大纲开关不做。
- 右边栏：**只是写作 Agent 对话**（AssistantPanel，标题“写作助手”，无 Tab），能力见阶段 N。

### K4. 设置

- 进入外壳：侧栏列为设置导航（SidebarItem：通用、模型、内网地址、插件；未实现项保持禁用），内容区沿用现有设置页内容，不改业务。

验收：各页现有 Electron 回归全部通过（聊天、技能 / @ 引用含中文输入法、项目创建 / 打开 / 搜索、画布 Agent、导出、写作打开 / 保存 / 冲突 / 标签、设置保存 / 未保存提示）；`node scripts/capture-ui.mjs phase-k` 生成全部页面 Light / Dark 截图，与 Figma 对照列出差异。

---

## 阶段 N：右边栏 = 所在空间的 Agent

原则：右边栏弹出后**只是 Agent 对话**；在哪个标签页里打开，就只能读取 / 操作那个标签页的空间对象。

### N1. 通用

- 右边栏开关在外壳顶栏最右，只在创作 / 写作标签显示；开关状态、面板宽度随标签保存（`jarvis:window-tabs`）。
- 会话按空间对象隔离：画布 = 项目会话（现有）；写作 = **文档会话**（按当前写作文件夹 + 文档相对路径作用域，新建 / 历史 / 删除会话与画布一致）。
- 共用现有 Agent 服务、模型配置、技能（`/` 选择与自动加载）、取消与回执样式；Composer compact 的上下文条显示作用对象（画布：“已选 N 个节点 / 项目名”；写作：“文件名 / 已选 N 段”或“全文”）。
- Agent 运行中切换标签：运行继续，结果写回原标签的对象；用户在写作标签修改了同一段落导致冲突时，按 N2 的版本校验拒绝写入并在对话中说明。

### N2. 写作 Agent（新增，最小能力）

照画布 Agent 的结构实现（`main/agent/canvas-tools.ts` + `canvas-broker.ts` → 新增 `writing-tools.ts` + `writing-broker.ts`，renderer 侧由写作空间响应 broker 请求）：

- **工具（仅限当前标签的这一个文档的编辑器内容）**：
  - `read_document`：返回文件名、全文（超长时分段，带字数上限）、当前选区范围与文本、文档版本号；
  - `read_selection`：返回所选文本与范围；
  - `replace_range` / `insert_text`：按范围替换或在位置插入，必须携带读取时的版本号，版本不一致则拒绝（防止覆盖用户的新输入）；
  - 写入只改编辑器缓冲区（显示为未保存），**不直接写磁盘**，保存仍走现有保存流程；
  - 每轮修改合并为一个编辑事务：对话中显示回执（Alert success“已修改：替换 N 段 · 文件名”）+“撤销”，撤销恢复该轮修改（与画布同轮撤销一致）；CodeMirror 撤销历史也可回退。
- **不提供**：读取其他文件、文件夹列表、新建 / 删除 / 重命名 / 移动文件、执行命令。broker 校验主窗口、mainFrame、可信 URL、owner、runId 与超时（同画布）。
- 文档未打开、文件已被外部修改且存在冲突时，工具返回明确错误，Agent 在对话中提示。
- 空状态：AssistantEmpty（“写作助手：读取当前文档，帮你改写、续写、总结；每次修改都可以撤销”）+ 建议（“把选中段落改得更口语”“为全文写一段摘要”“续写下一段”）。
- 完成后更新 `AGENTS.md` 的“当前范围”：写作助手已接入，仅能读取 / 修改当前打开文档的编辑器内容。

### N3. 验收

- 单元测试：标签作用域（写作 Agent 只能拿到当前标签文档）、版本冲突拒绝、事务撤销、broker 校验（非主窗口 / 过期请求被拒）。
- Electron 回归（使用现有模拟模型服务）：写作标签中让 Agent 改写选中段落 → 编辑器内容变化、显示未保存、回执可撤销；切换到另一个写作标签后 Agent 不会改到它；画布标签中原有画布 Agent 回归全部通过；首页 / 设置不显示右边栏。

---

## 阶段 L：画布节点与节点编辑栏

参照 `407:34466`、`407:34737`、`409:35547` 与审阅板 `418:37299`、`412:39281`。实现位置：`MediaPlaceholder.tsx`、`AssetNode.tsx`、`NodePorts.tsx`、`NodeName.tsx`、`NodeDownload.tsx`、`UrlMedia.tsx`、`MediaEditor.tsx`、`References.tsx`、`ImageControls.tsx`、`VideoControls.tsx`、`ParameterControl.tsx`、`GenerationDetails.tsx` 及对应 CSS。

### L1. 节点通用

- 默认 **320×180（16:9）**，媒体块 radius 12。宽固定 320，高 = 320 ÷ 媒体宽高比，限制在 180–320；比例取自已加载媒体的自然尺寸（加载前按 16:9），**不写入存储**；媒体 `object-fit: contain`，留白 `fill` 底。
- 名称在媒体块下方（callout fg-secondary，点击重命名行为不变）；选中时名称加 selection 底。
- 选中：外 3px 的 2px accent 圆角环；**键盘焦点**：外 5px 的 3px focus-ring 环（与选中区分，可同时出现）。
- 端口：可见 14px（surface-raised + 2px fg-tertiary 描边），**热区 28**，hover 放大到 18、描边 accent，并显示 Tooltip（输入“连接上游参考节点”、输出“拖向下游节点”）。生成节点左入右出，素材节点仅右出。
- 右上操作条（surface-raised 92% + border + shadow-control，radius 8）：生成节点 = 下载（有结果时）+ **删除（`trash`）**；素材节点 = 下载（就绪时）+ 删除。悬停、键盘聚焦或选中时显示；**生成中 / 上传中不显示**。删除走现有删除逻辑（沿用现有快捷键与撤销能力，没有的不新增）。
- 叠在媒体上的 Badge 一律 solid（状态、素材、时长）。

### L2. 生成节点状态（与现有数据一一对应）

| state | 条件 | 外观 |
|---|---|---|
| empty | 无结果、无任务 | surface-raised + border，图标 + “点击编辑图像 / 视频” |
| generating | uploading / submitting / running | fill 底 + Spinner lg + “正在生成 · 已 m:ss”（由 `generation.startedAt` 在客户端每秒计算，不加接口、不加取消） |
| media-loading | 有结果、媒体加载中 | 同 generating 外观，文案“正在加载媒体…” |
| done | succeeded 且媒体就绪 | 结果铺满（contain）；**视频不用原生控制条**：显示封面帧，hover 显示中心播放按钮（点击在节点内播放 / 暂停），右下 solid 时长 Badge |
| failed | failed 且无旧结果 | 卡片：danger 图标 + “生成失败” + 原因（现有错误字段）+ secondary sm “重试”（调用现有生成） |
| failed-result | failed 且保留旧结果 | 显示旧结果，左上 danger solid “失败”，底部原因条（surface-raised 95% + 图标 + 原因单行省略 + xs “重试”） |
| unknown | unknown | 卡片：warning 图标 + “结果未知” + “上游可能已经生成并计费，重新生成前请先核实” + secondary sm “查看任务信息”（打开编辑栏并展开生成信息）；重新生成仍走现有确认框 |
| media-error | `UrlMedia` 加载失败 | 卡片：图标 + “媒体暂时无法加载” + “请检查网络或资源 URL 是否仍然有效” + secondary sm “重新加载媒体”（现有重试逻辑） |

### L3. 素材节点

- uploading：Spinner + “正在上传 文件名…”（**不显示进度**）。
- ready：铺满预览，左上 neutral solid “素材”；音频只提供播放 / 暂停 + 时长（播放中显示已播时间），**不在节点内拖动进度**。
- upload-failed：danger 图标 + 原因 + “请重新拖入文件上传”；可删除。
- media-error：同生成节点。

### L4. 节点编辑栏（普通态）

- 宽 min(760, 画布宽 − 32)，surface-raised + border + shadow-popover，radius-window。
- **摆放规则**：默认在选中节点下方 16px、水平居中于节点；下方空间不足时翻到节点上方；始终夹在画布可视区内（四边 16）；随画布平移 / 缩放跟随节点。
- 上部：参考区 84×104——有参考时为**最多 3 张叠放卡片**（72×96、radius 6、1px border，顶层左上、其后依次向右下偏移 4px，左上编号标签 = surface-raised 底 + footnote），左下 neutral BadgeCount，点击进入放大态（现有行为）；无参考时为 fill 占位块 + image 图标 + “连接上游节点 / 或放大后添加”。中间为 PromptEditor（@ 引用标签改为 accent 浅底样式）。右侧关闭 / 放大（ghost icon-sm）。
- 下部（上 1px separator）：参数为 NativeSelect compact 外观、**不带图标，只显示当前值**（图像：模型 / 宽高比 / 思考程度 / 分辨率；视频：模型 / 时长 / 宽高比 / 分辨率，`aria-label` 与 Tooltip 保留参数名），视频的生成音频为 Toggle sm（`volume-2` / `volume-x`）；右侧生成按钮 default icon-lg。**编辑栏内不再有删除按钮**（删除在节点操作条）。
- 生成按钮禁用时在其左侧显示原因（callout fg-tertiary）：图像“选择模型并填写提示词后可生成”、视频“填写提示词后可生成”。生成中参数禁用，显示 Spinner sm + “正在生成…”。
- 错误（如参考类型不符）：参数行下方 Alert error（可关闭），替代现有 `editor-notice`。
- 生成信息：Collapsible card，标题改为“生成信息 · N 个参考”（无参考为“生成信息”），展开内容不变。

### L5. 节点编辑栏（放大态）

- 居中 960×600 对话框（shadow-dialog），`color/scrim` 遮罩，焦点圈定、Esc 先还原再关闭（现有行为）。
- 顶部“参考素材” headline + 数量说明（图像“N / 9 · 仅图片”，视频列出类型）；参考条横向滚动：虚线添加块在首位，72×96 缩略图左上编号标签、右上 secondary icon-xs 移除、下方文件名；分隔线下为占满剩余高度的提示词；右侧关闭 / 还原（`minimize`）；底部同普通态。

### L6. 连线与画布

- 连线 1.5px `fg-tertiary`，选中 / 激活用 accent；点阵 24px、`fg-tertiary` 40%。React Flow 主题只读取 V1 变量。

验收：每个状态有可见用例或 Electron 回归（失败保留旧结果、未知结果“查看任务信息”展开详情、媒体加载失败重新加载、已用时间递增、端口热区 28 可连线、键盘焦点环、操作条删除、编辑栏翻转到节点上方、参数无图标但可访问名称存在、禁用原因）；Light / Dark 画布截图与审阅板对照。

---

## 阶段 M：清理与总验收

- 按文件逐个删除不再使用的旧 CSS 规则（不得批量删除文件），能移出 token 白名单的文件移出；`lucide-react` 直接导入白名单只减不增。
- `pnpm check`、`pnpm build`、`pnpm test:smoke` 全部通过；`pnpm package:dir` 打包门禁通过（生产依赖清单变化需说明）。
- 截图：`apps/desktop/test-results/ui-v1/phase-m/` 下全部页面 Light / Dark，及画布节点各状态、编辑栏普通 / 放大态。

---

## 3. 已确认 / 默认决定

已确认（用户 2026-10-24）：

1. 跨空间标签页本阶段实现（J3）。
2. 写作空间右边栏去掉大纲。
3. 右边栏只是 Agent 对话；在哪个标签页打开，就操作哪个标签页的空间（N）。

默认决定（如需不同请在交付前改）：

4. 后退 / 前进为每个标签自己的内存历史，不持久化。
5. 设计稿中的“更多”按钮、头像、首页上下文条、麦克风本阶段不实现；首页与设置不显示右边栏。
6. 写作 Agent 只改编辑器缓冲区，不直接保存；不提供任何其他文件操作。
7. 日历入口禁用占位；“定位到节点”不实现。

## 4. 交付报告

1. 各阶段提交 SHA 与一句话说明；分支名与推送结果。
2. 新增 / 修改的主要文件（按阶段）；新增依赖及精确版本（预期无新依赖）。
3. 三项命令的实际结果（通过数量、耗时），失败项及原因；打包门禁结果。
4. 截图目录；各页面 / 节点状态与 Figma 的差异清单及取舍理由。
5. 迁移点逐项结果（已替换 / 部分 / 未替换及原因），特别是项目列表路由合并、写作标签并入全局标签、画布 Agent 迁移、写作 Agent 新增（工具清单、权限校验、存储变化）、被删除的大纲断言清单。
6. 待实机验收项（macOS 交通灯位置与毛玻璃、Windows 布局）。
7. 不在报告或代码中写入密钥、令牌或真实内网地址。
