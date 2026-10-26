# Jarvis 设计记忆

最后更新：2026-10-26

## 聊天「回到最新」按钮定位（2026-10-26）

- 用户反馈按钮跑到左侧且无明显底色。根因是 legacy 层绝对定位与背景被通用 Button 的 utilities 层 relative、透明背景覆盖。
- `ChatPage.tsx` 改用 secondary 按钮及显式 absolute 工具类，固定在输入区容器上方 8px、右侧 24px，删除 agent.css 中冲突的旧规则；协调对话与首页线程视图共用。本轮未修改 Figma。
- 验证：check/build 通过；真实 Electron 聊天回归 1/1，通过按钮位置与非透明背景断言、向上翻阅期间保持位置、点击回到底部并隐藏；已检查深色截图。Windows 实机尚未验证，未提交或发布。

## 节点编辑面板生成按钮靠右（2026-10-26）

- 用户要求生成按钮与左侧参数控件分开，靠面板右侧。`MediaEditor.tsx` 将提示与生成按钮合为操作组，`nodes.css` 通过自动左边距右对齐；图像、视频和放大面板共用，空间不足时操作组整体换行。本轮未修改 Figma。
- 根因：旧 `.node-editor-bottom > .editor-spacer` 隐藏了间距元素，新参数区又不再 flex 占满剩余空间。
- 验证：check/build 通过；真实 Electron 中图像/视频 × 1280/900 窗宽 × 空/已填提示词 × 普通/放大共 16 种状态右边距断言通过，并检查窄窗截图。Windows 实机尚未验证。

## Windows 顶部原生菜单栏（2026-10-26）

- 用户要求 Windows 不显示 File / Edit / View / Window 菜单栏。主进程在 win32 上通过 `Menu.setApplicationMenu(null)` 移除应用菜单，保留系统标题栏和窗口控制按钮；macOS 与 Linux 沿用现有菜单。本轮未修改 Figma。
- 验证：`pnpm check`、`pnpm build` 通过，macOS 真实 Electron 启动、导航与隔离冒烟 1/1 通过。Windows 实机显示效果待验证；未发布。

### V1.0.0 设置「用量与统计」实现（2026-10-26）

- 用户确认评审稿样式通过，费用用美元，测试 / 探测消耗计入“其他”不单独做卡。已按稿实现 `features/settings/UsageSettings.tsx`；与稿差异：图表在有“其他”消耗时多一段灰色（`fg-tertiary` 50%）与图例；全部无价格时总消耗卡只写“N 个模型无价格”；Y 轴刻度按 1/2/5 取整；30 天视图横轴最多 10 个日期标签；空状态为一行说明框（稿中未画）。实窗截图由 `tests/usage-ui.spec.ts` 生成（浅 / 深）。

### V1.0.0 设置「用量与统计」评审稿（2026-10-26，已通过）

- 用户确认方案（`memory/agent-os-v1.md` 第 7.4 节 S1–S4）并要求先出 Figma。文件 `mIwnyR5nAlECFMam1NvmER`，页「V1-视觉换新」`319:27345` 新增 Section `524:45539`「V1.0.0 · 用量与统计（待评审）」，由 `Settings · Models` 浅 `428:29687` / 深 `431:43867` 复制改造：`Settings · Usage / Light` `524:45540`、`Settings · Usage / Dark` `524:46104`（1440 × 1431，窗口加高以显示整页）。
- 侧栏在「插件」后加 Sidebar Item「用量与统计」（selected，隐藏 Action），图标为新增组件 `Icon / chart-column` `523:42370`（V1-Components 页 Icon grid，Lucide chart-column，描边 1.75 绑定 `color/fg/default`）；「模型」改回 default。
- 页面（宽 620）：标题 + 说明（主 Agent = 协调者，子 Agent = 线程含右侧栏，从本版本开始记录）；筛选行 ToggleGroup segmented（今天 / 近 7 天 / 近 30 天 / 全部，选中近 7 天）+ 右侧 NativeSelect「全部项目」；三张统计卡（总消耗 1.28M · $0.58 · 2 个模型无价格；主 Agent · 协调者 312.4K · 24% · $0.17；子 Agent · 线程 968.1K · 76% · $0.41）；「每日消耗」堆叠柱状图（7 天，Y 轴 300K / 150K / 0，图例）；「按模型」表（模型 + 服务商 / 输入 / 输出 / 缓存 / 合计加粗 / 费用，自定义中转站为 —）；「主 Agent · 按项目」行内占比条；「子 Agent · 消耗最多的线程」前 5（标题、项目 · 状态、token、费用、chevron 进入线程）；页脚说明“合计含缓存读写。费用按服务商公开价格估算（美元）；自定义中转站没有价格，显示 —。”
- 颜色：主 Agent `color/accent/default`，子 Agent 同变量 40% 透明度（`color/info/default` 与 accent 同色，无法区分，已弃用）；卡片描边 `color/separator`、圆角 `radius/panel`；文字用 V1 文本样式（title-1 / title-2 / headline / body / callout / footnote）。
- 验证：两帧各 351 个节点，0 图片填充，文字全部 SF Pro；浅深截图检查，修正了筛选行占位间隔默认 100px 高、统计卡无边界、侧栏图标未随实例缩放（组件内层改为 SCALE 约束）、子 Agent 色与主 Agent 同色。

### V1.0.0 空间线程右侧栏实现（2026-10-26）

- 用户评审通过（U10），补充两点并已同步 Figma：侧栏输入框不显示“技能”按钮（四个侧栏 Composer 实例关闭 showSkill）；决策卡加“其他答案”自填行（侧栏 `513:44691` / `514:45121` 与首页线程卡 `501:26883` / `501:27397`，Input sm + secondary “回答”）。
- 已按稿实现画布与写作右侧栏（`SpaceThreadPanel`），实窗截图见 `tests/space-agent.spec.ts` 输出；与稿差异：消息后的“刚刚 / 复制”行沿用现有消息组件；写作侧栏共鸣点卡片复用写作空间的 `ResonanceCards`。

### V1.0.0 空间线程右侧栏评审稿（2026-10-26，已通过）

- 用户确认第二批方案：画布 / 写作右侧栏 = 绑定该画布或文档的线程。按 U2 先出 Figma：文件 `mIwnyR5nAlECFMam1NvmER`，页「V1-视觉换新」新增 Section `511:42965`「V1.0.0 · 空间线程右侧栏（待评审）」，由 `Canvas · Creation / Light`（`400:33060`）与 `Writing · Blocks / Light`（`482:37226`）复制，右侧 Assistant Panel 实例解绑后改造：
  - `Space Thread · 画布 / Light` `511:42966`（侧栏 `511:43408`）/ Dark `514:45036`：头部线程标题 + 状态 Badge（进行中）+ 历史 / 新线程 / 关闭；“线程 · 周报与日程 / 在首页查看”条；置顶一行进度（进度 1/3 · 当前步，可展开）；消息区自底部对齐：用户气泡上方“已选 3 个节点 · 附 3 张图”，回执“已修改画布：新建 3 个节点”+ 撤销，活动“已发起生成（完成后自动继续）”，内联普通决策卡（问题 + 需要你决定 + 两个选项按钮）；输入框上下文“已选 3 个节点 / 视觉系统”，占位“对这个线程说…（只改这个画布）”。
  - `Space Thread · 写作 / Light` `511:43427`（侧栏 `511:44120`）/ Dark `514:45132`：Badge 待查看；进度 2/2 已完成；回执“已修改：替换 2 段（未保存）”+ 撤销；共鸣点候选卡（两行文档 + 理由 + “关联”）；上下文“周报草稿.md / 已选 2 段”。
  - `Space Thread · 写作历史与未打开文档 / Light` `511:44139`（侧栏 `511:44832`）：返回 + “周报草稿.md 的线程”+ 新线程 / 关闭；“所属项目 周报与日程 ▾”；进行中 / 已完成两组 Sidebar Item（含协调对话开的线程）；信息块说明文档没打开时线程直接保存并可撤销、打开时进编辑器保持未保存；无输入框。
- 验证：5 帧，0 图片填充，文字全部 SF Pro，颜色绑定 V1 语义变量（深色帧用集合 `334:26740` 的 Dark 模式）；逐帧截图检查，修正了占位间隔默认 100px 高度和内容压住输入框（改为置顶进度条 + 消息区底部对齐裁切）。画布帧里生成中节点 Tile 原本是未绑定的白色填充（基底画布深色稿同样存在），已在两张新帧中绑定 `color/surface-raised`。

### V1.0.0 Agent OS 首页实现（2026-10-26）

- 用户确认评审稿样式（Section `493:41564`），并要求：创作空间“项目”改叫“画布”；去掉“新对话”，“新建项目”放进项目切换菜单；决策卡与线程卡住改为系统通知（普通问题可在通知里直接选，不可逆的只有“查看”，点开在卡片上批准）。
- 已按稿实现：侧栏项目切换 / Overview / 协调对话 / 线程与已完成两组 / 底部目录数；协调对话的线程卡片与状态条；线程视图（进度清单、原话引用、内联决策卡、停止 / 标记已解决）；Overview（批准卡完整显示，普通问题一行“去回答”）；项目设置。样式在 `apps/desktop/src/renderer/src/features/agent/os.css`，只用语义变量。
- 与稿差异：侧栏未做项目内搜索按钮与行“更多”菜单；Overview 待查看行不单独放“打开”按钮（整行可点）；底部只写目录数，不写记忆条数。画布改名只改界面文案，Figma 里旧的创作空间画面文案未同步（待需要时再改）。
- 验证见 `memory/agent-os-v1.md` 第 7.1 节；实窗截图（协调对话、Overview、线程、项目设置、深色）由 `tests/os-ui.spec.ts` 生成。

### V1.0.0 Agent OS 评审稿（2026-10-26，已确认）

- 用户要求新 UI 先出 Figma 再实现。文件 `mIwnyR5nAlECFMam1NvmER`，页「V1-视觉换新」`319:27345` 新增 Section `493:41564`「V1.0.0 · Agent OS（待评审）」，由「Chat · Home」浅 `389:26739` / 深 `389:27224` 复制改造：项目对话浅 `493:41565` / 深 `493:41745`、线程浅 `493:41610` / 深 `493:41790`、Overview `493:41655`、项目设置 `493:41700`。
- 当前方案（未确认）：侧栏顶部为项目切换（“周报与日程 ▾”），下列 新对话 / Overview（meta“2 件等你”）/ 协调对话，再分“线程”“已完成”两组，SidebarItem meta 写状态；底部写可访问目录与记忆条数。协调对话里用户消息下方挂线程卡片（标题 + 状态 Badge + 进度），线程完成以一行状态条回到对话，结论带产物链接。线程视图顶部为标题 + 状态 + 停止 / 标记已解决，置顶进度清单（✓ / 进行中圆点 / 未开始灰点），协调者转达以带“你的原话”引用的气泡显示；普通决策卡列选项与后果、标“推荐”，说明“先按推荐项推进、不超时”；输入框写“直接对这个线程说”。Overview 按 等你 / 待你查看 / 进行中 / 已完成 / 已解决 分组，不可逆批准卡橙色描边 + “不可逆”Badge + 参数详情 + 不执行 / 批准执行。项目设置：名称、项目说明、可访问目录（项目文件自带不可移除）、项目记忆列表、执行方式、每线程预算。
- 原待确认项已由用户答复：创作空间改叫“画布”；决策卡与卡住用系统通知；去掉“新对话”（评审稿已删除该侧栏项）。
- 验证：6 页 1706 节点，0 图片填充，文字均为 SF Pro 并绑定 V1 文本样式与语义颜色变量；已逐页截图检查，修正推荐 Badge 无文字与线程页内容压住输入框。
- 过渡实现（不代表评审结论）：画布/写作右侧栏为 AssistantEmpty“即将接入”；首页侧栏“空间任务”改名“线程”；决策卡暂用 AlertDialog；来源标签新增“Jarvis 转达 / 线程 / 定时任务 / 外部事件 / 你的选择 / 线程状态 / 恢复”。

## 写作空间 W6 总验收（2026-10-26）

新增四类页面 Light/Dark 八张截图：块编辑、命令面板与反向链接、全景星图、PDF 预览。采用 reduced-motion 采集以稳定布局，普通动画仍由既有回归覆盖。PDF 内部查看器沿用 Chromium；Figma 节点与设计 token 未变。八图目录为 `apps/desktop/test-results/587fa947-f99a-4227-8c97-84ca7ca6784b/writing-acceptance-writing-36f2a-erves-an-actual-PDF-preview/`。Claude 视觉签收仍待进行。详情见 [写作实施记录](writing-space-implementation.md)。

## 写作空间 W5（2026-10-26）

星图小窗、全景、共鸣点卡片、文末反向链接与逐个确认修复已实现，复用 V1 控件/tokens。只读核对 `473:39690`、`473:39554`、`466:39145`、`484:40061` / `484:41707`，Figma 未修改；修正初始缩放与连线端点，使用实际数据静态布局。浅深截图已检查，Claude 视觉签收待进行。详情见 [写作实施记录](writing-space-implementation.md)。

## 写作空间 W4（2026-10-26）

沿用现有 /、块菜单、BubbleMenu 和侧栏。三入口自动发送，整块保留 Markdown 范围（含 Mermaid 围栏），选区和回执/撤销已实窗验证。只读核对 Figma Block Menu `470:38997` 和 Block Highlight `471:39798` 的上下文与截图，节点未变。未新增组件、颜色或样式，Figma 未修改；Claude 视觉签收仍待进行。详情见 [写作实施记录](writing-space-implementation.md)。


## 写作空间 W3（2026-10-26）

实现 320px / 命令面板、三组 21 项、Callout/折叠/代码/图表/导图/图片/表格的交互视图。复用现有 V1 控件和 tokens；缩放、对齐、全宽、折叠均为视图状态。Agent 修改提示使用 1.2 秒透明度淡出，减少动态效果时为静态提示。

只读核对 Figma `470:39640`、`471:39165`、`471:39499`、`471:39677` 的上下文与截图；Figma 未修改。已修正下拉容器挤压标题和 Tabs 的问题，并对照浅深截图。已检查修复后的 Callout/Toggle、导图与图表截图；完整回归 197/199，目录包富模块预览通过，Claude 阶段视觉验收仍待进行。W4 自动发送/块上下文尚未实施；具体边界、截图路径和验证记录见 [写作实施记录](writing-space-implementation.md)。


## 写作空间 W2（2026-10-26）

按用户继续 W2 的要求实现：680px 居中块正文、独立文件标题与 Emoji、修改时间/字数、单行文档工具栏的块视图/源码/搜索、共用大纲、块句柄/转换/拖放指示、划选 BubbleMenu、双链候选/失效状态、图片插入。复用 V1 控件与 tokens，无新增颜色变量。

只读核对 Figma `466:38578` Document Header 的上下文与截图，以及 `482:37226` / `482:38315` 块编辑页浅深截图；文件未修改。W2 当时的 Callout/导图原文块与基础 `+` 菜单已由顶部 W3 记录升级为交互视图和完整 `/` 面板；AI 自动发送仍归 W4。实施证据与未验收边界见 [写作实施记录](writing-space-implementation.md)。


## 写作空间 W1 实施中（2026-10-26）

- 用户要求执行 `writing-space-plan.md`，授权按既有初稿实施。当前已实现目录行、文件/星图分段（W1 占位）、类型图标、行内改名/菜单与文件预览；W1 当时不包含块编辑与星图；块编辑已由顶部 W2 记录接入，星图仍待后续阶段。
- 实际读取 Figma `mIwnyR5nAlECFMam1NvmER` 的 `461:38163`（File Tree Row）与 `464:38503`（File Preview）设计上下文和截图；Figma 文件未修改，节点 ID 保持原样。复用 V1 基础控件和现有 tokens。
- 初步截图发现按钮内容居中，已调整目录行对齐并把搜索放到左栏；最终目录浅深与图片预览截图已检查；完整回归 182/183，最终目录专项 3/3，Claude 阶段视觉验收尚未进行。阶段证据与差异见 [写作实施记录](writing-space-implementation.md)。


### 首页快捷建议标题对齐修复（2026-10-25）

- 用户截图指出“也可以从这里开始”脱离三个快捷入口，确认按同一居中窄容器、统一左对齐修复。根因是 V1 Button 内容层默认居中，而旧建议列表仍占满欢迎区、标题保持靠左。
- 建议组宽度限定为 min(100%, 320px)，水平居中；标题与按钮图标起点对齐，按钮内容层填满组宽，建议文字左对齐、末尾箭头靠右。仍使用现有 ghost/sm Button，移除旧原生按钮外观及直系 SVG 选择器，不新增组件或变体，不修改 Figma。
- check、build 通过；首页 Chat 实窗回归 1/1（10.1s）通过，覆盖浅深两主题 × 900/1280 两种窗口宽度的几何对齐与截图；深色 1280 截图已目视检查。证据：`apps/desktop/test-results/1c1438a0-8f08-4ec0-8951-86ac7e774b3c/`。未运行完整回归，未提交或推送。

### V1 遗留控件迁移（2026-10-25）

- 用户授权按“写作新建弹窗 → 重命名/历史 → 旧图标按钮 → 更新提醒 → 空状态与引导 → CSS/旧颜色清理”推进；明确只使用现有 V1 组件，遇到无法覆盖的组件需求先告知并等待决定。未新增组件、变体或设计 token，未修改 Figma 文件。
- 只读核对文件 `mIwnyR5nAlECFMam1NvmER` 的 V1-Components 页 `332:28013`（页级设计上下文返回未选择图层，改查已有子节点）；Dialog `362:31494`、Input `340:28052`、Field `341:28089`、Button `336:27571`、Icon Button `337:27595`、Sidebar Item `392:32639`、Alert `370:32084`、Progress `378:32536`、Popover `358:30609` 均返回设计上下文与截图。来源：[V1 组件库](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=332-28013)。
- 写作新建文档/文件夹使用 Dialog sm + Field/Input + Button，保留创建、不覆盖、位置说明、快捷键；补齐名称首焦点、Esc/取消、关闭后焦点恢复与提交锁。首页重命名使用 Field/Input/Button；画布与写作历史共用 SidebarItem，时间移到 meta，操作用既有 IconButton。
- 7 个文件、22 处旧 IconButton JSX 已迁移；不再引用本地旧组件，并单独删除该文件。图标按 V1 尺寸和 Tooltip；编辑栏纵向“放大/还原”采用 Button + Tooltip side=right，实窗复现并修复顶部 Tooltip 遮挡关闭按钮。画布开关使用现有 Toggle，聊天活动、复制、导出、工具栏、空态和引导复用现有 Button/Alert。
- 用户明确选择上下文显示改为现有线性 Progress + Tooltip/Popover，保留 hover 用量、点击详情、Esc/外部关闭与焦点恢复。此前误报缺少圆环组件，已向用户更正：源码确有 ProgressRing；按用户新选择实现线性方案。
- 移除 51 个 legacy-static-color 兼容定义与所有 renderer legacy 颜色/字体/圆角引用，改用现有 V1 语义变量；保留 legacy 层中的有效布局、CodeMirror 和媒体业务规则，不以文件名判断废弃。依赖与打包清单不变，未使用的字体依赖仍按既有记录保留。
- 已检查真实 Electron 浅深写作新建弹窗、上下文详情与历史列表截图；现有组件浅深截图基准通过。截图见 `apps/desktop/test-results/4e34bdb5-bb08-4ecd-bfa6-8f57691220fb/`（写作）与 `4f2234ff-73b6-4df2-a942-94e4237be222/`（上下文）；不含真实服务验证。最终 check/build/diff 检查通过，排除未授权 macOS 日历的既有环境用例后，完整实窗/模拟服务回归 176/176（5.3m）通过；首次 176/177 的失败证据与环境限制见 engineering.md 对应记录。
### 写作空间重新设计：页面拼接（2026-10-25，待确认）

- 用户确认实现方案的四项决策：写作 Agent 可以只读当前文件夹其他文档（标题、标签、摘要）做共鸣点；拖线只在来源文档末尾「关联」段追加双链；大标题与正文 H1 独立；阶段顺序按方案。Google 文档已同步改为“已确认事项”。
- `V1-视觉换新` 新增分区「写作空间 · 重新设计」（`482:37225`），由原 `Writing · Editor` 外壳复制，左栏与编辑区全部换成写作组件实例，浅深各一：
  - `Writing · Blocks`（`482:37226` / `482:38315`）：文档头部、选区 BubbleMenu、行首句柄、Callout、思维导图块、右侧大纲条；右边栏写作助手保持。
  - `Writing · Slash & Backlinks`（`483:54226` / `483:54935`）：Agent 修改高亮、折叠块、/ 面板过滤「导图」、文末反向链接与潜在共鸣点。
  - `Writing · Dots Graph`（`484:40061` / `484:41707`）：左栏「星图」小窗 + 编辑区全景星图（工具栏、共鸣点卡片、时间轴）；右边栏关闭，主面板加宽到 1226。
  - `Writing · File Preview`（`484:40856` / `484:42362`）：PDF 标签页预览，右边栏关闭。
- 为放进 500px 正文列，Mind Map Block 组件的树改为更紧凑的布局（分支 x 178、叶子 x 332，连线重画）。八个画面均截图检查，无裁切、遮挡内容或错误主题。

### 写作空间重新设计：组件初稿（2026-10-25，待确认）

- 来源：用户构思稿《写作空间（Writing Space）重新设计方案》（Connecting the Dots、Notion 式块编辑、/ 面板与思维导图、全格式目录树）与据此重写的实现方案 [Google 文档](https://docs.google.com/document/d/1g_eXz9PgoO5-4QvWC77TR4ZxMlXU30oPZv7xV1R0m5g/edit)。方案中的四个决策事项已于同日确认（见上一条）。
- 用户要求“先把要用到的组件做出来”。`V1-Components` 新增五个分区，节点 ID 与属性见 [writing-space-components-state.json](figma-sync-2026-10-21/writing-space-components-state.json)：
  - `29 Writing · File Tree`（`461:37991`）：File Tree Row（5 状态，类型图标、层级缩进、外部格式徽标、行内改名、拖放目标）、File Tree Menu（文件 / 文件夹）、Writing Left Header（「文件 | 星图」分段）、File Preview（图片 / PDF / 音视频 / 二进制信息面板）。
  - `30 Writing · Document`（`466:38295`）：Document Header（Emoji + 32 Bold 大标题即文件名；hover / editing / 重名回滚）、Document Toolbar（块视图 / 源码）、Outline Rail（短横线 / 展开卡片）、Inline Reference（双链 / 标签 / 失效链接）、Backlink Item、Backlinks。
  - `31 Writing · Block Editor`（`470:38586`）：Block Handle（+ 与 ⋮⋮）、Drop Indicator、Block Menu（文本 / 富模块）、Turn Into Menu、Bubble Menu（含编辑链接）、Slash Command Item、Slash Menu（默认 / 过滤 / 无结果）。
  - `32 Writing · Rich Blocks`（`471:39101`）：Callout（GitHub 五种 + 自定义 Emoji）、Toggle、Code、Mermaid（预览 / 源码 / 错误）、Mind Map Node、Mind Map Block、Image（含上传中 / 超限）、Table、Block Highlight（Agent 修改 / 整块选中）。
  - `33 Writing · Dots Graph`（`473:39285`）：Dot（当前 / 已连接 / 孤岛 / 候选 × 3 尺寸）、Graph Edge、Resonance Card、Graph Mini Panel（默认 / 寻找中 / 无连接）、Graph Toolbar、Timeline Slider。
- 图标库新增 35 个 Lucide 1.60 图标（共 95 个），概览 Index 追加 29–33 行并更新图标数。每个分区附 Light / Dark 评审样张（`475:39445`、`476:40223`、`477:40705`、`477:52159`、`478:41889`），截图逐个检查浅深两套通过。页面画面见上一条。
- 设计取舍（初稿默认，待用户确认）：/ 面板与 Slash Command Item 的高亮沿用 CandidateList 的强调色；Callout 默认用 GitHub 标准语法；代码字体 Roboto Mono（避免 JetBrains Mono 连字）；共鸣点徽标用 Badge info subtle。
- 发现的既有问题（未修改）：`22 Badge` 的 `tone=accent, appearance=subtle` 填充绑定 accent/default，渲染为实心蓝底蓝字。

### 右侧栏输入框窄宽度技能入口（2026-10-25）

- 用户确认先采用空间不足时隐藏“技能”按钮的方案，保留单行工具栏。画布与写作共用的 compact ChatComposer 以自身宽度为容器查询依据：不超过 400px 隐藏按钮，更宽时恢复；输入 `/` 的技能选择入口保留，首页 wide 输入框不受影响。
- 实现仅新增技能按钮类与容器查询；Figma 未修改。真实 Electron 隔离窗口以长模型名、思考选择器和上下文用量同时显示验证：侧栏 340 / 360px 隐藏、440 / 560px 显示，各宽度按钮无重叠；340px 浅深截图已检查，`/` 打开技能选择通过。未运行完整冒烟，也未单独复验写作窗口。

### 首页对话按日期分组（2026-10-25）

- A6（2026-10-25）：左侧栏“日历”按钮启用；日历标签页为居中单列（最大宽 800px）：标题“日历” + 来源说明（macOS 系统日历 / Jarvis 日历），右上 上一周 / 本周（secondary）/ 下一周 / 刷新；日期范围；每天一行（左侧星期与日期，今天为强调色；右侧日程：时间段、标题，下一行日历名与地点，无日程显示“没有日程”）；需要授权时显示“允许访问日历”提示条，被拒时显示系统设置指引。确认框标题“新建/修改/删除日程”。无新增 Figma 画面，实窗截图检查通过。
- A5（2026-10-25）：设置 - 插件 - MCP 标签替换“暂未接入”占位：说明文字；工具栏右侧 secondary“+ 添加 MCP”（与“添加 skill”同位）；服务行：名称 + 状态 Badge（已连接 success、连接中/已停用 neutral、需要登录 warning、登录中 accent、连接失败 danger）+ 类型小字，右侧 登录 / 重新连接 / 停用 / 移除；第二行地址或命令与凭据名称（截断）；工具 Badge（需确认为 warning 色并标“· 需确认”）。添加对话框沿用 Dialog + Field。无新增 Figma 画面，实窗截图检查通过。
- A4（2026-10-25）：设置“文件与权限”页：标题“授权文件夹”+ 说明 + 右上 secondary sm“添加文件夹”；每行名称（body）与完整路径（subheadline 次要色，截断，悬停显示全路径）+ ghost“移除”；空状态“还没有授权文件夹。”。回复活动中每轮第一条文件改动下方显示“撤销本轮文件修改”（撤销后“本轮文件修改已撤销”并禁用）；文件差异视图新增“移动”。确认框标题为“覆盖文件 / 删除文件”。无新增 Figma 画面，实窗截图检查通过。
- 插话（2026-10-25）：设置 - 常规新增“回复中发送消息”行（说明文字 + 右侧 144px NativeSelect：引导当前回复 / 排队等待），版式同并发设置行；用户气泡下的小字：“将在当前步骤结束后引导回复”“已引导当前回复”“排队中，当前回复结束后发送”+ 右侧 secondary xs“引导”按钮；输入框回复中提交按钮名为“引导回复”或“排队发送”。无新增 Figma 画面，实窗截图检查通过。
- A1b-3：来自其他 Agent 的用户消息在气泡上方右对齐显示 12px 次要色小字“空间助手转交 / 空间任务状态 / Jarvis 委派 / Jarvis 的消息 · 来源对话标题”；子 Agent 回复的活动列表显示“已交给 Jarvis 处理”。无新增 Figma 画面，首页与画布助手实窗截图检查通过。
- A1b-2：首页侧栏在聊天记录上方新增“空间任务”区（`<small>` 标题沿用分组样式），最多 5 条 SidebarItem：画布用 LayoutGrid、写作用 PenLine 图标，右侧状态文字（进行中 / 等待中 / 已完成 / 失败 / 需你处理），悬停显示摘要；点击跳到对应空间并展开助手。无新增 Figma 画面，实窗截图检查通过。
- A1b-1：首页侧栏的“最近对话”标题改为按本地日期分组的标题“今天 / 昨天 / 最近 7 天 / 更早”，组内按最近活动倒序、空组不显示；组标题沿用原 `<small>` 样式（callout、fg-tertiary），组间距 12px，条目与操作不变。没有新增 Figma 画面，实窗截图检查通过。

### 设置 - 常规：同时运行的 Agent 数（2026-10-25）

- 用户确认并发上限做成设置项放在“设置 - 常规”。在“主题”与“默认下载位置”之间新增一行：左侧 body 标题“同时运行的 Agent 数”与 subheadline 次级说明“超出上限的对话会显示“等待中”，轮到后自动继续。”，右侧默认外观 `NativeSelect`（1–6，宽 96px）；底部 separator 与状态文字沿用下载设置行样式。没有新增 Figma 画面，实窗截图检查与相邻行一致。

### Agent 输入框排队状态（2026-10-25）

- A1a-2 起多个对话可同时回复，输入框只在本对话回复时锁定模型与思考选择：有输入内容时提交按钮为“排队发送”（同一图标与样式），无内容时仍为“停止回复”。排队的用户消息复用已有的 `<small>` 状态说明样式，显示“排队中，当前回复结束后发送”；被取消的排队消息显示“已取消，未发送”；等待并发槽位时回复占位文字为“等待中：同时回复的对话已达上限”。
- 没有新增 Figma 画面或组件，实窗截图检查与现有消息气泡一致。插话（steer）控件尚未设计，待用户决定。

### Agent 工具确认弹窗（2026-10-25）

- A0-2 策略引擎的确认弹窗直接复用设计系统 `AlertDialog`（Figma `363:31597`，default tone）：图标、headline 标题“允许 Jarvis 执行“工具名”？”、callout 说明（工具给出的操作描述，最多 2000 字，超出高度 160px 内滚动）、footnote 提示“5 分钟内未确认将自动拒绝，不会执行此操作。”，按钮“拒绝”（secondary，默认焦点）/“允许”（default）。Esc 等于拒绝，遮罩不关闭。多条请求逐条显示。
- 没有新增 Figma 画面或组件；浅深两套主题实窗截图检查与 AlertDialog 规格一致。是否需要专门的 Agent 确认样张（例如显示来源对话、风险等级）待用户决定。

### 0.3.0 发布前键盘复验（2026-10-25）

- 项目菜单删除完成后，确认框及被删行卸载导致焦点丢失，实窗新增断言复现；修复成功删除后下一帧聚焦剩余项目/对话行，空列表聚焦侧栏第一个动作。没有改变页面、Figma 或菜单尺寸；完整回归结果见 engineering.md 0.3.0 发布记录。
- 只读发布检查保留两项既有非阻断后续项：异步读取工作区前采用浅色默认首屏；锚定浮层缩放使用默认中心原点。移动端及营销页不属于本 Electron 桌面应用范围；macOS 13、Windows/Intel 实机交互和真实服务仍需目标环境验收。


### 创作空间项目更多菜单（2026-10-25）

- 用户要求恢复项目删除，更多按钮悬停只显示“更多”（不附带项目名如 1/2），菜单包含“在新标签页打开”和“删除”，宽度按内容自适应且有上限。
- 本地 `ShellSidebar` 项目菜单现为“在新标签页打开 / 重命名 / 删除”，删除项使用危险色并带二次确认；取消不修改项目。侧栏行菜单统一 tooltip 为“更多”，共用的对话菜单也沿用同样提示与尺寸规则。`.shell-row-menu` 使用 max-content、min-width 0，最大 min(320px, 窗口可用宽度)，长文字可换行；不修改其他位置 DropdownMenu 的默认宽度。
- 删除按项目 ID 保存到 IndexedDB，失败沿用保存错误提示并回滚数据；对应窗口标签及其他标签的前进/后退历史引用会清理。在新标签页打开复用已有打开/去重规则。
- 验证：check、build 通过；项目菜单、窗口外壳、标签与侧栏 9/9（15.6s）通过。真实 Electron 隔离 profile 验证 tooltip、菜单项、内容宽度、打开/去重、删除取消/确认、最后一个项目删除、刷新后另一项目及节点保留；新增单测验证已删除项目不残留前进/后退历史。浅色及 900×640 深色截图检查通过，路径 `apps/desktop/test-results/1b3ff218-ace0-4306-b33c-b22c2135eacb/`。本轮未修改 Figma。


### 两项变更集成验证（2026-10-25）

- 模型配置等待修复由 [PR #74](https://github.com/qianyuzhao-ai/Jarvis/pull/74) 合入 develop；关于页迁移由 [PR #75](https://github.com/qianyuzhao-ai/Jarvis/pull/75) 交付。两份项目记录冲突保留两侧内容，应用代码自动合并；合并前集成检查、构建与相关 26/26（30.1s）回归通过。没有修改 Figma 或执行版本发布。


### 关于 Jarvis 页面启用与更新入口迁移（2026-10-25）

- 用户要求启用设置“关于 Jarvis”，并将版本检查更新移动到这里。已启用侧栏入口与选中态，新增 `AboutSettings`，沿用设置页宽度、字体和浅深 token，展示工作台简介及完整应用更新区（当前版本、检查、下载/重试、进度、重启安装、反馈与最近检查时间）。
- 通用页移除更新区；关于页隐藏全局重复更新提醒和无关保存状态，其余页面继续展示可操作的更新提醒。复用现有更新状态与原生接口；设置页历史/刷新可恢复关于分类。本轮仅修改本地实现，Figma 未修改。
- 验证：check、build 通过，更新相关回归 13/13（17.9s）通过；已查看浅色下载进度及 900×640 深色待安装截图，布局正常。证据目录：`apps/desktop/test-results/72ab5a56-adef-4e3d-8fcf-40bab67d3b7f/`。使用模拟更新后端及本地 HTTP 更新服务，未发布或安装真实更新。

### 模型配置第 2 步等待修复（2026-10-25）

- 修复本地 `AddProviderDialog` 在 StrictMode 开发模式下 mounted 标记未恢复，导致“下一步”无限转圈、错误提示不显示的问题；每次 effect setup 恢复标记，卸载时仍阻止异步更新。
- 无视觉、Figma 节点或交互规范变更。新增真实开发窗口回归验证校验、模型选择、保存、编辑和刷新恢复；1/1 通过，现有模型相关 12/12、check 与 build 通过。未使用真实 Key 或验证真实 DeepSeek 连通性。


### 模型配置改造（2026-10-24，方案已确认，五个阶段已实现）

- 用户认为设置中的模型配置别扭，要求除 AIGC 空间仍用“内网地址”外，其余模型配置全部重新设计，改为通过 Pi SDK 内置服务商配置；目标效果：添加一个服务商（如 DeepSeek）后可勾选多个模型（Flash、Pro），都能在聊天窗口中切换。
- 方案已写入 Google 文档 [模型配置方案](https://docs.google.com/document/d/1WRecrTkcJNEq0BtekdvhhXqz87Q4glzOiWH_BKiXNVc/edit)：改为“服务商 → 模型”两层（一个服务商一份 Key，模型多选启用，全局默认模型）；服务商目录取自 pi-ai 1.3.0（42 个 Provider，第一期只接 API Key 类，Bedrock/Vertex/Azure/Cloudflare/OAuth 订阅延后）；自定义接口保留并扩展协议；存储升级 v3 并保留模型 id 迁移；设置页、添加服务商三步流程、选择器按服务商分组与“仅文字”限制；新 IPC 接口清单；五个实施阶段（先 Figma 设计）。
- 用户已确认：第一期服务商名单按方案表格；订阅登录（OAuth）本期不做；Jarvis 只有一个 Agent，首页、画布、写作是三个入口，共用服务商配置和默认模型，后期会共享记录和记忆；自定义中转站可以有多个，从不同中转站配置不同模型。文档已同步更新为“已确认事项”。
- Figma 初稿（`V1-视觉换新` 页 `319:27345`，待用户确认）：`Settings · Models` 浅 `428:29687` / 深 `431:43867`（设置侧栏“模型”、默认模型下拉、DeepSeek / 星河中转 / 本地 Ollama 三张服务商卡片）；添加服务商对话框 第 1 步选择 `430:29985` / `431:43966`，第 2 步连接 DeepSeek `430:30332` / `431:44100`，第 3 步勾选模型 `430:30544` / `431:44221`，自定义接口连接 `430:30863` / `431:44341`，自定义接口多选 `430:31124` / `431:44473`；首页模型选择器（按服务商分组）`431:31910` / `431:44605`，带图会话下仅文字模型禁用 `431:32341` / `431:44664`。新增本地组件 `Model Row` `427:29676`、`Provider Tile` `429:29979`、`Model Option` `429:29980`，按用户要求放在 `V1-Components` 页 Section `28 Model Settings` `432:37742`（描述 + 组件 + 浅/深 Review `432:45756`）。节点与验证记录见 `figma-sync-2026-10-21/model-settings-v1-state.json`。
- 图片理解能力（用户确认方案）：自定义接口模型按“中转站返回的能力信息 → SDK 目录精确匹配（结论冲突或匹配不到即未确认）→ 检测（随机 4 位数字小图）→ 手动”识别，只有“支持”的模型收到图片，未确认的先检测。文档新增“图片理解能力”一节及 probeVision 接口。Figma：`Model Row` / `Model Option` 新增 `visionUnknown`（“图片未确认”）；新增模型能力对话框 未确认 `434:34724` / `434:35383`、检测通过 `434:35107` / `434:35514`；自定义第 3 步、选择器与本地 Ollama 行已改为对应状态。
- 思考程度与输出上限（用户确认方案）：输入框模型选择右侧加“思考”选择，只列当前模型支持的档位，不支持时隐藏；内置服务商与目录匹配的自定义模型用目录档位和输出上限，匹配不到的思考“不调节”、输出上限“自动”、上下文“未知”，去掉旧 4096 / 32768 硬编码。文档新增“思考程度”“上下文与输出上限”两节及 setThinkingLevel。Figma：`Composer` 新增 `showThinking`；行组件新增 `thinking`（“可思考”）；模型能力对话框加思考程度并改为“未知 / 自动”；新增思考选择 打开 `437:36345` / `437:37009`、不支持 `437:36753` / `437:37062`，共 24 个画面。
- 用户确认（2026-10-24）：右侧边栏输入框也要能选思考程度，`Assistant Panel` 两个变体的 Composer 已开启 `showThinking`（画布、写作右边栏同步）；其余设计稿全部确认，进入阶段 2。实现提示：compact 宽度下模型名需截断。
- 阶段 3 实现（2026-10-24）：设置页、添加服务商三步对话框、模型能力对话框已按上述画面实现（代码见 engineering.md 阶段 3）；默认标记沿用 accent solid。实窗截图检查浅色设置页与第 3 步勾选模型布局正常。输入框思考选择与选择器图片限制已在阶段 4 实现（首页与画布右边栏共用，“思考：高”样式；带图时仅文字 / 未确认模型禁用）；写作右边栏 Agent 尚未接入，届时复用同一 Composer。
- 验证：上述画面均已截图检查（暗色检查设置页与第 1 步）；当时代码尚未改动。发现 `Badge` tone=accent appearance=subtle 在浅色下文字不可见，默认标记暂用 accent solid，组件本身未修改，待查。

### 第三阶段验收问题修复（2026-10-24）

- 用户要求修复验收问题。在 `claude/personal-workbench-project-8xza4v` 合入 `origin/feature/ui-v1-shell` 后修复，修复提交 e7e115d：
  - 横向滚动：`.window-shell` 和 `.shell-assistant-host` 加 `overflow: clip`。关闭的画布助手不再撑出页面，文档宽度 1619 → 1280。保留挂载，会话状态不丢。`sidebar.spec` 新增断言：关闭后文档无横向溢出。去掉 CSS 修复时该断言报 339px 溢出，可以拦住这个问题。
  - 设置页“返回工作台”链接和对应 `onBack` / `.sidebar-back` 已删除；15 处测试改为点图标栏“AIGC 创作空间”（与原链接同为 `space('canvas')`）。
  - `node-download`：被挡住的是左下节点的名称标签（测试素材为正方形，节点较高），挡住它的是缩放面板。这属于测试布局问题，画布控件盖住节点是正常行为，因此不改布局，只把测试初始视口从 `{40,40,0.8}` 改为 `{40,20,0.7}`。
  - 像素断言：`sidebar.spec` 的 4 处位置检查（2 处 0、−320、320；后两处在原失败点之后，此前从未执行到）和 `writing.spec` 宽度 1385 均改为 ±1px，去掉为 2× 调的 `−0.5`。
- 验证：`pnpm check`、`pnpm build` 通过；三个受影响文件 12/12；完整冒烟 107/110，剩余 3 项均为保存凭据失败（无钥匙串），与修复前相同。ui-preview 使用本地生成、未入库的 Linux 基线，所以本轮通过。
- 另记：Windows 使用原生标题栏（无 `titleBarStyle`），会与 44px 自绘顶栏叠成双层标题栏，需在真机上确认，未改。

### 第三阶段交付验收：feature/ui-v1-shell e71b46a（2026-10-24）

- 结果：未通过，需修复后再合入 develop。`pnpm check`、`pnpm build` 通过；Linux + Xvfb 冒烟 102/110。
- 环境失败 5 项（不计入）：agent、canvas-agent、model-library 依赖系统钥匙串；ui-preview 2 项只有 darwin 基线。
- 稳定失败 3 项（复现两次）：
  - `node-download.spec.ts:167`：画布浮动缩放面板挡住重命名点击；原生标题栏占用高度后出现，Windows 同样有风险，需调整布局避让，不能只改测试。
  - `sidebar.spec.ts:83`（期望 0 得 1）、`writing.spec.ts:232`（期望 1385 得 1384）：1× DPR 下精确像素断言差 1px，改为 ±1 容差。
- 真实缺陷：画布视图关闭右边栏后 AssistantPanel 仍挂在屏外（右边缘 1619），文档 scrollWidth 1619 > 1280，页面可横向滚动。关闭时卸载，或在外壳根节点加 `overflow: clip`。
- 小问题：设置页侧栏仍有“返回工作台”链接，跨空间标签页后应去掉。
- 已确认：写作 Agent 只有 read_document / read_selection / replace_range / insert_text，校验 owner / claim / runId / scope / 过期与 SHA-256 版本，只改编辑器缓冲区，无文件系统访问，安全审查通过。断言 1070 → 1226，测试 93 → 108；删除的断言均有替代，例外只有已授权的大纲断言和过时的 1440 整窗宽度。AGENTS.md 当前范围已更新为“写作助手已接入”。Linux 截图与设计稿大体一致。
- 注意：该分支包含 develop 上没有的 Agent 修复提交 a1ec3a3、1c76472、258bcf0，提 PR 时会一并带入。

### UI V1 第三阶段实施（2026-10-24）

- 已完成用户附件计划书，分支 `feature/ui-v1-shell`；按 I → J → K → N → L → M 分阶段提交与验证。
- 阶段 M：剩余图标与失效 CSS 清理、标签/写作边界回归完成。最终完整 110/110、打包依赖与真实启动通过，36 张浅深页面及状态截图已采集核对；差异、保留项与目标系统待验收见第三阶段验收记录。
- 阶段 L：320px 节点、自然比例高度、全部任务/媒体状态、28px 端口热区、独立播放与右上操作条、跟随/翻转编辑栏完成；Figma 节点与普通/放大态均核对，完整回归 106/106，通过真实模拟服务与浅深状态截图验证。
- 阶段 N：写作助手已接入文档作用域对话与四个缓冲区工具，版本冲突拒绝、同轮回执/CodeMirror 撤销、跨标签写回和不落盘均经实窗验证；完整回归 104/104。权限与存储边界见第三阶段验收记录。
- 阶段 K：页面内容已迁入新外壳；Composer/AssistantPanel、项目行内操作、写作 560px 正文与选区计数完成，大纲及内部文档标签移除。20 张浅深截图和完整 101/101 通过，写作 Agent 工具在 N 接入。
- 阶段 J：窗口外壳、跨空间标签、历史/恢复/快捷键和页面结构接线完成，完整回归 101/101；页面内容视觉迁移在阶段 K 继续。
- 阶段 I：新增统一图标出口和 SidebarItem、WindowTabs、Composer、AssistantPanel；Figma 实际节点及截图核对、实现差异与门禁记录见 `memory/ui-v1-implementation.md` 第三阶段。设计文件未修改。

### 第三阶段计划书更新：跨空间标签与空间 Agent（2026-10-24）

- 用户决定：跨空间标签页现在就做；写作空间右边栏去掉大纲；右边栏弹出后只是 Agent 对话，在哪个标签页打开就能操作该标签页的空间。要求写进计划书并 PR 到 develop。
- 计划书入库为 `memory/ui-v1-shell-plan.md`（已登记 AGENTS.md 记忆索引）：新增 J3 跨空间标签页（标签模型 chat / canvas / writing / settings、打开 / 去重 / 关闭规则、写作打开文档并入全局标签、快捷键、`localStorage` 键 `jarvis:window-tabs` 持久化、每标签后退前进与右边栏状态）；新增阶段 N（右边栏 = 所在空间 Agent：画布沿用项目会话；新增写作 Agent，照 canvas-tools / canvas-broker 模式，只能读 / 改当前标签文档的编辑器缓冲区，带版本校验与同轮撤销，不直接写盘、无其他文件操作；完成后更新 AGENTS.md 当前范围）；K3 去掉大纲（允许删除大纲断言并列明）；首页与设置不显示右边栏。阶段顺序 I → J → K → N → L → M。

### UI V1 第三阶段 Codex 执行计划书（2026-10-24）

- 用户要求制作移交 Codex 的执行计划书。已交付（会话临时文件 codex-plan-ui-v1-shell.md，未入库）：分支 feature/ui-v1-shell，阶段 I 图标出口 @jarvis/ui/icons + SidebarItem / WindowTab / Composer / AssistantPanel；J 窗口外壳（顶栏 44、图标栏 48、主面板内缩 6、右边栏在外壳上、trafficLightPosition 调整为唯一主进程改动）；K 页面迁移（首页、创作空间项目列表并入侧栏列、写作空间进入外壳并迁移文档标签、设置）；L 画布节点与编辑栏（320×180 比例规则、状态映射、端口 14 / 热区 28、操作条删除、编辑栏摆放规则与放大态）；M 清理与总验收。
- 计划中的默认决定（未经用户逐条确认）：标签栏只做当前空间内标签；后退 / 前进为会话内历史；“更多”按钮、头像、首页上下文条、麦克风不做；写作右边栏保留大纲 / 写作助手 Tab，助手为占位不接模型；日历禁用占位；“定位到节点”不做；生成已用时间由 generation.startedAt 客户端计算。

### V1 画布节点：端口放大、页面稿换用组件（2026-10-24）

- 用户决定：不显示上传进度；生成耗时由我们自己计时（接口不支持取消 / 进度）；连接端口要变大；页面稿中的节点换成现有节点组件。
- `Generation Node` / `Asset Node`：端口改为 14px、2px 描边（输入 x −7、输出 x 宽 −7，垂直居中），热区 28（Port hit area (28)），悬停放大到 18；上传中恢复为 Spinner + “正在上传 文件名…”；生成中“正在生成 · 已 1:24”说明为客户端按提交时间计时、不提供取消。审阅板端口悬停示意改为 18px。
- 页面稿 4 个画布帧（`400:33060`、`400:35061`、`402:34479`、`402:35041`）：删除早期 200 宽手绘节点卡、旧连线与端口，改为组件实例——3 个 Asset Node（image ready，selected，媒体分别覆盖为三种渐变，名称 海边日落 / 城市夜景 / 森林晨雾.png）→ 3 个 Generation Node（图像生成 1 generating，2 / 3 empty），实例按画布缩放 rescale（列表收起 75%、项目列表展开 60%），连线从输出端口到输入端口重画；左下缩放显示改为 75% / 60%；工具栏与浮动控件保持最上层。

### V1 画布节点：剩余待办与尺寸调整（2026-10-24）

- 用户要求：继续处理剩余待办；节点默认尺寸改为 16:9、宽 320；删除节点按钮换位置。
- `Generation Node`（17 个变体）与 `Asset Node`（10 个变体）：媒体块改为 320×180（竖图示例 320×320，内含 180×320 结果，高度规则 320 ÷ 宽高比、限制 180–320）；端口按新尺寸居中并加 24px 透明热区（Port hit area）；新增 `focusVisible` 属性（外 5px、3px color/focus-ring 环，区别于选中环）；名称改为 Name row，选中时显示 selection/default 底（随 `selected`）；生成中文案“正在生成 · 已 1:24”。删除按钮移到节点右上操作条（trash，生成 / 上传中不显示），非生成中状态都有操作条。上传中改为文件名 + small 确定进度条 + “45% · 3.2 / 7.1 MB”；音频就绪只保留播放 + 时长（不在节点内拖动进度）。
- `Node Editor`（现 9 个变体）：移除底栏删除按钮与分隔；empty 在生成按钮旁显示禁用原因（图像“选择模型并填写提示词后可生成”、视频“填写提示词后可生成”）；无参考占位块加“连接上游节点 / 或放大后添加”；生成信息标题改为“生成信息 · N 个参考”；新增 `kind=image, state=error, size=default`（`417:37320`，参数行下 Alert error 可关闭）；描述补充摆放规则：选中节点下方 16px 居中，空间不足翻到上方，夹在可视区内（边距 16），宽 min(760, 画布宽 − 32)，随画布平移缩放，节点出视口时贴边并提供“定位到节点”（提议）。
- 审阅板重建 `Canvas Node / Review`（`418:37299`，Light + Dark 克隆），3520×2020：全部状态、端口悬停（14px accent 端口 + Tooltip“输出：拖向下游节点”）、键盘焦点、多选名称高亮、组合（编辑栏在节点下方 16px）、视频生成中 / 空 / 错误编辑栏。总览行变体数 17 · 10 · 9。
- 仍待确认：“定位到节点”为新增交互提议。（生成取消：接口不支持，不做；页面稿节点已于后续替换为组件。）

### V1 画布节点 UI/UX 检查与修正（2026-10-24）

- 用户要求检查节点设计的 UI/UX 问题；随后要求按建议顺序直接在 Figma 修改，并把第 14 点（参数图标难懂）改为不显示图标、只显示当前选择的参数。
- 检查结论（P0）：失败态与代码不符（代码失败时保留旧结果）、结果未知提示过轻、缺“媒体加载中 / 媒体无法加载”；（P1）固定 360×240 未体现 contain 留白、视频原生控制条与选中拖动冲突、音频拖动冲突、媒体上的 subtle Badge 对比度不稳、操作仅悬停可见、端口 10px 热区小、上传与生成无进度信息、删除图标不一致且紧邻生成、生成禁用无原因、参数图标难懂；（P2）参考区提示、生成信息标题技术化、编辑栏摆放规则、名称重叠与多选、焦点与选中样式、错误提示变体。
- 已改（本轮）：
  - `Generation Node`（`407:34466`，现 17 个变体）：failed 改为无旧结果卡片（danger 图标 + “生成失败” + 原因 + 重试）；新增 failed-result（保留结果，左上 danger solid Badge + 底部原因条 + 重试 xs）；unknown 改为警示卡片（“上游可能已经生成并计费，重新生成前请先核实” + 查看任务信息）；新增 media-loading、media-error（重新加载媒体）；新增 image done-portrait（宽 360，高按比例并限制 202–360，9:16 结果 contain 居中、留白 fill/default）。描述补充：视频用封面帧 + 悬停播放按钮，不用原生控制条；叠在媒体上的 Badge 一律 solid；操作条悬停 / 聚焦 / 选中显示；端口热区 24。
  - `Asset Node`（`407:34737`，现 10 个变体）：删除按钮图标改为 trash；“素材”Badge 改 neutral solid；新增 image media-error。
  - `Node Editor`（`409:35547`，8 个变体）：参数 NativeSelect 去掉前置图标，只显示当前值；删除按钮移到底栏最左，后接 1px 分隔，远离生成按钮。
  - 审阅板重建为 `Canvas Node / Review`（`415:36360`，Light 板 + Dark `415:40313`），3840 宽，含全部新状态与“无参考占位”编辑栏；总览行变体数更新为 17 · 10 · 8。
- 未改（待后续）：音频拖动冲突、上传进度条、生成已用时间 / 取消、端口放大视觉、生成禁用原因提示、参考区提示文案、生成信息标题、编辑栏摆放规则、名称重叠 / 多选、焦点样式、编辑栏错误变体。

### V1 画布节点与节点编辑栏（2026-10-24）

- 用户认可当前页面框架；要求把现有图像节点、视频节点（含上传的）以及节点编辑栏拎出来看样式。
- 依据代码盘点（develop）：MediaPlaceholder（生成节点 360×240：empty“点击编辑”/ 生成中 / 结果 / failed“失败”/ unknown“结果未知”，下载操作，左入右出端口，名称在下方可重命名）、AssetNode（上传素材 image / video / audio：上传中 / 就绪（下载 + 删除）/ 上传失败，仅输出端口）、MediaEditor（参考素材 + PromptEditor + 关闭 / 放大；ImageControls 模型 / 宽高比 / 思考程度 / 分辨率，VideoControls 模型 / 时长 / 宽高比 / 分辨率 + 生成音频；删除、生成；GenerationDetails 折叠卡）。
- 图标库新增 music `406:32605`、play、volume-2、volume-x、minimize、rectangle-horizontal、diamond、clock-3、copy、image-plus（`406:*`，共 60 个）。
- 新 Section `27 Canvas Node · Node Editor`（`407:34738`），总览 Index 行已追加：
  - `Generation Node`（`407:34466`，kind image / video × state empty / generating / done / failed / unknown）：媒体块 360×240、radius 12；empty / failed / unknown 为 surface-raised + 0.5px border + 图标 + “点击编辑…”，failed / unknown 左上 danger / warning Badge；generating 为 fill/default + Spinner lg；done 铺满结果，视频加中心播放按钮与右下时长 Badge；右上悬浮操作条（下载）；左右 10px 端口；selected 为外 3px 的 2px accent 圆角环；名称在下方。属性 `name`、`selected`、`showActions`。
  - `Asset Node`（`407:34737`，kind image / video / audio × state uploading / ready / upload-failed）：仅输出端口；ready 左上“素材”中性 Badge（新增提议，区分上传与生成）、右上下载 + 删除；音频为播放按钮 + small Progress + 时间；上传失败为 danger 图标与原因 + “请重新拖入文件上传”。
  - `Node Editor`（`409:35547`，kind image / video × state empty / ready / busy）：760 宽，surface-raised + border + shadow-popover，radius/window；上部参考缩略图 64×80（编号 BadgeCount）+ 虚线“参考”添加块、提示词（@ 引用为 accent Badge 标签）、关闭 / 放大；下部参数为公开 NativeSelect compact sm + 前置图标，视频加生成音频 Toggle sm，右侧删除与生成（default icon-lg，空或生成中禁用），busy 显示 Spinner“正在生成…”并禁用参数；底部公开 Collapsible card“生成信息”（`showDetails`）。
  - 审阅板 `Canvas Node / Review`（`410:35898`）：Light / Dark 点阵画布上展示全部状态，以及“上传素材 → 选中生成节点 + 编辑栏”组合与视频编辑栏生成中。点阵改为单个 SVG 路径（逐个椭圆会导致脚本超时）。
- 待确认：上传素材节点的“素材”Badge；生成中是否显示进度百分比（当前接口无进度，用 Spinner）。
- 编辑栏放大态（同日补）：`Node Editor` 新增变体属性 `size`（原 6 个为 default），新增 `kind=image|video, state=ready, size=expanded`（`412:35898` / `412:36174`）。依据代码 `.media-editor.is-expanded`：居中 960×600 对话框、shadow-dialog、color/scrim 遮罩、焦点圈定、Esc 先还原再关闭。结构：“参考素材”标题 + 数量（图像 3 / 9 仅图片；视频可含图片 / 视频 / 音频），参考条横向（虚线 + 添加块在首位，72×96 缩略图左下编号 solid Badge、右上 secondary icon-xs 移除、下方文件名），分隔线下为占满剩余高度的提示词（多个 @ 引用 accent Badge）；右侧关闭 / 还原（minimize）；底部参数行与生成信息同普通态。审阅 `Node Editor · Expanded / Review`（`412:39281`）：Light 图像、Dark 视频，点阵画布 + 节点 + 遮罩 + 居中放大面板。
- 发现差异：代码普通态的参考区为最多 3 张叠放卡片 + 数量角标（84×104，点击放大），无参考时为占位图标、不提供添加；Figma 原画为单张缩略图 + 添加块。用户决定按代码改回：`Node Editor` 6 个 size=default 变体的 References 改为 84×104——有参考时 3 张 72×96 叠放卡片（radius 6、1px border，顶层左上、其后各向右下偏移 4px，左上编号标签 = surface-raised 底 + footnote，视频示例含音频卡），左下 BadgeCount neutral“3”；empty 为 fill/default + 0.5px border 占位块 + image 图标。放大态缩略图编号同步改为左上同款标签（移除按钮保持右上）。组件描述已更新。

### V1 右边栏移到外壳（2026-10-24）

- 用户要求：右边栏入口按钮放到顶部右上角标签页栏；右边栏背景也为磨砂透明。
- `Assistant Panel` 组件（`399:34448`）两个变体改为透明背景，描述同步：位于窗口外壳毛玻璃上、白色主面板右侧，不加分隔线。
- 6 个页面帧（画布 `400:33060` / `400:35061`、项目列表展开 `402:34479` / `402:35041`、写作 `401:33851` / `401:34895`）：Assistant Panel 移出主面板放到外壳上（x 913，宽 360，高同主面板，透明底，Composer 保持不透明）；白色主面板宽度缩为 865，右侧也呈圆角与边框；删除画布工具栏与写作文档工具栏中的 panel-right Toggle，改为外壳顶栏最右侧 Toggle（开），“更多”移到其左侧。首页 Chat 无右边栏，未加该按钮。

### V1 创作空间：画布工具栏背景（2026-10-24）

- 用户要求：画布页顶部“图像 / 视频 / 上传”所在的工具栏行需要与画布区分，加背景。已在 4 个画布帧（`400:33060`、`400:35061`、`402:34479`、`402:35041`）的 `Canvas toolbar`（高 48）上加实色背景 color/window（Light neutral/100、Dark neutral/850）与底部 1px color/separator，置于画布最上层，遮住点阵；节点仍从 y 64 开始。

### V1 创作空间：项目列表展开状态（2026-10-24）

- 用户说明：创作空间中，左侧（外壳顶栏的侧栏开关）打开后显示项目列表；一个项目就是一张画布。
- 新增 `Canvas · Projects open / Light`（`402:34479`）与 `/ Dark`（`402:35041`），由画布页复制（位于画布页下方 3000）：主面板左侧加入项目列表列 248（fill/default + 1px separator）——标题“我的项目”（title-3）+ ghost 搜索；Sidebar Item “新建项目”（plus）；“最近编辑”分组下 5 个项目（layout-grid 图标 + 最近编辑时间 meta，当前“视觉系统”selected）；底部“共 5 个项目 · 一个项目对应一张画布”。画布缩为 616，工具栏、居中添加按钮与右下视图控件随之调整；右侧 Assistant Panel 不变。
- 原 `Canvas · Creation`（`400:33060` / `400:35061`）为列表收起状态，二者并存。待确认：项目行是否需要缩略图、项目的重命名 / 删除放在行内更多菜单。

### V1 写作空间页面（2026-10-24）

- 用户要求接着做写作空间页面。`V1-视觉换新` 新增 `Writing · Editor / Light`（`401:33851`）与 `/ Dark`（`401:34895`），由首页帧复制（位于首页下方 2000）。
- 外壳：标签新增“周报草稿.md”（file-text，active），聊天 / 视觉系统 inactive；图标栏写作空间选中。
- 主面板三栏：① 侧栏列 248（fill/default）：Button ghost lg “我的文档 ▾” + ghost 新建文件 / 新建文件夹；文件树全部为 Sidebar Item（文件夹 folder-open / folder，文件 file-text，子项左缩进 16，当前文件 selected）；底部本地路径 callout fg-tertiary。② 编辑区 616：文档工具栏 48（“周报 /”路径 + 文件名 headline + 已保存；右侧搜索、大纲 Toggle（list-tree，关）、右边栏 Toggle（panel-right，开））；正文列 552 居中（title-1 Semibold 标题、footnote 元信息、title-3 Semibold 小标题、body-relaxed 正文与列表），所选两段以 selection/default 底高亮；底部状态栏 28（“已选 2 段” / “Markdown · UTF-8”）。③ Assistant Panel conversation（360），标题“写作助手”，改写对话 + 回执“已保存：替换 2 段”+ 撤销，后续“再口语一点 / 保持”；Composer 上下文“周报草稿.md / 已选 2 段”，占位“让助手改写、续写、总结…”。
- 大纲原在右侧栏 Tab 中，现改为编辑区工具栏的 Toggle（展开方式待定）。正文为 CodeMirror 业务区，不进 packages/ui。插件几何检查通过，截图下载仍被代理拒绝。

### V1 创作空间画布页 · Assistant Panel 右边栏（2026-10-24）

- 用户要求：先做创作空间页面，并带上右边栏。
- 图标库新增 upload `398:32605`、panel-right `398:32610`、undo-2 `398:32614`、grid-3x3 `398:32618`、lightbulb `398:32625`（共 50 个）。
- 新 Section `26 Assistant Panel`（`399:34448` 组件集，Section `399:34449`，Dark 样张 `399:34451`），总览 Index 行 `400:38742` 已追加：360×720（页面中填充高度），底 color/content；头部 44（标题 headline + ghost 历史 / 新对话 / 关闭）；content=empty：sparkles + 标题 + 说明 + 3 个 secondary sm 建议（lightbulb）；content=conversation：右对齐 fill/default 用户气泡（宽 244）、助手正文、Alert success 回执“已保存：新建 3 个节点”+ 撤销、后续“开始生成 / 稍后”按钮；底部公开 Composer compact（上下文“已选 3 个节点 / 视觉系统”）。属性 `title`。三个空间共用（画布助手 / 写作助手 / 日历助手）。
- 页面 `V1-视觉换新` 新增 `Canvas · Creation / Light`（`400:33060`）与 `/ Dark`（`400:35061`），由首页帧复制：标签“视觉系统”active、“聊天”inactive；图标栏 AIGC 创作空间选中。主面板内侧栏列收起（画布需要宽度，外壳侧栏开关可展开），左为画布 865 宽：color/content + 24px 点阵（fg/tertiary 50%），顶部画布工具栏 48（标题“视觉系统”+“已保存”；居中 secondary sm 图像 / 视频 + 上传 icon-sm；右侧导出 Excel + panel-right Toggle 开）；节点卡 200 宽（surface-raised、radius 12、shadow-control；头部图标 + 标题 + Badge；媒体 112；底部提示词 footnote 两行）：3 个参考图节点（选中，2px accent 外描边）→ 3 个图像生成节点（Seedream 4.0 accent Badge，第一个 Progress Ring 24 + “正在生成… 60%”，其余“等待生成”），贝塞尔连线 + 端口；左下缩放胶囊（− 100% + 适应），右下视图 Toggle（缩略图 / 网格 / 吸附开）。右为 Assistant Panel conversation（360，左 1px separator）。
- 节点卡、连线、点阵为页面层元素（React Flow 业务，不进 packages/ui）。待确认：画布页侧栏列是否展示项目列表；节点卡样式（之后可抽为 Canvas Node 组件）。插件几何检查通过，截图下载仍被代理拒绝。

### V1 Composer 对话输入框组件（2026-10-24）

- 用户要求：把首页聊天输入框做成组件；写作空间、创作空间、日历都会有可通过对话调用模型的右边栏，同样使用该输入框。
- 新 Section `25 Composer`（`395:33743`），组件集 `Composer`（`395:33742`，6 个变体）：layout（wide 首页 720 / compact 右边栏 340，实例可填充栏宽）× state（empty 占位 + 发送禁用 / filled 有内容 / busy 回复中，发送换为 secondary 停止按钮）。全 auto-layout：上方上下文条（fill/default、radius 12、藏于输入框后 12px，两个公开 ghost sm 按钮 Context 1 / 2 + 右侧设置 icon-sm），输入框 surface-raised + 0.5px border + shadow-control、radius 16、文本 body-relaxed 自动增高；工具栏 + 附件 / 技能 / 模型（公开 NativeSelect compact sm）/ 麦克风 / 发送。属性 `placeholder`、`value`、`showContext`、`showSkill`、`showModel`、`showMic`（默认关）。行为约定：Enter 发送、Shift+Enter 换行、输入法组合期间不发送，/ 与 @ 候选浮于输入框上方。
- 图标库新增 `Icon / square`（停止，`394:32605`）与 `Icon / clock`（`396:33280`），共 45 个。
- 审阅板 `Composer / Review`（`397:33074`）：wide 三态；360 宽“画布助手”右边栏示意（标题 + 历史 / 新对话 / 关闭、消息、compact 输入框）；写作（周报草稿.md / 已选 2 段）与日历（10 月 24 日 / 日历，隐藏技能）上下文示例。总览 Index 行已追加。
- 首页 Chat（`389:26739` / `389:27224`）的手绘输入框已替换为 Composer wide/empty 实例，底边距 24。插件几何检查通过，截图下载仍被代理拒绝。
- 待确认：右边栏本身（标题栏、消息样式、宽度 360）尚未做成组件；麦克风默认隐藏。

### V1 图标库独立 · Sidebar Item · Window Tab（2026-10-24）

- 用户要求：补侧栏列表行与窗口标签页组件；新风格用到的图标全部放进新的组件库，不与旧图标混用，便于以后批量替换。
- V1 图标库：`V1-Components` 新增 Section `Icons · Lucide`（`391:32605`），43 个组件命名 `Icon / <lucide 名>`（Lucide 1.60，24px，内层 SCALE，线宽 1.75，描边默认 V1 color/fg/default）。来源：旧 Components 页 31 个图标复制而来；此前新增的 12 个（house / layout-grid / pen-line / calendar / arrow-left / square-pen / message-circle / mic / monitor / sparkles / settings / brain，ID `387:*` 不变）移入；brain / layout-grid / square-pen 的旧重复版本统一指向库内版本。旧 Components 页图标未改动，仍供旧页面使用。
- 迁移：11 个 INSTANCE_SWAP 属性默认值改为库内图标；V1-Components 与 V1-视觉换新两页 259 处引用（189 处经属性、70 处直接替换）改指库内图标，保留原颜色覆盖。复查：两页旧图标引用 0、库内引用 956；抽查 Button 各变体 / 禁用、NativeSelect、Tabs 开启隐藏图标后颜色仍为对应 V1 语义变量。
- 新 Section `24 Sidebar Item · Window Tab`（`392:32720`），审阅板 `393:32641`，总览 Index 行 `393:33954`（另加图标库行 `393:33959`）：
  - `Sidebar Item`（`392:32673`，state default / hover / selected / disabled）：高 32、左 8 右 4、间距 8、radius/control、宽度填充；图标 16（fg-secondary，选中 fg），标题 body 单行省略，可选 meta（callout fg-tertiary），hover / selected 显示 ghost icon-xs 更多按钮；hover fill/default，selected fill/hover（失焦用 selection-inactive），disabled fg-disabled。属性 `label`、`showIcon` + `icon`、`meta` + `showMeta`。
  - `Window Tab`（`392:32719`，state active / inactive / hover）：高 28、默认宽 200（代码 120–240 自适应）、左 10 右 4、间距 6、radius/control；active = surface-raised + 0.5px border + shadow-control、标题 Semibold；inactive 透明 + fg-secondary、无关闭；hover fill/default + 关闭（ghost icon-xs x）。属性 `label`、`showIcon` + `icon`、`closable`。
- 首页 Chat（`389:26739` / `389:27224`）：标签区改为 Window Tab（聊天 active、视觉系统 inactive）+ 新建；侧栏“新对话”与最近对话改为 Sidebar Item（含时间 meta，首条 selected）。插件几何检查通过，截图下载仍被代理拒绝。

### V1 页面框架：Codex 式窗口外壳 · 首页 Chat 初稿（2026-10-24）

- 用户给出 Codex 桌面版截图作为想要的框架：外圈为半透明磨砂外壳（顶栏 + 左侧图标栏），主要内容区为白色不透明面板，与外壳明显区分。要求直接在 Figma 绘制。
- 页面 `V1-视觉换新`（`319:27345`）新增 `Chat · Home / Light`（`385:26739`）与 `Chat · Home / Dark`（`385:26875`），各为 1440×900 渐变壁纸上的 1280×800 窗口，全部绑定 V1 变量与文字 / 阴影样式；图标为从 lucide-react 1.60.0 提取的路径（线宽 1.75）。
- 结构：窗口 radius/window、底 color/sidebar（毛玻璃）、0.5px border、shadow-dialog。外壳顶栏高 44：交通灯 (18, 16)，后退 / 前进 / 侧栏开关 ghost 28；标签页（220×28，fill/default 底，与内容列对齐）+ 新建；右侧更多。外壳图标栏宽 52：首页（选中 fill/hover 底）/ 创作空间 / 写作 / 历史 / 更多，底部设置与头像。主面板 x 52、y 44，右与下内缩 6，radius/panel，color/content + 0.5px border；面板内侧栏列 248（fill/default 底 + 1px separator）：“Jarvis ▾”、搜索、新对话、最近对话列表（选中 fill/hover）、底部“本地工作台”；内容区居中欢迎语（brain 40 + title-1）与底部 720 宽输入框（上方上下文条“本地工作台 / 未关联项目”，输入框 surface-raised、radius 16、+ / 技能 / 模型 DeepSeek V3 ▾ / 麦克风 / accent 圆形发送）。
- 待确认：标签页是 Codex 的结构，Jarvis 目前没有多标签；图标栏分区（首页 / 创作 / 写作 / 历史）与侧栏列表的分工；麦克风为示意。插件几何检查通过；截图下载仍被代理拒绝，未做截图复核。
- 用户反馈（同日）：① 多标签页是后续要做的功能，保留；② 左侧图标栏为 首页 / AIGC 创作空间 / 写作空间 / 日历，日历未实现，只占位且为不可选中（disabled）状态；③ 页面应使用 V1 组件。
- 已按反馈重建为 `Chat · Home / Light`（`389:26739`）与 `Chat · Home / Dark`（`389:27224`），旧的手绘版 `385:26739` / `385:26875` 已删除。窗口内 28 个控件均为 V1 组件实例：Icon Button（后退 / 前进 disabled / 侧栏开关 / 新标签 icon-sm / 更多 / 搜索 / 麦克风 / 上下文设置 icon-sm / 加号；发送为 default icon）、Tabs Trigger（segment active，图标 message-circle，closable）、Toggle default（图标栏首页 on、创作 / 写作 off、日历 disabled、设置 off；最近对话列表行 on / off，宽度填充、左对齐）、Button ghost（“Jarvis ▾” lg + trailing chevron、新对话 + square-pen、上下文“本地工作台 / 未关联项目” sm、技能 sm）、NativeSelect compact sm（模型 DeepSeek V3）。图标栏宽 48。交通灯（系统绘制）、头像、欢迎图标与输入框外壳仍为页面层元素。
- 为图标替换在旧 Components 页 `Lucide / Icons`（`26:330`）新增 12 个 Lucide 组件（同原结构：24px、内层 SCALE、线宽 1.75、描边沿用原变量）：house `387:26739`、layout-grid `387:26743`、pen-line `387:26749`、calendar `387:26753`、arrow-left `387:26759`、square-pen `387:26763`、message-circle `387:26767`、mic `387:26770`、monitor `387:26775`、sparkles `387:26780`、settings `387:26786`、brain `387:26790`。已验证替换进 Icon Button / Toggle 后颜色仍取 V1 语义变量（fg/secondary、fg/disabled、on-accent、accent）。
- 注意：现有组件没有列表行（ListRow）与侧栏导航项，暂以 Toggle / ghost Button 组合；标签页外观借用 Tabs Trigger segment，宽度随内容（84），与 Codex 的宽标签不同。

### V1 第三批暂停（2026-10-24）

- 用户决定：第三批（布局模板层：窗口外框 / 顶栏、AppSidebar、Toolbar、SettingsRow、列表行、EmptyState）不按本计划设计，用户将自行重新做样式设计。不再继续 25 及以后的组件。
- 已完成的 `24 Window · TitleBar`（Section `382:33089`）未被采纳；其中“顶栏 60 → 52”等提议作废，代码不做对应修改。用户要求删除：已确认无外部实例引用后，删除该 Section（含 Traffic Lights / TitleBar / Window 组件集与审阅板）及总览 Index 行 `382:33914`；V1-Components 现以 `23 Progress` 结尾。下文 24 的初稿记录仅作历史。

### V1 第三批：24 Window · TitleBar 初稿（2026-10-24，未采纳）

- PR #69（第二批代码）、#70（设计记录）已合并；用户要求开始设计第三批。按方案第十二节第四步“布局模板层”，计划顺序：24 Window · TitleBar、25 AppSidebar、26 Toolbar、27 SettingsRow、28 列表行（ListRow）、29 EmptyState（Card / Resizable 拖动条视需要并入）。设计分支已从合并后的 develop 重建。
- 现状（develop 代码）：macOS `titleBarStyle: hiddenInset`、`trafficLightPosition {16, 23}`、vibrancy=sidebar；内容区 `.workspace` 左侧 16 圆角，顶栏 `.workspace-toolbar` 最小高 60，侧栏收起时左让 96；侧栏 230–320 可拖动。
- 新 Section `24 Window · TitleBar`（`382:33089`），总览 Index 行 `382:33914`：
  - `Traffic Lights`（`382:32613`，active true / false）：系统按钮示意，12px、间距 8，失焦为 fill/pressed 灰；代码不实现，仅用于页面稿避让左上 72×52。
  - `TitleBar`（`382:32945`，6 个变体）：kind（page / back / tools）× sidebar（open / collapsed）。高 52、左 16（收起时 84 并显示侧栏开关）、右 12；标题 V1/headline，可选副标题 subheadline fg-tertiary；右侧状态 callout fg-tertiary + ghost icon 按钮（间距 4）；tools 的中间工具组绝对居中。属性 `title`、`showSubtitle`、`status` + `showStatus`、`showActions`。整条为拖动区，控件 no-drag；无底色，内容滚到下方时加 0.5px separator。
  - `Window`（`382:33088`，4 个变体）：sidebar（open / collapsed）× active（true / false）。960×600，radius/window，底 color/sidebar；侧栏 240，交通灯 (20, 20)，侧栏开关在侧栏右上；内容区 color/content，展开时左两角 radius/window + 0.5px separator；失焦时交通灯灰、标题 fg-secondary。Sidebar / Content slot 为占位。
- 提议（待确认）：顶栏由 60 改为 52（macOS 26 统一工具栏），交通灯垂直居中 → 代码需同步 `trafficLightPosition` 约 {x: 20, y: 20}、收起时左让 84。
- 审阅板 `Window · TitleBar / Review`（`382:33521`）：Light / Dark 各含渐变壁纸上的窗口（展开、收起 + 失焦）与三种 TitleBar。插件几何检查通过（交通灯 (20, 20)、顶栏 52、工具组居中 360/720）；截图下载仍被代理拒绝，未做截图复核。初稿待用户确认。

### 第二批组件代码实现验收（2026-10-24）

- Codex 按 `codex-prompt-ui-v1-batch2.md` 在 `feature/ui-v1-overlays` 实现（E `157ce2d` / F `a73903a` / G `d7ed150` / H `3487102`，文档 `49ac988`），实施记录在该分支 `memory/ui-v1-implementation.md`“第二批”章节。
- 复验（Linux 容器 + Xvfb）：`pnpm check`、`pnpm build` 通过；完整回归 90/95，失败为 agent / canvas-agent / model-library 保存 API Key（容器无系统钥匙串，与第一批及 develop 相同）和 2 项缺少 Linux 预览基准，均为环境问题。Codex 在 macOS 报告 95/95。
- 代码审查：无删除文件、无 main / preload / IPC 改动；测试 expect 997 → 1068、用例 88 → 93，移除的 8 条断言均有等价替换（details open → data-state、progress value → aria-valuenow、数量文本 → 可访问名称）。ConfirmProvider 排队与结果只回传一次正确，9 处确认均加等待锁；重新生成确认后重读节点；Toast 与 GenerationNotice 保留原队列。
- 视觉：预览页第二批区域（macOS 基准与 Linux 实际渲染）浅深两套与 Figma 结构、颜色一致；插件 Tabs、写作右栏 Tabs 页面截图正常。
- 小问题（不阻塞）：Toast 视口 `flex-col-reverse` 使最早一条在最下、新通知在上，设计为最新在下；导出“已取消”使用 success 对勾，建议用 info；预览页 DropdownMenu / Dialog 行残留状态读数文字（“false name”“false”），仅开发预览。
- Codex 保留项（同意）：MediaEditor 不改 Dialog（共用 CodeMirror 实例，960×600 放大外壳）；ContextUsage 保留 hover + 点击混合提示。
- 用户要求修复上述三个小问题并合并：提交 `8ad1224`（Toast 视口改 `flex-col`，最新在下；取消导出改 info；预览状态读数改 `sr-only`）。补充堆叠顺序与取消导出 `data-tone` 断言，预览 + 导出专项 10/10 通过（另 2 项为缺少 Linux 基准）。macOS 预览基准只把两处调试文字区域填为背景色；Linux 前后渲染差异仅限这两处文字（524 像素），布局不变，待用户在 macOS 跑一次预览截图测试确认。
- [PR #69](https://github.com/qianyuzhao-ai/Jarvis/pull/69) 已按用户要求合并入 develop（merge commit `37a5db4`）。

### V1 第二批：23 Progress 初稿（2026-10-23）

- 新 Section `23 Progress`（`378:32572`），总览 Index 已追加行 `379:33179`。第二批 14–23 全部完成初稿。
- `Progress`（`378:32536`，8 个变体）：type=determinate × size（small 4 / regular 6）× tone（accent / success / danger），以及 type=indeterminate × size（tone=accent）。轨道 fill/pressed、胶囊圆角，宽度跟随容器。determinate 的轨道为 auto-layout、Indicator 填充，用实例 `paddingRight = 轨道宽 × (1 − 进度)` 表示进度（Figma 不支持覆盖实例内图层尺寸，已实测；padding 覆盖在嵌套实例中可用）。indeterminate 为 72px 指示段往返动画（约 1.2s，减少动态效果时改静态）。`role="progressbar"`，不确定时省略 aria-valuenow。
- `Progress Field`（`378:32558`，3 个变体）：tone accent / success / danger；标签 body + 数值 callout，regular 进度条，可选提示行（剩余时间 / 大小 / 失败原因，失败时数值与提示为 danger）。属性 `label`、`value` + `showValue`、`hint` + `showHint`。
- `Progress Ring`（`378:32571`，4 个变体）：size 16（stroke 2）/ 24（stroke 2.5）× tone accent / danger，12 点方向顺时针、圆头，调 Indicator arc 结束角表示进度；不确定进度用 Spinner。
- 审阅板 `Progress / Review`（`379:32523`）：导出画布对话框（60% + 取消）、设置中模型下载（35% / 已完成 / 网络中断 42%）与“正在连接 ComfyUI”不确定进度、画布生成节点缩略图上的环形 60% 胶囊、生成列表行（small 条 + 环）。插件检查进度宽度与数值一致；未做截图复核（截图下载被代理拒绝）。初稿待用户确认。

### V1 第二批：22 Badge 初稿（2026-10-23）

- 新 Section `22 Badge`（`376:32536`），总览 Index 已追加。
- `Badge`（`376:32522`，12 个变体）：tone（neutral / accent / success / warning / danger / info）× appearance（subtle / solid）。高 18，水平内边距 6，radius/small，文字 V1/subheadline 11px Semibold；subtle 为 *-subtle 浅底 + 语义色字（accent 浅底为 accent/default 15% 不透明度，neutral 为 fill/default + fg/secondary），solid 为语义色实底 + on-accent 白字（neutral 为 fg/secondary 底）。属性 `label`、`showIcon`（默认关）、`icon`（实例替换，12px）。只读，不可点击；可点击筛选用 Toggle / ToggleGroup。
- `Badge Count`（`376:32529`，3 个变体）：tone accent / danger / neutral（neutral 为 fill/pressed + fg/secondary），高 16、最小宽 16 胶囊，内边距 4，V1/footnote 10px Semibold；属性 `count`，超过 99 显示 99+。对应现有 `reference-count`、`selection-download-count`。
- `Status Dot`（`376:32535`，5 个变体）：8px 圆点，neutral（fg/tertiary）/ accent / success / warning / danger，必须配合文字使用。
- 审阅板 `Badge / Review`（`376:32538`）：模型服务列表（默认 / 视频 / 实验标签 + 状态点：已连接、需登录、连接失败、未配置）、全部 subtle 用法、带图标与 solid 示例、数量角标（下载所选 4、引用 2、任务 12、99+）。插件几何检查通过（行高统一 34，角标 16–28 宽）；本次未做截图复核（截图下载被代理拒绝）。初稿待用户确认。

### V1 第二批：21 Toast 初稿（2026-10-23）

- `V1-Components`（`332:28013`）新增 Section `21 Toast`（`371:32326`），组件集 `Toast`（`371:32325`）5 个变体：`tone=info|success|warning|error|loading`；属性 `title` / `description` / `showDescription` / `showAction`（默认关）/ `showClose`。
- 外观：`color/surface-raised` + 0.5px `color/border` + `V1/shadow-popover`，`radius/panel`，宽 340，内边距 12（右 8），间距 8；图标 16 用对应语义色（error 用 danger），loading 用 Spinner 实例；标题 `V1/headline`、说明 `V1/callout` + `fg/secondary`；操作为 Button secondary sm，关闭为 Icon Button ghost icon-xs + x。
- 行为约定（待确认）：窗口右下角距边 16，自下向上堆叠、间距 8，最多 3 条；info/success 约 5 秒自动消失，悬停或聚焦时暂停；error 与 loading 不自动消失；`role="status"`，error 用 `role="alert"`；业务队列与时机留在功能层（GenerationNotice、CanvasExport）。持续性提示用 Alert。
- 审阅板 `Toast / Review`（`372:32138`）：Light/Dark 各含 5 条单条示例和一个 560×300 窗口右下角堆叠示例；总览 Index 新增行 `372:33354`。
- 验证：插件几何检查通过（有说明 58px、单行 41–45px，无溢出）；`get_screenshot` 图片下载被网络代理拒绝，本次未做截图像素复核。

### V1 第二批：20 Alert 初稿（2026-10-23）

- 用户要求继续设计 Alert。新 Section `20 Alert`（`370:32085`），概览索引已追加。
- `Alert`（`370:32084`，4 个变体）：tone（info / success / warning / error，error 使用 danger 色）。底色为对应 *-subtle，16px 图标（info、check、circle-alert）为对应强调色，标题 headline + 说明 callout fg-secondary；可选公开操作按钮（secondary sm）与关闭按钮（ghost icon-xs）。radius/control，内边距 12 × 8，间距 8，默认宽 440、高度随内容。属性 `title` + `showTitle`、`description` + `showDescription`、`showAction`、`showClose`。
- 页面内持续提示，不自动消失；error / warning 用 role="alert"，其余 role="status"；临时反馈用 Toast。
- 评审样张 `Alert / Review`（`370:32517`）：content 底上的开发模式 / 连接成功（可关闭）/ 登录已过期（重新登录）/ 保存失败（重试 + 关闭），以及仅说明的聊天 401 错误（打开设置），截图检查两套主题通过；已修正高度被固定的问题。success 图标暂用 Lucide check（本地无 circle-check），待确认。

### V1 第二批：19 Collapsible 初稿（2026-10-23）

- 用户要求继续设计 Collapsible。新 Section `19 Collapsible`（`369:31918`），概览索引已追加。
- `Collapsible`（`369:31917`，8 个变体）：appearance（plain / card）× open（false / true）× state（default / hover）。plain：标题 callout fg-secondary（hover 为 fg + fill 底），内容缩进 20，用于聊天活动、设置高级选项；card：surface + 0.5px border、radius/panel，标题 headline，展开后内容区上方 separator、缩进 24，用于节点生成详情。chevron 12px，收起向右、展开向下；可选右侧摘要 meta（callout fg-tertiary）。属性 `title`、`meta` + `showMeta`；`Content slot` 在实例中替换。
- 评审样张 `Collapsible / Review`（`369:32350`）：生成详情卡片收起 / 展开（模型、参数、任务 ID、复制结果链接）、聊天活动“已编辑 2 个文件”（增删数分别为 success / danger）、模型服务“高级设置”收起悬停，截图检查两套主题通过；已修正变体高度被固定的问题。初稿待用户确认。

### V1 第二批：18 Tabs 初稿（2026-10-23）

- 用户要求继续设计 Tabs。新 Section `18 Tabs`（`367:31908`），概览索引已追加。
  - `Tabs Trigger`（`367:31760`，8 个变体）：appearance（segment / underline）× state（inactive / hover / active / disabled）。segment 高 24、内边距 12、radius/small，active 为 surface-raised + shadow-control；underline 高 32、内边距 8，inactive fg-secondary、hover fg、active fg + 2px accent 下划线。属性 `label`、`icon` + `iconSwap`（默认 file-text）、`closable`（12px 关闭图标，fg-tertiary）。
  - `Tabs List`（`367:31907`，2 个变体）：segment（fill 轨道 + 2px 内边距，radius/control）/ underline（底部 1px separator，间距 4）；4 个公开 Tab，`tab3` / `tab4` 控制数量。
- 对应 Radix Tabs，用于内容导航，与 ToggleGroup 偏好值单选区分；文档标签关闭是组合能力，代码中为独立按钮并有可访问名称。
- 评审样张 `Tabs / Review`（`367:32340`）：插件页 MCP / Skill（segment + 内容区）、underline 四种状态、写作右侧栏大纲 / 助手（图标）、写作文档标签（closable），截图检查两套主题通过；已将关闭图标调浅为 fg-tertiary。初稿待用户确认。

### V1 第二批：17 AlertDialog 初稿（2026-10-23）

- 用户要求继续设计 AlertDialog。新 Section `17 AlertDialog`（`363:31598`），概览索引已追加。
- `AlertDialog`（`363:31597`，2 个变体）：tone（default / destructive）。macOS 26 警告框风格：宽 280，surface-raised + 0.5px border + V1/shadow-dialog，radius/window，内边距 16 / 20，元素间距 12；顶部 40px 圆形图标（circle-alert，default 为 warning、destructive 为 danger 的 subtle 底）；标题 headline 居中、说明 callout 居中；可选公开 Checkbox“不再询问”；底部两个等宽公开 Button（取消 secondary + 确认 default / destructive）。属性 `title`、`message`、`showIcon`、`showCheckbox`。
- 用途：替代 9 处 window.confirm。默认焦点在取消，Esc 等于取消，点击遮罩不关闭；与 Dialog Overlay 搭配。
- 评审样张 `AlertDialog / Review`（`363:32030`）：窗口内遮罩 + 删除模型确认，以及放弃未保存更改、删除对话、重启并安装更新（带“不再询问”），截图检查两套主题通过；已修正变体高度固定为 200 的问题。初稿待用户确认。

### V1 第二批：16 Dialog 初稿（2026-10-23）

- 用户要求继续设计 Dialog。新 Section `16 Dialog`（`362:31496`），概览索引已追加。
- 新增语义变量 `color/scrim`（Light alpha/black-25 / Dark alpha/black-50，代码名 `--color-scrim`），代码实现时需补入 tokens.css。
- `Dialog`（`362:31494`，3 个变体）：size（sm 400 / default 560 / lg 800）。content 底 + 0.5px border + V1/shadow-dialog，radius/window；头部 title-3 标题、可选 callout 说明与 ghost icon-sm 关闭按钮（内边距 20 / 16 / 12）；`Content slot` 为虚线占位内容区（在实例中分离替换）；底部 separator 上边线，右对齐公开的 secondary / default Button，可选左侧说明。属性 `title`、`description` + `showDescription`、`showClose`、`showFooter`、`footerNote` + `showFooterNote`。
- `Dialog Overlay`（`362:31495`）：color/scrim 全窗遮罩。
- 评审样张 `Dialog / Review`（`362:31498`）：窗口模型中遮罩 + 居中“重命名项目”（Field + Input），sm“新建文件夹”与 lg“编辑视频节点”（媒体预览、左侧说明），截图检查两套主题通过；已修正分离后的示例高度不随内容的问题。初稿待用户确认。

### V1 第二批：15 DropdownMenu 初稿（2026-10-23）

- 用户要求继续设计 DropdownMenu。新 Section `15 DropdownMenu`（`360:31109`），概览索引已追加：
  - `DropdownMenu Item`（`360:30989`，6 个变体）：kind（default / destructive）× state（default / highlighted / disabled）。高 24（control-h/small），内边距 space/8，radius/small，文字 body；highlighted 为 accent 底 + 白字，destructive 文字 danger、高亮为 danger 底。属性 `label`、`checkable`（保留 14px 对勾列，使未勾选项对齐）+ `checked`、`icon` + `iconSwap`（默认 file-plus）、`shortcut` + `showShortcut`、`submenu`（右箭头）。
  - `DropdownMenu Separator`（`360:30990`，上下 4、左右 8 内缩的 1px separator）与 `DropdownMenu Label`（`360:30992`，subheadline 分组标题，属性 `text`）。
  - `DropdownMenu`（`360:30994`）：surface-raised + 0.5px border + V1/shadow-popover，radius/panel，内边距 4，宽 220；含可选 Label、6 个公开菜单项与 2 条分隔线（`showLabel`、`item5`、`item6`、`separator2`）。
- 评审样张 `DropdownMenu / Review`（`361:30926`）：写作文件夹菜单（图标、快捷键、未实现项禁用、高亮、危险项）、画布视图菜单（对勾列 + 子菜单）与危险项高亮，截图检查两套主题通过；已修正对勾列未保留导致错位、无图标项错位，以及对勾默认可见的问题。初稿待用户确认。

### V1 第二批：14 Popover · CandidateList 初稿（2026-10-23）

- PR #67、#68 已合并；用户要求开始设计下一批（方案第三步：浮层与反馈）。计划顺序：14 Popover + CandidateList、15 DropdownMenu、16 Dialog、17 AlertDialog、18 Tabs、19 Collapsible、20 Alert、21 Toast、22 Badge、23 Progress。设计分支已按合并后规则从最新 develop 重建。
- 新 Section `14 Popover · CandidateList`（`358:30799`）位于 13 Tooltip 下方，概览索引已追加该行：
  - `Popover`（组件 `358:30609`）：点击触发、无箭头；surface-raised + 0.5px border + V1/shadow-popover，radius/panel，内边距 12，宽 280。属性 `title` / `showTitle` / `body` / `showFooter`，底部为公开的 secondary / default sm Button。
  - `CandidateList Item`（`358:30729`，4 个变体）：media（icon 16 / thumbnail 28 带 separator 描边）× state（default / active）。active 为 accent 底 + 白字。属性 `title`、`description` + `showDescription`、`meta` + `showMeta`、`iconSwap`。
  - `CandidateList`（`358:30798`，2 个变体）：content（default / empty）。surface 浮层内边距 4，可选分组标题，3–5 项（`item4` / `item5`），每项为公开实例；`emptyText`。combobox + listbox 语义，自有实现。
- 评审样张 `Popover · CandidateList / Review`（`359:30654`）：两种 Popover、/ 技能选择浮在输入框上方、@ 素材引用缩略图列表与无匹配，截图检查两套主题通过；已将缩略图由 32 调为 28 并加描边。初稿待用户确认。

### UI V1 第二批实施（2026-10-24）

用户已授权第二批初稿进入 E–H 实现。阶段 E 完成 scrim 浅深语义变量和 Tailwind 映射、Radix 依赖、asChild secondary 禁用态修复；检查与构建通过，完整回归 89/89（3.1m）通过。Figma 只读，未修改节点。阶段 F 组件与浅深预览已实现，新增交互专项 8/8 通过，完整回归 94/94（3.3m）通过。组件来源及阶段证据统一记录在 [UI V1 实施与验收](ui-v1-implementation.md) 第二批章节。

阶段 G 已接入全部 9 处确认、插件/写作辅助 Tabs、聊天/生成详情 Collapsible、更新 ProgressField 与参考/下载 BadgeCount；完整回归 95/95（3.3m）通过。原生 details 保留挂载行为继续保留，具体取舍见实施报告。

阶段 H 最终检查、构建、完整回归 95/95（3.4m）及浮层复验 8/8（25.5s）通过，phase-h 36 张浅深截图已生成并检查。阶段 H 已接入写作两类菜单、技能/@ 候选、生成/导出 Toast 和指定持续错误 Alert；去掉候选淡入以保持即时输入反馈，统一第二批图标线宽。MediaEditor 保留现有 960×600 放大外壳与 CodeMirror 实例，ContextUsage 保留 hover + click 混合提示；理由与每处迁移结果见实施报告。Figma 未写入，设计来源如下。

| 家族 | 已读取的 Figma 来源 | 当前实现 |
| --- | --- | --- |
| 14 Popover / CandidateList | `358:30609` / `358:30729` | Popover 预览、CandidateList 页面接入 |
| 15 DropdownMenu | `360:30994` | 组件与写作菜单 |
| 16 Dialog | `362:31494` | sm/default/lg 组件与预览 |
| 17 AlertDialog | `363:31597`，评审 `363:32030` | 全部九处确认与 Provider |
| 18 Tabs | `367:31760` | 插件与写作辅助栏 |
| 19 Collapsible | `369:31917` | 聊天活动与生成详情 |
| 20 Alert | `370:32084` | 指定持续提示 |
| 21 Toast | `371:32325` | 生成提醒与导出反馈 |
| 22 Badge | `376:32522` / `376:32529` | 标签家族、参考与下载计数 |
| 23 Progress | `378:32536` / `378:32571` | 更新进度与预览 |

[组件源文件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=332-28013)。任务文件的明确数值优先于局部初稿差异，尤其 CandidateList 字号、内边距与说明透明度；没有改变视觉方向或主张已通过其他系统版本验收。

### 第一批组件 PR（2026-10-23）

- 用户要求创建 PR：[PR #67](https://github.com/qianyuzhao-ai/Jarvis/pull/67)，`feature/ui-v1-foundation`（`edbae7d`）→ `develop`，已由用户合并（develop `3c9ab2b`）。随后本设计分支合入 develop，`memory/design.md` 顶部冲突已手动合并，两边记录全部保留。

### 禁用态修复验收（2026-10-23）

- Codex 在 `feature/ui-v1-foundation` 提交 `edbae7d`：base.css 新增 27 行，secondary Button、default NativeSelect（含箭头）、outline Toggle 禁用为 surface-raised + 0.5px separator + fg-disabled，outline on 保留 fill；预览补充两个 outline Toggle 禁用示例与浅深精确断言，未删除断言；macOS 截图基准已更新。
- 复验（Linux + Xvfb）：`pnpm check`、`pnpm build` 通过；完整回归 84/89，失败为 3 项保存 API Key 的环境问题（develop 同样失败）及 2 项缺少 Linux 截图基准，新增禁用断言通过。裁切截图确认三类控件浅深禁用外观与 Figma 一致，禁用规则优先于 hover / pressed，loading 不受影响。
- 小问题：`asChild` 的 secondary Button（`data-disabled`）未纳入白底规则，仍为灰底，影响很小。合并注意：该分支与本设计分支都修改了 `memory/design.md` 顶部，合入 develop 时需手动合并两份记录。

### 验收差异的处理决定（2026-10-23）

- 用户确认：Button loading 保留代码版本（Spinner 居中、文字隐藏保留宽度）；推按钮类控件禁用改为白底，以 Figma 为准。
- Figma 已同步：`Button`（`336:27571`）删除 `loading` 布尔属性，新增 `state=loading` 20 个变体（共 100 个）：Spinner 绝对居中，Label 与图标透明度 0 保留占位；评审样张与 Spinner 样张中原 loading 实例（16 个）已切换为 state=loading；01 Button 分区随组件集变宽调整，截图检查通过。
- 代码修复交给 Codex（跟进 prompt）：Button secondary、NativeSelect default、Toggle outline 的禁用态改为 surface-raised + 0.5px separator 边框 + fg-disabled（outline on 保留 fill 底），需在 macOS 更新预览截图基准；完成后再验收。

### 第一批组件代码实现验收（2026-10-23）

- 用户将第一批组件改造交给 Codex，分支 `feature/ui-v1-foundation`（HEAD `483648c`，阶段 A `90cb20a` / B `2a51146` / C `2d2971b` / D `86cb31f`），实施记录在该分支 `memory/ui-v1-implementation.md`。
- 验收（Linux 容器 + Xvfb）：`pnpm check`、`pnpm build` 通过；完整实窗回归 86/89，失败的 agent、canvas-agent、model-library 3 项均涉及保存 API Key，在未改动的 develop 上同样失败（容器无系统钥匙串），判定为环境问题；Codex 在 macOS 报告 89/89。组件预览截图基准仅有 darwin 版本。
- 代码审查：tokens.css 数值与 Figma 完全一致；appearance 桥接只读并沿用主窗口 / 主 frame / URL 校验；无文件删除、无通用 IPC；测试 expect 927 → 978、用例 84 → 88，无删除行为断言；新增记忆已登记 AGENTS.md。
- 截图对比 develop：Chat、项目列表、画布、写作逐像素差异 ≤ 8/255（不可见）；设置各页按设计变化。预览页与 Figma 评审样张结构、尺寸、颜色一致。
- 待用户决定的差异：Button loading 为居中 Spinner 隐藏文字（保持宽度），Figma 为 Spinner + 文字；secondary 禁用为 fill 灰底，Figma 为白底 + 浅描边。其余：@fontsource/noto-sans-sc 依赖暂留；macOS 13/26 毛玻璃、强调色变化与 Windows 待实机验收。

### V1-Components 页面整理（2026-10-23）

- 用户要求整理 V1-Components 页（`332:28013`）。整理前无游离节点，只有 Foundations、15 个组件集与 13 个评审样张分散在两列。
- 现在自上而下为：概览框 `V1 Components / 概览`（`353:30429`，说明 + 分区 / 组件集 / 变体数 / 状态索引，均标“初稿 · 待确认”），以及 14 个 Section：`00 Foundations`（`353:30508`）、`01 Button`（`353:30510`）、`02 Icon Button`（`353:30512`）、`03 Input`（`353:30514`）、`04 Field`（`353:30516`）、`05 InputGroup`（`353:30518`）、`06 Textarea`（`353:30520`）、`07 NativeSelect`（`353:30522`）、`08 Checkbox`（`353:30524`）、`09 Toggle`（`353:30526`）、`10 ToggleGroup`（`353:30528`，含 ToggleGroup 与 ToggleGroup Item 两个组件集）、`11 Spinner`（`353:30530`）、`12 Separator`（`353:30532`）、`13 Tooltip`（`353:30534`）。
- 每个 Section 内：顶部一行用途说明，左侧组件集，右侧 Light / Dark 评审样张；宽组件集（Input、Field、InputGroup、Textarea、NativeSelect）改为组件集在上、样张在下。仅移动位置，组件、实例与 ID 不变，截图检查通过。

### V1 Tooltip 组件初稿（2026-10-23，第一批基础组件设计完成）

- 用户要求继续设计 Tooltip。组件集 `Tooltip`（`351:30351`）位于 V1-Components 页 Separator 下方，2 个变体：lines（single 自适应宽度 / multi 最大宽 240 换行）。属性：`label`、`shortcut` + `showShortcut`（fg/secondary）。
- macOS 风格无箭头小浮层：surface-raised + 0.5px border + V1/shadow-popover，文字 V1/subheadline（11），内边距 space/8 × space/4，圆角 radius/small。side（top / right / bottom / left）、6px 间距与碰撞翻转由 Radix 定位，不做方向变体；悬停约 500ms 或键盘聚焦显示，Esc 关闭；替代原生 title，点击切换的信息浮层归 Popover。
- 评审样张 `Tooltip / Review`（`351:30352`）展示四个方向、快捷键、多行换行与键盘聚焦触发，截图检查两套主题通过；已修正多行示例沿用共享默认文字的问题。
- 至此方案第二步的 12 个基础组件家族（Button / Icon Button、Input、Field、InputGroup、Textarea、NativeSelect、Checkbox、Toggle、ToggleGroup、Spinner、Separator、Tooltip）均已在 Figma 完成初稿，均待用户确认；尚未实现代码。

### V1 Separator 组件初稿（2026-10-23）

- 用户要求继续设计 Separator。组件集 `Separator`（`350:30303`）位于 V1-Components 页 Spinner 下方，2 个变体：orientation（horizontal 默认 240×1，布局中填充宽度 / vertical 默认 1×16，可拉伸）。填充绑定 color/separator，对应 Radix Separator；拖动分隔条另归 Resizable。
- 评审样张 `Separator / Review`（`350:30304`）展示内缩 16 的列表分组、工具栏竖向分组（ghost Icon Button 之间）与设置分区全宽分隔，截图检查两套主题通过。初稿待用户确认。

### V1 Spinner 组件初稿（2026-10-23）

- 用户要求继续设计 Spinner。组件集 `Spinner`（`348:29919`）位于 V1-Components 页 ToggleGroup 下方，6 个变体：size（sm 12 / default 16 / lg 24）× tone（default = fg/secondary / onAccent = fg/on-accent）。采用 macOS 12 辐条活动指示器（圆角辐条，透明度 1 → 0.18 递减），Figma 为静态帧，代码中旋转；减少动态效果时改为缓慢淡入淡出。仅用于未知时长，确定进度用 Progress。
- 将 `Button` 全部 80 个变体的 loading 图层由 Lucide loader-circle 替换为 Spinner：xs / sm 用 sm，default / lg 用 default；default、destructive（非 disabled）用 onAccent，其余用 default；保留 `loading` 属性绑定。Button 评审样张自动更新。
- 评审样张 `Spinner / Review`（`349:29841`）展示三档尺寸、强调色上的 onAccent、四种按钮 loading、行内“正在获取模型列表…”与画布生成中占位，截图检查两套主题通过。初稿待用户确认。

### V1 ToggleGroup 组件初稿（2026-10-23）

- 用户要求继续设计 ToggleGroup。新增两个组件集，位于 V1-Components 页 Toggle 下方：
  - `ToggleGroup Item`（`347:29672`，12 个变体）：selected（off / on）× size（sm 高 20 / default 高 24，绑定 control-h/mini·small）× state（default / hover / disabled）。on 为 surface-raised + shadow-control 的凸起项，off 为透明 + fg/secondary，hover 显 fill。属性 `label`、`icon` + `iconSwap`（默认 contrast）、`showLabel`、`focusVisible`。
  - `ToggleGroup`（`347:29793`，4 个变体）：appearance（segmented = fill 轨道 + 2px 内边距的 macOS 分段控件 / default = 一组无边框 Toggle，间距 space/4）× size（sm / default）。内含 4 个公开嵌套项 `Item 1–4`，`item3`（默认开）/ `item4`（默认关）控制项数 2–4。
- 对应 Radix ToggleGroup type="single"，用于偏好值单选，不是内容导航 Tab。
- 评审样张 `ToggleGroup / Review`（`347:30224`）展示两档尺寸、hover / disabled / 焦点、四项、仅图标分段（列表 / 网格）、default 外观，以及 Field 水平行“外观：跟随系统 / Light / Dark”示例，截图检查两套主题通过。初稿待用户确认。

### V1 Toggle 组件初稿（2026-10-23）

- 用户要求继续设计 Toggle。组件集 `Toggle`（`346:29444`）位于 V1-Components 页 Checkbox 下方，24 个变体：appearance（default 无边框工具栏 / outline 推按钮）× pressed（off / on）× size（sm / default，高 24 / 28）× state（default / hover / disabled）。属性：`icon` + `iconSwap`（默认 magnet）、`label` + `showLabel`、`focusVisible`。
- off：default 为透明 + fg/secondary，hover 显 fill；outline 为 surface-raised + 0.5px border + shadow-control。on：selection/default 底 + accent 文字与图标，outline 加 1px accent 描边；disabled 灰化。内边距 space/8、间距 space/4，仅图标时约 32×28。对应 Radix Toggle，与 Button 的瞬时按下区分。
- 评审样张 `Toggle / Review`（`346:29445`）展示 2×2 外观/按下 × 状态与焦点、仅图标 / 仅文字 / sm，以及画布右下角开关（缩略图 / 点阵 / 吸附）和 Agent“包含所选资产”示例，截图检查两套主题通过。初稿待用户确认。

### V1 Checkbox 组件初稿（2026-10-23）

- 用户要求继续设计 Checkbox。组件集 `Checkbox`（`345:29177`）位于 V1-Components 页 NativeSelect 下方，12 个变体：checked（false / true / mixed）× state（default / pressed / focus / disabled；macOS 复选框无 hover 高亮）。属性：`label`、`showLabel`、`description`、`showDescription`。
- 14px 方框（radius/small）置于 16px 槽内与 V1/body 首行对齐，间距 6；未选为 surface-raised + 1px border + shadow-control，选中/部分选中为 accent 底 + 白色对勾（Lucide check）/ 横线；pressed 用 fill/hover 叠加或 accent/pressed；disabled 灰化；focus 为方框外 3px focus-ring。对应 Radix Checkbox。
- 评审样张 `Checkbox / Review`（`345:29178`）展示 3×4 矩阵、带标签与说明、禁用，以及技能启停列表（mixed 表示部分启用）示例，截图检查两套主题通过；已将未选边框从 0.5px 加粗为 1px，修正白底上不可见的问题。初稿待用户确认。

### V1 NativeSelect 组件初稿（2026-10-23）

- 用户要求继续设计 NativeSelect。组件集 `NativeSelect`（`344:29267`）位于 V1-Components 页 Textarea 下方，22 个变体：appearance=default（macOS 弹出按钮：surface-raised + 0.5px border + V1/shadow-control + chevrons-up-down）× size（sm / default / lg）× state（placeholder / filled / hover / focus / disabled / invalid）18 个；appearance=compact（无边框，hover 显 fill，callout 字号 + chevron-down 12，高 24）× filled / hover / focus / disabled 4 个。
- 属性：`placeholder`、`value`、`leadingIcon` + `leadingIconSwap`（默认 cpu）。default 宽 200 可填充，compact 宽度随内容。展开后使用系统原生菜单，不在 Figma 中设计；不同于 Popover / 候选列表。
- 评审样张 `NativeSelect / Review`（`344:29698`）展示六种状态、三档尺寸、compact 四种状态，以及画布参数栏、首页模型选择（brain 图标）和 Field 水平行“协议”示例，截图检查两套主题通过。初稿待用户确认。

### V1 Textarea 组件初稿（2026-10-23）

- 用户要求继续设计 Textarea。组件集 `Textarea`（`343:28775`）位于 V1-Components 页 InputGroup 下方，14 个变体：behavior（fixed 固定高度 96 + 右下角调整手柄 / auto 随内容增高）× state（同 Input 7 种）。属性：`placeholder`、`value`、`showCount` + `countText`（右下字数，footnote）。
- 文字 V1/body-relaxed（13/20），内边距 space/8 × space/4（单行高度与 control-h/regular 一致），圆角 radius/control，状态配色与 Input 一致，focus / invalid 为 3px 外圈。默认宽 320。
- 评审样张 `Textarea / Review`（`343:28776`）展示 fixed 七种状态、auto 一行 / 多行 / 带字数，以及 Field 内替换控件为 Textarea 的“允许的统一登录域名”示例，截图检查两套主题通过。ChatComposer、PromptEditor、MarkdownEditor 不使用本组件替换。初稿待用户确认。

### V1 InputGroup 组件初稿（2026-10-23）

- 用户要求继续设计 InputGroup。组件集 `InputGroup`（`342:28595`）位于 V1-Components 页 Field 下方，21 个变体：size（sm / default / lg）× state（同 Input 7 种）。外壳样式、尺寸与 Input 一致，左内边距同 Input、右内边距 space/4，元素间距 space/4。
- 插槽属性：`startIcon` + `startIconSwap`（默认 Lucide search，fg/tertiary）；`suffix` + `suffixText`（单位等后缀，fg/secondary，外包 space/4 右边距）；`endButton`（公开的 ghost `Icon Button` 实例，默认 x 清除，sm/default 用 icon-xs、lg 用 icon-sm，可在面板换成 eye 显示密码）。另有 `placeholder`、`value`。
- 评审样张 `InputGroup / Review`（`342:28596`）展示 7 种状态、三档尺寸以及搜索 + 清除、API Key 显隐、时长单位后缀、仅前置图标四种组合，截图检查两套主题通过；已修正后缀颜色过浅和贴边问题。初稿待用户确认。

### V1 Field 组件初稿（2026-10-23）

- 用户要求继续设计 Field。组件集 `Field`（`341:28088`）位于 V1-Components 页，6 个变体：orientation（vertical / horizontal）× state（default / invalid / disabled）。属性：`label`、`description`、`showDescription`、`error`。
- vertical：标签 V1/body 在上，控件与说明全宽，间距 space/8，默认宽 320。horizontal：设置页行，标签列 120 宽、右对齐并按 control-h/regular 垂直居中，控件列填充，列间距 space/16，默认宽 480。
- 内含公开的嵌套实例 `Control`（默认 Input default/filled，invalid 用 Input invalid，disabled 用 Input disabled），可在右侧面板直接改 value / placeholder / state，或替换为其他控件。invalid 时以带 circle-alert 图标的 danger 错误信息替换说明；disabled 时标签与说明为 fg/disabled。
- 评审样张 `Field / Review`（`341:28089`）展示两种布局三种状态及模型服务设置示例（名称、错误接口地址、只读 API Key、空模型 ID），截图检查两套主题通过；已修正 horizontal 标签偏上约 2px。初稿待用户确认。

### V1 Input 组件初稿（2026-10-23）

- 用户要求继续设计 Input。组件集 `Input`（`340:28051`）位于 V1-Components 页，25 个变体：appearance=default × size（sm / default / lg，高度共用 control-h/small·regular·large）× state（empty / filled / hover / focus / disabled / readOnly / invalid）共 21 个；appearance=ghost（内联重命名）仅 default 尺寸 × filled / hover / focus / disabled 4 个。属性：`placeholder`、`value`（TEXT）。
- 样式：surface 底 + 1px border；hover 描边 fg/tertiary；focus 为 accent 描边 + 3px focus-ring 外圈 + 光标；disabled 为 fill 底 + fg/disabled；readOnly 为 fill 底但文字 fg/default（可聚焦复制）；invalid 为 danger 描边 + danger/subtle 外圈。内边距 space/8·12，圆角 radius/small（sm）或 radius/control，文字超长省略。默认宽 240，可在布局中填充。图标、密码显隐与后缀操作留给 InputGroup。
- 评审样张 `Input / Review`（`340:28052`）展示两套主题下 7 种状态、三档尺寸、ghost 状态与设置表单示例，截图检查通过。初稿待用户确认。

### V1 按钮新增圆形与胶囊形状（2026-10-23）

- 用户询问 macOS 26/27 的圆形按钮，确认采用方案 1：只为常用组合增加形状，而不是全部组合翻倍。参考依据为 macOS 26 Liquid Glass 控件形状；macOS 27 的变化未核实。玻璃材质 Electron 无法复现，圆形/胶囊按钮沿用现有填充与 V1/shadow-control。
- `Icon Button`（`337:27595`）新增变体属性 `shape`：square（原有 64 个）/ circle（ghost、secondary × icon、icon-lg × 4 状态，16 个），共 80 个。`Button`（`336:27571`）新增 `shape`：rounded（原有 64 个）/ capsule（ghost、secondary × default、lg × 4 状态，16 个，内边距加大为 space/16、space/20），共 80 个。新形状圆角绑定 radius/full。
- 复制变体会丢失组件属性引用，已为 32 个新变体重新绑定 label / 图标 / loading / focusVisible；评审样张已移位，避免与变大的组件集重叠，并新增胶囊、圆形及浮动工具栏示例行，截图检查两套主题通过。
- 修复旧组件页 24 个 `Lucide / *` 图标内层 Frame 约束（MIN → SCALE），缩放时不再溢出；原尺寸外观不变。主色（default）与 destructive 暂无圆形/胶囊，如需圆形发送按钮等再补。

### V1 Icon Button 组件初稿（2026-10-23）

- 用户要求继续设计纯图标按钮。组件集 `Icon Button`（`337:27595`）位于 V1-Components 页，64 个变体：variant（同 Button 四种）× size（icon-xs / icon-sm / icon / icon-lg，方形 20/24/28/32，宽高绑定 control-h/*）× state（default / hover / pressed / disabled）。属性：`icon`（INSTANCE_SWAP，默认 Lucide ellipsis `26:411`）、`focusVisible`。图标 12 / icon/14 / icon/16 / icon/18。
- ghost 默认图标色 fg/secondary，hover/pressed 转为 fg/default，符合 macOS 工具栏；destructive 使用 danger/hover·pressed。对应代码 `<Button size="icon-*">`，描述中注明代码必须提供 aria-label 并配 Tooltip。暂不含 loading（布尔属性无法同时隐藏图标并显示 Spinner）。
- 评审样张 `Icon Button / Review`（`337:27596`）展示两套主题的状态、焦点环、四档尺寸及工具栏示例，截图检查通过。
- 修复旧组件页 `Lucide / trash`（`94:1654`）内层 Frame（`94:1655`）约束由 MIN 改为 SCALE，使其缩放到 16px 时不再溢出；24px 原尺寸外观不变。

### V1 Button 组件初稿（2026-10-23）

- 用户要求开始设计 Button。组件集 `Button`（`336:27571`）位于 V1-Components 页，64 个变体：variant（default / secondary / ghost / destructive）× size（xs / sm / default / lg，对应 macOS mini / small / regular / large）× state（default / hover / pressed / disabled）。属性与代码 props 同名：`label`、`leadingIcon` + `leadingIconSwap`（默认 Lucide plus `26:334`）、`trailingIcon` + `trailingIconSwap`（默认 chevron-down `26:420`）、`loading`（loader-circle `107:3883`）、`focusVisible`（3px focus-ring 外圈）。
- 样式全部绑定 V1 变量：高度 control-h/*，内边距 space/8·12·16，圆角 radius/small（xs/sm）或 radius/control，字体 V1/subheadline·callout·body；secondary 为推按钮（surface-raised + 0.5px border + V1/shadow-control，hover/pressed 叠加 fill）。新增 `color/danger/hover`、`color/danger/pressed`（`VariableID:336:28759/28760`）修正深色下危险按钮按压态变亮的问题。
- 评审样张 `Button / Review`（`336:27572`）展示两套主题下各 variant 的状态、focusVisible、loading、四档尺寸、图标与长文本；截图检查通过。
- 已知限制：替换图标后，新图标的描边颜色需重新设置（覆盖按图层名保留）；变体矩阵 64 个超过常规 30 的建议值，用户确认前保持单组件集。图标按钮（纯图标尺寸）尚未设计。初稿待用户确认。

### V1 基础变量与文字样式（第零步设计侧，2026-10-23）

- 用户提供 V1 页面 `V1-视觉换新`（`319:27345`）与组件页 `V1-Components`（`332:28013`），要求先做设计稿、按方案开始第一步。两页此前为空。
- 新建变量集合 `V1 / Primitives`（`VariableCollectionId:334:26739`，单模式 Value，75 个）：neutral/alpha/glass 与 macOS 系统色（blue/red/green/orange 的 light/dark 及 subtle）颜色原始值隐藏于选择器（alpha/black-* 仅 EFFECT_COLOR）；另含 space/4–64、radius/small·control·panel·window·full、control-h/mini·small·regular·large（20/24/28/32）、icon/14·16·18·24。
- 新建 `V1 / Semantic`（`VariableCollectionId:334:26740`，Light `334:1` / Dark `334:2`，30 个颜色别名）：window、sidebar、content、surface、surface-raised、fg/*、fill/*、border、separator、focus-ring、selection/*、accent/*、success/warning/danger/info（default/subtle）、shadow。均设定作用域与 WEB 代码名（如 `color/fg/default` → `var(--color-fg)`）。
- 新建 10 个 SF Pro 文字样式 `V1/large-title` … `V1/footnote`（含中文多行 `V1/body-relaxed` 13/20），3 个阴影样式 `V1/shadow-control|popover|dialog`，阴影颜色绑定 `color/shadow`。Figma 中无 PingFang SC，中文为 Figma 回退字体显示。
- 规范样张 `V1 / Foundations`（`334:27289`，Light `334:27290` / Dark `334:27425`）位于 V1-Components 页，截图检查两套主题均正常，已修正阴影裁切。
- 全部数值为基于 macOS 系统色的初稿，待用户在 Figma 中调整确认；V0 变量集合 `Jarvis / 首页` 与旧样式保持不变。未修改应用代码。

### 视觉换新方案 v0.2：方向已确认（2026-10-23）

- 方案文档：[视觉换新-组件库设计系统](https://docs.google.com/document/d/1Z2vZyoCYf3dsKiBwbDrzSDeXsLjj6bJWfk6BwnTLd2M/edit)，已由 v0.1 更新为 v0.2；具体变量规范、macOS 映射与迁移顺序以文档为准。
- 用户已确认：所有页面重新设计；先在 Figma 设计并确认，再改代码；保持仿 macOS 风格，由用户在 Figma 中逐步设计；从最小组件开始，同时规范 Tailwind CSS 原子化变量。
- 用户已确认：使用系统字体；跟随 macOS 系统强调色；侧栏使用原生毛玻璃；Windows 沿用同一设计、不单独优化；交互底座为 Radix UI；现在建立 `packages/ui`（`@jarvis/ui`，private workspace 包）。
- 当前方案要点（未实现）：Figma 变量重组为 Primitives / Semantic 两个集合并与代码变量同名；旧 CSS 先放入 `@layer legacy`，主题属性移到 `<html>`；Button 收敛为 default / secondary / ghost / destructive 四种；测试定位先从 class 改为 role、label 或 data-testid。
- 待定：变量具体数值和密度在 Figma 中定稿；macOS 13 / 26 毛玻璃观感、Electron 44 系统强调色变化通知需实测。本条只记录方向，未修改 Figma 或应用代码，也不代表授权实现、提交或发布。

## UI V1 推按钮禁用态对齐（2026-10-23）

- 用户确认 secondary Button、default NativeSelect、outline Toggle off 禁用保留 surface-raised 底、separator 细边框且无阴影；outline Toggle on 禁用保留 fill 底并补边框。代码按此修复，保留其他控件禁用外观。
- 用户跟进文档确认 Figma 已同步 `state=loading`，居中 Spinner、隐藏文字但保持宽度的现有实现继续保留。本轮没有写入 Figma。
- 检查、构建及完整实窗回归 89/89（3.1m）通过。浅深精确断言、macOS 截图基准、设置页截图与原基准差异说明见 [UI V1 实施报告](ui-v1-implementation.md) 的跟进修复节。


## UI V1 阶段 D 设置试装（2026-10-23）

通用、模型、内网、下载、插件/技能控件迁到 @jarvis/ui；保留保存/取消/校验/Key/登录边界。清理过时设置 CSS，混合文件旧颜色原值保留为兼容变量。设置浅深与窄窗截图、组件集成补充及最终门禁见 [UI V1 验收报告](ui-v1-implementation.md)。ModelPicker 无设置调用点，聊天选择器保持原实现。


## UI V1 阶段 C 基础控件（2026-10-23）

实现 12 个组件家族、开发专用预览页和浅深 screenshot 基准；Figma 各评审节点、API、视觉差异与验证证据见 [UI V1 实施记录](ui-v1-implementation.md)。本轮按用户实施文档实现初稿，未改 Figma。


## UI V1 阶段 B 原生外观（2026-10-23）

接入只读系统强调色 bridge、macOS sidebar vibrancy 与 html 窗口焦点状态；Windows / 降低透明度使用不透明侧栏。当前主机 macOS 27.0.1，13/26 与 Windows 材质及真实系统设置切换仍待实机验收。API 来源与回归结果见 [UI V1 实施记录](ui-v1-implementation.md)。


## UI V1 阶段 A 基建（2026-10-23）

按用户新实施文档建立 packages/ui 与固定浅深变量，旧样式隔离但外观不变；主题属性提升到 html。16 张改造前后截图逐像素一致。Figma 只读核对，未写入设计文件。详细来源、节点和验收见 [UI V1 实施记录](ui-v1-implementation.md)。

### 内网地址由用户手动填写（2026-10-22）

- 已随 0.2.4 源码经 PR #59/#60 集成并打标签；完整回归 84/84 通过。Windows 打包验证成功，macOS 两次因 runner 容量不足未启动，尚无 0.2.4 Release。

- 用户要求真实服务地址只在设置中填写，不写入代码；清理验证后已确认恢复 0.2.4 发布。生成任务、上传、平台登录及允许域名均无真实地址默认值；占位提示只说明需填写的内容。
- 移除读取、保存和任务提交时的地址自动替换；已保存配置原样保留。生成地址为空时禁止提交；填写登录配置但缺少任务地址时在对应输入框提示。
- 保持现有设置布局和登录域名多行输入，不修改 Figma。pnpm check、build 与相关回归 14/14 通过；覆盖首次空白、空地址保存重载、手动地址持久化、旧地址保留、登录配置缺少任务地址的提示及不发送请求。

### 生成平台统一登录入口（2026-10-22）

- 登录入口已随 [v0.2.3](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.3) 发布；双平台实际打包启动通过，真实公司统一登录与生成服务仍由用户在内网设备验收。
- 用户确认在设置提供“登录生成平台”，具体平台入口和统一登录域名由用户填写。保留既有内网设置的 700px 居中布局，新增“平台登录地址”“允许的统一登录域名”；域名列表多行输入，按明确域名匹配，不提供 Cookie/密码输入或回显。
- “平台登录”一行提供登录生成平台、验证连接、退出登录；未保存时显示先保存提示并禁用操作。完成网页登录后关闭独立窗口，自动进行只读连接验证；状态区区分未登录、已有会话未验证、验证通过、过期/权限不足与网络失败。
- 未允许的跳转会提示缺少的域名，可回设置补充，不回显登录票据。登录窗口和允许的子窗口保留沙箱、隔离且无 Jarvis preload；关闭主窗口时一并关闭。
- 登录过期后节点保留任务，详情显示等待重新登录，并显示一次全局提醒；重新登录验证后续查，不自动重新提交生成。保持现有 5 秒轮询、Prompt 标签与素材上传协议。
- pnpm check / build / diff 检查通过，完整回归 **82/82**、最终登录/鉴权相关复测 **5/5** 通过。浅深与 900×640 紧凑设置截图已查看，域名文本框与原输入框一致，无横向溢出、长页面可滚动。已检查截图位于 `apps/desktop/test-results/53bf4a36-4e66-4659-99ca-fb1218dfaea5/generation-login-SSO-login-65227-esumes-without-resubmitting/`，文件为 `platform-login-light.png` / `platform-login-dark.png` / `platform-login-compact.png`。真实内网由用户联调。未修改 Figma，既有节点 ID 不变，本轮新增登录配置尚未同步 Figma。

### AIGC 任务接口与完成提醒（2026-10-22）

- 此组界面已随 [v0.2.2](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.2) 发布，双平台构建及实际打包启动通过；真实内网由用户在其他设备联调。Figma 同步边界不变。
- 用户确认全模型迁移新平台任务接口，轮询为 5 秒；模型参数、上传与 Prompt 引用不变。额度不在项目里常驻展示，只在生成结束后查询并轻提示；真实内网由用户测试。
- 内网设置原“aigc 地址”改为“生成任务地址”。2026-10-22 用户要求取消预设与自动迁移：新工作台服务地址留空，由用户手动填写，读取时保留原有配置；上传地址及 req_from 不变。
- 沿用原生成信息折叠区，增加平台任务 ID，pending 显示“任务已提交，正在排队…”。成功结果仍先显示于节点；quota 查询不会把成功改成失败。
- 新增全局右下角完成提醒，显示项目/节点、生成成功或失败和本次额度说明；并发完成按队列展示，支持明确的关闭按钮和按文字长度自动消失。浅深色沿用当前主题 token、系统字体与 Lucide，额度不加入节点常驻字段。
- 检查、构建和完整回归 **79/79** 通过，最终相关复测 **8/8** 通过。浅色与深色视频完成提醒截图已查看，文字可读、关闭操作可用；最终截图在 `apps/desktop/test-results/c1a87f25-f4cc-40ad-8a6c-7a016d05d2e8/generation-Electron-upload-fac85--video-and-restores-results/`（`generation-notice-image.png` / `generation-notice-video.png`）。设置回归验证旧地址迁移且 req_from/上传地址保留。未修改 Figma，既有节点 ID 保持不变，本轮界面变化尚未同步 Figma。

### 应用内自动更新（2026-10-22）

- 用户于 2026-10-22 反馈 Windows 实机“发现新版本 → 点击更新 → 重启安装”流程可用，已验证通过。macOS 实机自动升级仍待验收，本次无界面或 Figma 变更。
- 最终代码检查/构建及完整 Electron 回归 **70/70（1.8m）** 通过，包含原生确认取消后的焦点恢复、真实 HTTP 下载坏哈希拦截、写作保存后交接和交接失败恢复窗口。浅色进度、900×640 深色完成页已检查，设置页不重复显示顶部提醒；截图位于 `apps/desktop/test-results/de12538f-b51d-472e-b664-f76c87b1000f/updates-automatic-and-manu-3f630-ation-work-in-a-real-window/`。

- 用户要求自动/手动检查、下载进度、确认后重启安装，并确认包含预发布版本。通用设置新增“应用更新”面板，展示当前版本、通道、检查结果/时间、下载进度（百分比/大小/速度）、错误重试及重启按钮；启动后及每 4 小时自动检查。
- 通用设置仅显示完整面板，其他页面提供全局更新提醒，切换首页、项目、画布和写作不丢进度。沿用现有浅深色 token、按钮和继承字体；进度条使用应用强调色与等宽数字，无新增动画，按钮最小高度 44px。macOS 顶部提醒避开原生窗口按钮，主工作区在提醒下方保持可用高度。
- 下载完成不自动安装；“重启并安装”调用 Electron 原生确认框，默认稍后。取消后焦点返回原区域的新安装按钮；确认准备阶段界面 inert，保存失败、冲突、任务仍在运行时恢复可操作状态并显示具体原因。安装器交接失败会恢复窗口及重试入口。
- 实现位于独立 feature/in-app-updates worktree，未混入原 feature/ui-style 未提交的主题/系统字体调整；未修改 Figma 或既有节点 ID。本节新增界面暂未同步 Figma，不能描述为已同步设计。浅深色/紧凑窗口截图与最终回归见工程记录。
### 我的模型列表与 DeepSeek 官方接入（2026-10-22，已被 2026-10-24 模型配置改造取代，仅作历史）

- 用户随后授权本地提交本轮模型列表、DeepSeek 官方接入、聊天模型切换及相关测试和项目记忆，不推送或合并。
- 用户要求模型服务加入 DeepSeek 官方，随后明确应为“我的模型”列表：同时保存官方和自定义中转站的多个模型，并在 Chat 中切换。该要求替代此前单活动中转站方案；本轮没有扩展通用工具、MCP 执行或全量音视频理解。
- 模型服务默认展示 `ModelSettings.tsx` 的“我的模型”，支持添加、编辑、删除和设为默认；每条记录保存模型名称、实际模型 ID、来源、连接参数及独立加密 Key。新增/编辑复用限宽居中的表单；取消及未保存切换保持原有确认逻辑。
- 添加来源为“自定义中转站”或“DeepSeek 官方”。官方固定 `https://api.deepseek.com` + Chat Completions，提供当前 Pi SDK 内置的 `deepseek-flash` / `deepseek-v4-pro`；Flash 支持图片，Pro 仅文字，相关限制在发送/切换边界明确反馈。默认关闭思考，不新增思考控制或官方网页搜索工具。
- 首页与画布 Composer 改为从已保存模型列表选择，展示名称/模型/来源。选择时切换绑定的模型记录和连接/Key，同一会话保留历史；默认模型作用于新会话。已删除模型不会自动借用默认模型的 Key，旧会话可重新选择；无模型记录绑定的旧会话显示原模型名称，避免误标为当前默认模型。
- 旧单连接配置自动迁入列表，Key 不回显、不开启环境或个人配置扫描；详见 `memory/engineering.md` 的本轮数据格式与 IPC 说明。设置内容继续最大 700px 居中。未修改 Figma，既有设计节点未变。
- 验证：检查/构建/diff 通过；最终模型列表、原生 DeepSeek 协议、中转运行时、Chat 与 Skills 相关回归 8/8 通过（17.1s），覆盖配置迁移、独立 Key、同一聊天三模型切换、请求地址/鉴权/历史、默认/编辑/删除/重启、旧会话显示与 Pro 图片输入阻止。模型列表、官方表单与跨模型聊天截图已检查。
- 整组回归 60/61（1.7m），剩余为已有侧栏动画退出中间帧固定取样偶发得到 0；该用例和两项鼠标连线在独立复测中均通过，未修改其实现或放宽断言。技能用例的选项定位已限定到技能菜单，避免计入新增原生模型选择框的 option。真实 DeepSeek Key/API 未联调；本轮未提交或推送。

### 插件添加按钮右对齐（2026-10-22）

- 用户随后授权本地提交插件入口合并、MCP / Skill 切换器和右侧添加按钮这组改动，不推送或合并。
- 用户指定将 MCP / Skill 添加按钮移到切换器同一行最右侧，名称分别为“添加mcp”“添加 skill”。已增加共享工具栏，按当前 Tab 只显示对应按钮；移除技能内容区的旧“导入技能包”按钮与文件夹说明行，目录选择说明保留为按钮悬停文字。
- “添加 skill”继续复用原技能导入、处理中禁用和错误反馈逻辑，按钮显示在顶部操作区；Skill 内容在切换时保持挂载。MCP 仍未集成，添加mcp 按钮禁用并提示“暂未接入”，没有新增虚假配置流程。
- 验证：检查、构建、diff 与真实 Electron Skills 综合回归 1/1 通过（4.1s）；包含按钮右边缘与工具栏对齐、两个 Tab 的按钮名称/状态、实际技能导入和启停、重启恢复及首页/画布调用。浅色 MCP 和深色 Skill 截图已查看。未修改 Figma，尚未提交或推送。

### MCP 与 Skill 合并为插件（2026-10-21）

- 用户要求设置里的 MCP 与 Skill 合并，入口名为“插件”。侧栏移除独立 MCP 连接占位和 Skill 项，统一为 Puzzle 图标的“插件”；对应设置分类、选中态及工具栏标题同步改为 plugins / 插件。
- 新增 `PluginSettings.tsx`，沿用 700px 限宽居中。用户随后要求插件内增加 MCP / Skill 切换器，现为两个独立 Tab 页面，默认打开 Skill；切换时保留技能管理组件状态。支持鼠标及左右方向键、Home/End 键切换，使用关联的 tablist/tab/tabpanel 与焦点状态。MCP 当前没有集成实现，页面明确显示“暂未接入”；现有技能导入、启停、快照与单入口规则保持，不新增其他管理入口。
- 验证：检查、构建、diff 和真实 Electron Skills 综合回归 1/1 通过（4.0s），覆盖插件入口及旧入口消失、MCP 当前状态、技能导入/启停/持久化与首页/画布调用。深色插件页截图已检查。未修改 Figma，尚未提交或推送。
- 切换器追加验证：检查、构建和真实 Electron 综合回归 1/1 通过（4.0s），覆盖默认 Skill、点击 MCP 隐藏技能控件、方向键/Home/End 切换与焦点、切回后继续技能导入启停及首页/画布调用。浅色 MCP 和深色 Skill 页面截图已检查，仍未提交或推送。

### 设置激活 Skill 管理入口（2026-10-21）

- 用户指出已有技能管理界面但尚未接入设置，要求启用设置里的 Skill。根因为侧栏仍是 disabled 占位、设置分类没有 skills 路由；已有管理仅从聊天 Composer 弹窗进入。
- 侧栏 Skill 改为可点击并带当前页选中态；App 增加 skills 设置分类与工具栏标题，继续沿用未保存配置的切换确认。用户后续明确技能管理只允许设置这一个入口：现有导入、启停、空状态、提示与错误逻辑归入 `SkillsSettings.tsx`，设置内为 700px 限宽居中页面；移除首页/画布 Composer 的书本管理按钮、斜杠菜单的管理按钮、弹窗状态和相关样式。原 `SkillsDialog.tsx` 已更名为设置组件，不保留 dialog 展示分支。无需模型连接即可管理技能，全局回复期间仍禁止改动。
- 验证：检查、构建及真实 Electron Skills 综合回归 1/1 通过（4.4s）。覆盖设置入口启用/选中、非弹窗页面、设置导入与启停、聊天弹窗改动同步到设置、重启状态恢复，以及首页/画布主动和自动调用。深色设置截图已检查。仅复用 Jarvis 独立技能管理，没有扫描个人目录或扩展脚本执行能力；未修改 Figma，尚未提交或推送。
- 单入口收敛后验证：检查、构建、diff 与真实 Electron Skills 综合回归 1/1 通过（4.1s）；确认首页及画布输入框和斜杠菜单均无管理按钮，设置导入/启停、停用技能过滤、重启恢复、主动选择与自动加载继续正常。用户随后授权本地提交本轮设置入口接入和单入口收敛，不推送或合并。

### 模型服务与内网地址统一排版和限宽（2026-10-21）

- 追加居中验证：检查、构建与真实 Electron 主题/设置回归 1/1 通过（1.4s），通用设置截图确认内容区在侧栏右侧水平居中；共享规则同时应用于模型服务与内网地址。用户随后授权本地提交本轮统一排版、限宽与居中调整，不推送或合并。
- 用户先要求提交默认下载位置布局，已本地提交 `d9c6fb9`，未推送。随后要求模型服务和内网地址采用一致排版，并限制模型配置随窗口无限变宽。
- 通用、模型服务、内网地址统一使用 `settings-page`，宽度 100%、最大 700px（含页面内边距）。用户后续纠正宽窗口下应居中，现通过 `margin-inline: auto` 在侧栏右侧的内容区水平居中，内部文字与标签仍左对齐。模型页内容与底部操作区统一 40px 水平内边距，不再使用不同窗口断点的独立留白。
- 模型与内网字段统一使用 `settings-row`：140px 标签列、16px 列距、右侧自适应输入控件、上下 12px 留白与底部分隔线。内网错误提示在输入列下方；模型高级参数沿用同一列宽，获取模型按钮减为 88px 最小宽度以适应紧凑窗口。既有校验、测试、保存、取消与密钥处理逻辑不变。
- 验证：检查、构建和 diff 检查通过；模型服务完整 Chat/配置回归与内网设置校验/取消/保存/恢复回归 2/2 通过（10.2s）。测试确认 1800px 窗口下两页宽度均为 700px，900×640 下无横向溢出；两页紧凑窗口截图已检查。连接使用本地模拟服务，未作真实中转站联调。未修改 Figma；本轮仅本地提交，不推送。

### 默认下载位置横排精简（2026-10-21）

- 用户要求 commit 上轮主题改动，并将下载设置采用同样排版、减少额外描述。实际检查时主题改动已提交为 `33c8ff8`，工作区干净，没有重复创建空提交。
- 移除“下载”区块标题、默认保存位置说明和底部使用说明；主行只保留左侧“默认下载位置”、右侧文件夹图标/路径/箭头按钮，52px 行高和底部分隔线与主题行统一。按钮继续打开原生目录选择；长路径省略并通过悬停显示完整值。
- 保留现有下载提醒偏好，文案精简为“下载时不再询问”，置于行下方靠右；保存、取消与错误状态及失败重试仍显示必要反馈。下载协议、目录持久化及防覆盖行为不变。
- 验证：`pnpm check`、`pnpm build`、真实 Electron 下载设置两项回归 2/2 通过（3.7s），涵盖目录选择/取消、保存框是否弹出、重启恢复、并发下载、IPC 异常与重试；浅深色截图检查通过。未修改 Figma，本轮下载排版调整尚未提交或推送。

### 紧凑主题选择与系统字体（2026-10-21）

- 用户提供截图，仅参考排版布局：主题为单行设置，左侧“主题”，右侧系统/浅色/深色三个图标分段选择，底部细分隔线；暂不加入字体选择。沿用本地浅深色 token、Lucide Monitor / Sun / Moon，保留可访问名称、悬停说明和焦点反馈。现有主题保存与跟随系统行为不变。
- 用户明确默认使用系统字体，覆盖旧应用 UI 固定 Noto Sans SC 的要求。`.theme-root` 改为已有 `--font-sans` 系统字体栈，移除 renderer 入口的两项 Noto Sans SC 字体 CSS 导入；不新增字体偏好字段或选择菜单。Figma 旧字体规范本轮未改。
- 验证：检查、构建和真实 Electron 主题/持久化回归 1/1 通过（1.9s），浅深设置截图已检查；选中图标增加细描边以保持深色可辨。用户随后授权提交当前分支全部剩余改动；提交前再次检查、构建通过。未修改 Figma，不推送或发布。

### 画布会话标题与独立历史页面（2026-10-21）

- 追加移除项目副标题：`pnpm check`、`pnpm build` 和 diff 检查通过；仅删除共用副标题元素及对应 CSS，无新增窗口回归。用户随后授权本地提交本次追加调整，不推送或合并。
- 用户先要求 commit，已本地提交此前侧栏统一样式与滑动动画：`931c4f7`（`feature/ui-style`），没有推送。随后追加本节界面要求，并于本轮明确授权将这些调整本地提交；同时确认历史页面应支持修改名称与删除对话，现有逐条铅笔/垃圾桶入口及确认流程已实现并通过上轮真实窗口验证。本轮不推送或合并。
- 标题栏移除关闭按钮，收起统一使用画布工具栏开关；新聊天按钮改为 Lucide plus + “新聊天”。原“画布助手”标题显示当前会话实际名称，尚未发送的新聊天显示“新聊天”，长名称单行省略并可悬停查看完整名称。用户后续明确要求不再显示标题下方项目名，聊天与历史页面均已移除该副标题及其占位样式。
- 历史记录由消息上方折叠列表改为右侧栏内的独立页面：标题“历史对话”，提供返回当前聊天与新聊天入口；页面占满消息/输入区，不同时展示聊天内容、Composer 或撤销提示。当前聊天及草稿保持挂载，返回后恢复，选择历史则进入相应会话。
- 每条历史显示会话名称与本地日期时间，优先使用最后一条消息的 `completedAt`，没有完成时间时使用会话 `updatedAt`，按该时间倒序；保留当前会话选中态、回复中标记、重命名及删除。重命名同步到聊天页标题。
- 验证：检查和构建通过；真实 Electron 的侧栏动画、外层侧栏和视觉附件回归通过，画布会话综合测试在修正测试重启后的旧窗口引用后通过（trace 复测 1/1，14.9s）；中间一轮在重启阶段超时，复测不再复现。覆盖独立页面/消息及输入隐藏、时间有效且倒序、返回保留草稿、标题更新和从历史新建；深色历史及 900×640 聊天截图已检查。未修改 Figma，现有设计节点 ID 不变；真实模型服务仍未联调。
- 最终整组：会话综合、视觉附件、右侧滑动这 3 项同轮通过；外层侧栏鼠标拖拽未到目标宽度，单独复测仍失败（期望 320、实际 250）。外层侧栏在本轮早先有通过结果，但最终不是整组全绿；沿用历史已记录的拖拽不稳定问题，本轮不修改其实现或放宽断言。

### 画布右侧栏滑入滑出（2026-10-21）

- 用户追加确认右侧栏应滑入滑出。`feature/ui-style` 将直接 `hidden` 切换改为从右侧进入、向右侧退出的 260ms transform 过渡，支持中途反向；首次载入直接恢复保存的展开状态。外层占位按展开状态分配宽度，画布工作区裁切滑出内容，消息、草稿与会话组件不卸载。
- 收起时立即设置 `inert` / `aria-hidden`，退出完成后设为不可见；内部关闭按钮将焦点交还工具栏开关，开关通过 `aria-controls` 关联侧栏。沿用原宽度保存和项目会话逻辑。
- 通过 CSS `prefers-reduced-motion` 实时禁用过渡。验证发现当前 Motion 的 `useReducedMotion` 只保留挂载时快照，不能覆盖动态切换场景；最终采用 CSS transform / visibility 过渡与媒体查询，无新增依赖。
- 验证：`pnpm check`、`pnpm build`、diff 检查通过；真实 Electron 画布助手与侧栏相关回归 3/3 通过，新增用例覆盖滑入/滑出中间帧、反向恢复、关闭后零占位、焦点归还、inert 及实时开启减少动态效果。未修改 Figma，未提交或推送。

### 画布侧栏与主导航风格统一（2026-10-21）

- 用户要求画布 sidebar 与外层 sidebar 样式风格一致；实现位于 `feature/ui-style`，范围为右侧画布助手。继续使用共享侧栏背景、浅深主题和 Noto Sans SC，标题统一为外层品牌的 22px / 600、项目副标题 11px、左右内边距 16px；顶部操作区高 60px。
- 历史、新建、关闭及会话重命名/删除复用 `IconButton`（32px 按钮、8px 圆角、18px 图标）；会话标题复用 `side-link` 的间距、圆角、悬停与选中背景，增加与首页历史一致的会话图标、回复中圆点和长标题省略。欢迎区建议使用同一列表行，模型配置入口复用 `nav-button`。
- 调宽手柄使用与外层一致的 2px 强调色提示，保留键盘焦点可见反馈。现有宽度范围、会话管理、消息滚动、画布操作和 Composer 功能保持。
- 验证：`pnpm check`、`pnpm build` 通过；真实 Electron 的画布 Agent、外层侧栏及主题回归 3/3 通过，浅色、深色历史与 900×640 截图已检查。首次沙箱内因本地监听 EPERM / Electron 无法启动未完成，沙箱外执行通过；模拟模型服务不代表真实服务联调。本轮未修改 Figma，既有节点 ID 不变；未提交、推送。

### 0.1.7 设计纳入发布（2026-10-21）

- 用户授权将最新改动全部发布为 0.1.7。本轮 Chat、画布 Agent/会话与视觉资产、Skills、生成详情和 Prompt 引用已同步的设计记录均随代码纳入；现有 Figma 节点及设计要求不变。
- 发布前当前源码完整 Electron 回归 57/57 通过；v0.1.7 双平台构建及统一预发布成功，三个安装文件已回读上传完成。发布状态见 git-workflow.md 与 engineering.md。

### Prompt 光标引用菜单与原子 tag（2026-10-21）

- 用户要求：输入 @ 时在当前输入位置下方弹出候选，带 mini 缩略图，支持上下箭头/Enter；选中引用为整体，删除整个tag。图像/视频及普通/放大面板统一实现，并同步 Figma。旧 textarea + 高亮覆盖的说明以本节为准。
- 代码复用已有 CodeMirror（没有新增依赖），真实内联替换 Widget + 原子选区/编辑过滤器，点击/方向键不会停在tag内部；Backspace/Delete、选区替换、剪切操作按完整tag处理，tag操作独立撤销，粘贴恢复原格式。输入中仍保存 @image_N / @video_N / @audio_N，现有引用排序、重编号、生成 <<<...>>> 协议不变。
- 菜单锚定 @ 的屏幕坐标，支持中文紧邻 @、按token/名称/序号筛选，上下循环选择，Enter/Tab确认，Esc只收起候选；菜单最大240px内部滚动，窗口边缘会避让/翻转。浮层放在 theme-root 下避免被面板裁切并继承浅深主题。图像/视频复用真实本地Blob/连线URL预览，音频为音乐图标，失败为类型图标；文件名省略时可hover查看完整名称。输入法确认交给原生处理，不能误选或额外换行，确认结束后恢复候选。
- Figma 原菜单 `136:4754` 保留ID并升级为缩略图行；候选主组件 `302:25356` 基于 macOS 26 Menu item 衍生的 Skill row，36px预览、13px文件名、11px序号，选中灰底。混合媒体菜单 `302:25416`，Tag主组件 `136:4752` 继续复用并增加水平内边距。新内容集 `306:25569` 含 Typing/ImageSelected/AudioSelected/Deleted，四个原面板主组件75:1358、77:1373、95:1929、95:2224的内容槽更新为实例；旧样例tag行和内置旧定位菜单隐藏保留。新组件区 `302:25355` 位于 Components (18850,100)，主题/字体沿用本地Noto Sans SC与变量。
- [引用交互对照](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=307-25056) `307:25056`，Page (26100,0)，7页：图像菜单 `307:25057`、视频深色菜单 `307:25112`、放大菜单 `307:25167`、图像选择后 `307:25222`、视频选择后 `307:25277`、视频删除后 `307:25332`、图像删除后 `309:27122`。包含点击/Enter选中、Backspace/Delete整体删除、Cmd+Z恢复的12条示例连线；数据为固定样例，未在 Present 逐项验收，不等同真实输入法/剪贴板。
- Figma 校验7页2037子节点、0 IMAGE填充、字体无不匹配，缩略图使用可编辑类型图标示例；实际图片/视频像素预览在真实 Electron 验证。普通/放大/浅深截图已查看，候选灰色高亮与删除后正文保留通过。pnpm check、pnpm build、完整 **57/57** 回归（1.7m）及diff检查通过，涵盖光标下方定位、无空格中文@、上下/Enter/Esc、真实缩略图、整个tag双向删除/选区/撤销/剪切粘贴、原始协议文本与多行换行、合成IME确认、深色浮层。截图目录 `apps/desktop/test-results/161c19ca-5918-4579-bc77-b68fd7bd402f/prompt-reference-caret-men-11906-do-cut-and-paste-atomically/`；状态记录见 prompt-reference-tags-state.json。
- 分支 `feature/prompt-reference-tags` 依赖 `074890f`；用户随后授权本地 commit，包含代码、测试及 Figma 同步记录；不推送、不合并、不发布。

### 图像/视频生成详情折叠与结果复制（2026-10-21）

- 用户截图要求两类生成节点统一：在引用数量说明旁放小箭头，下面信息默认不展开；失败显示错误，成功显示返回 URL + copy URL。代码和 Figma 同轮更新。此为显示/交互变更，不改变生成请求协议。
- 两类 MediaEditor 共用 GenerationDetails，原生 details/summary 默认关闭；有连线时保留引用数量说明，无连线时写“生成信息”。展开显示任务进度、失败错误/警告、未知结果警示，成功时显示本轮匹配 requestId 的返回 URL 和“复制 URL / 已复制”。失败或新一轮任务不误展示前一轮 URL；文字安全渲染、长 URL 换行，详情区最多180px并内部滚动。
- 复制使用明确的 generation.copyResultUrl(requestId)：主进程从成功任务记录取真实 URL，校验 HTTP(S) 后写系统剪贴板，不接受任意文本或 renderer 自报 URL，失败显示可重试信息。普通/放大面板共用交互，放大态焦点循环包含摘要和 URL。引用文件校验错误仍及时显示，生成结果默认收起。
- Figma 主组件集 `292:23681` 位于 Components 区 `292:23592`（16200,100），6状态 Empty/Success/Failed/Unknown/Running/Copied；共享 Summary text#294:0 / Result URL#294:7，复用本地 macOS 26 衍生 Secondary `28:361`、Lucide 箭头、主题及间距变量。折叠布尔集合 `VariableCollectionId:292:23589`，默认模式 `292:0` open=false，展开模式 `292:1` open=true；摘要点击切换且箭头变化。
- 更新原图像/视频浮动面板 `75:1358` / `77:1373` 与放大面板 `95:1929` / `95:2224`，旧引用说明层保留隐藏，新增共用详情 Footer。浮动面板默认高250px（原210px），放大面板保持960×600并让 Prompt 收缩。
- [生成详情对照](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=294-23301) `294:23301`，Page (22600,0)：图像/视频折叠 `294:23302` / `294:23357`，成功 `294:23412` / `294:23467`，深色失败 `294:23522` / `294:23577`，视频已复制 `294:23632`。示例域名并非实际服务结果；视频复制导航仅展示反馈，真实剪贴板由代码测试验证。
- 验证：7页1853子节点，0 IMAGE 填充，字体无不匹配；全部可编辑文字/矢量/组件。浅色成功、深色失败和折叠截图校对通过，修正示例层级避免节点/多选工具条盖住编辑器。pnpm check、pnpm build、完整55/55回归及diff检查通过；真实 Electron 校验两类生成成功返回 URL 的实际剪贴板读回、默认关闭、Enter展开/点击收起和非法ID拒绝。窗口截图 `apps/desktop/test-results/f69f5f2d-880a-4755-931d-43e427d022a3/generation-Electron-upload-fac85--video-and-restores-results/`，节点与状态见 generation-details-state.json。
- 代码位于 `feature/node-generation-details`，依赖 Skills 提交 `5ae71ae`；用户随后授权本地 commit，范围包括代码、测试与本轮设计记录；不推送、不合并、不发布。

### Skills：斜杠选择与自动加载（2026-10-21）

- **用户确认**：首页/画布 Agent 输入框支持 `/` 主动调用技能，Agent 也按适用规则自动调用；技能来源选“Jarvis 独立管理，手动导入”。未授权读取已有个人技能目录或执行技能脚本。最新要求替代旧节“Skills 禁用 / 暂无斜杠命令”，工具权限仍受当前会话限制。
- **已实现**：输入开头 `/` 显示上方技能菜单，按名称/描述搜索已启用技能，方向键/Enter/Tab 补全，Esc/外部点击收起；选择后不自动发送。占位改为“输入 / 选择技能，或与 Jarvis 对话”。Composer 增加书本图标，打开居中技能管理 dialog；可导入含 SKILL.md 的文件夹、启停，显示“可自动调用 / 仅手动调用”、空列表和错误/保存状态。弹窗保留焦点与 Esc，处理中禁止重复操作，Enter 不发送底层草稿。
- **已实现的调用反馈**：显式命令存入可见用户消息，活动区显示“已加载技能 · 名称（主动选择）”；自动路径先加载正文，再显示“自动匹配”，需要时显示已读取的包内参考文件。手动专用技能不参与自动目录；停用后不再可选/加载，已有历史上下文保留。没有内置示例技能，Figma 的 shot-plan/manual-plan 和模型名均为样例。
- **复用 macOS 26 衍生组件**：技能行 `271:20363` 基于原生 Menu item `201:12964` 复制，包含名称/描述/手动标记/选中状态；Picker 集 `271:20439`（All `271:20387`、Search `271:20415`、Empty `271:20432`）。管理弹窗 `271:20440` 从已复制的官方 Alert `251:17177` 衍生，复用本地 Secondary `28:361`、Checkbox `205:11381`、Toolbar icon `207:11748`。Lucide book-open `271:20359` 取自仓库当前图标源码；主组件区 `271:20358` 位于 Components (13800,100)。共用现有主题/间距变量和 Noto Sans SC，新增 effect style Jarvis/Skills popover。
- 统一 Composer 集 `121:4438` 的12个状态加入书本入口（`272:20416` 等），默认 Prompt 文案更新；原附件、模型/上下文位置、最大行数与底部固定不变。菜单有内部滚动，管理弹窗在窗口内限高滚动；保持没有 Enter/Shift 提示条。
- [Skills 总览](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=278-20334) `278:20334`，Page (19100,0)，12页：首页列表 `278:20335`、深色搜索 `278:20372`、选择后 `278:20409` / `282:22539`、自动加载 `278:20446`、管理浅深 `278:20494` / `278:20531`、画布菜单 `278:20568` / `278:20623`、无匹配 `278:20678`、画布选择后 `283:22761` / `283:22994`。保存原页面，未覆盖已有设计。手动样例的补全与管理主要路径有15条新导航；不是动态搜索、真实模型或完整 Present 验收，自动调用页独立展示，避免把主动选择错误标为自动匹配。
- **验证**：12页共3056个子节点（含实例层）、0 IMAGE填充，全为可编辑组件/文字/矢量，字体断言仅Noto Sans SC。已检查首页列表、自动记录、深色管理与画布菜单，修正浮层错误参与根自动布局、回复 FILL/HUG 循环和管理说明底部换行；最终弹窗600×444并居中。实际 Electron 浅深管理/搜索/自动活动/画布菜单截图通过，最终55/55回归、检查和构建通过；真实中转站未测。节点和校验记录保存于 `figma-sync-2026-10-21/agent-skills-state.json`。
- 本轮在 `feature/agent-skills`，依赖已提交画布 Agent `e74a460`；用户随后授权本地 commit，范围包含代码、测试与设计记录，不推送/合并/发布。来源、用户确认与范围详见工程记忆。

### 画布 Agent V1：会话管理与视觉资产（2026-10-21）

- **用户已确认**：右侧栏与 Agent 交互并可读取/操作画布；先做第一版，代码与 Figma 同步。追加新建/历史/重命名/删除聊天、多选资产发送，并明确选择“图片 + 视频抽帧”。最新要求替代旧节中“创作空间未接入 Agent / 媒体仅结构信息”的范围；首页仍为文字聊天，写作助手未接入。
- **已实现**：项目独立会话，右上角历史/新建/收起，重命名内联输入（保存/取消、Enter/Esc），删除调用原生确认并保留画布和资产。侧栏默认 400px，可拖动/键盘调整 340–560px；消息区滚动、输入框固定底部，隐藏侧栏不取消运行，切换项目停止当前项目运行。新建对话在首次发送时落盘。
- **已实现的画布交互**：读取画布概况与节点详情、创建图像/视频节点、修改提示词/参数/名称、移动、连接/断开、定位。活动展示保存后的回执、定位、修改前后详情与同轮撤销；画布版本冲突拒绝覆盖，撤销仅允许最后一轮且图仍未变化。停止不回滚已保存修改；缺失回执时可从最近修改记录恢复撤销入口。无文件/Shell、节点删除或生成执行工具。
- **视觉输入当前参数**：多选图片/视频后点 Composer 的 + 添加，显示缩略图、名称、准备中/失败/可移除状态；准备中或失败阻止发送。每次最多 6 个资产、12 张图片/视频帧，图片长边 1536px；视频在 10%/50%/90% 取三帧，显示来源和秒数，不能代表完整音视频。未知时长/加载失败明确报错；音频不支持。历史每会话最多 60 张图片/帧后提示新建会话。上述限额为本轮实现参数，非用户逐项指定。模型名称使用真实配置，Figma 的 vision-model 为示例。
- **组件复用**：复用本地 macOS 26 衍生 Composer `121:4438`、输入框 `28:373`、按钮 `28:361` / `28:367` 和工具图标按钮 `207:11748`。新增 [侧栏组件集](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=241-14982) `241:14982`，12 状态：Empty、Running、Applied、Conflict、Undone、Stopped、History、Rename、MediaReady、MediaPreparing、MediaFailed、VisionSent。会话行 `251:17207`、附件行 `252:17043`、Lucide 历史图标 `247:15952`；主组件位于 Components 区 `241:13876`。
- **官方衍生确认框**：从 macOS 26 UI Kit 官方 Alert Side-by-side（集 key `461d349170ba2ab5476ecdd1d64538f01fb3a80b`）复制为本地主组件 `251:17177`，清除远程组件/变量依赖，适配 Noto Sans SC 与主题。代码采用 Electron 原生确认框。校对发现 Secondary 的原生文字继承 LINEAR_BURN 导致深色变暗，已将本地主组件 `28:363` 与新增侧栏/导出文字改为 NORMAL，并绑定本地文字颜色。
- **页面位置**：[画布交互与权限](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=242-13450) `242:13450`（Page x12000，13 张状态）；[会话与视觉资产](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=253-22057) `253:22057`（x15600，10 张状态）。浅深完成页 `242:14178` / `242:14650`、紧凑 `242:16287`、变更展开 `248:17552`；历史 `253:22058` / `253:23165`，重命名 `253:22419`、删除确认 `253:22784`、资产就绪 `253:23526` / `253:23865`、准备中 `253:24204`、失败 `253:24543`、视觉发送后 `253:24897` / `253:25237`。旧源页面保留；原生导入/导出入口同步到本轮页面。
- **设计验证**：23 张页面合计 6034 个子节点（含实例子层），0 IMAGE 填充，没有完整 UI 位图；UI 为可编辑文本/矢量/组件，媒体缩略图采用可编辑占位样例。字体断言无不匹配，使用 Noto Sans SC。查看浅深、重命名、删除确认、视觉发送及紧凑截图，修正了视觉预览与用户气泡误用水平布局、紧凑节点边界未缩放、深色按钮混合模式。导航包括开关/历史/重命名/删除确认/发送/停止/撤销；变更展开使用 Boolean 模式 `247:1`。原型是固定数据页面跳转，不等于真实持久化或实际模型执行，未在 Present 逐项验收。
- **代码验证**：`pnpm check`、`pnpm build`、`git diff --check` 和完整 Electron/SDK 模拟服务回归 **50/50**（1.6 分钟）通过。验证两张图片与三个不同时点视频帧实际进入模型请求（含 Responses），准备失败/移除、重启恢复、会话重命名/取消删除/确认删除、项目隔离、画布操作/撤销/冲突/停止均覆盖。最终窗口截图位于 `apps/desktop/test-results/0e8c7409-f125-4c19-a466-b816b0576c7f/`，已查看视觉发送后、历史与深色画布；真实中转站及 Windows 实机未验证。
- 分支 `feature/canvas-agent` 依赖上轮 Chat V2 提交 `d60eece`，本轮用户授权本地 commit；不推送/合并/发布。节点、状态和验证结果见 `figma-sync-2026-10-21/canvas-agent-v1-state.json`。

### Chat V2 设计已落实到代码（2026-10-21）

- 用户确认“可以修改代码”，从已 fetch 核对一致的 develop 新建 `feature/chat-ui-v2`，保留本轮未提交设计资料；未提交/推送/发布。Figma 节点不变。
- 已实现用户无姓名、随内容收紧/限宽换行的气泡，Agent 无底色正文、复制/相对完成时间、Jarvis Logo 呼吸与减弱动态效果。沿用纯文本呈现，不执行消息里的 HTML；新回复记录真实完成时间，旧历史缺失时间不伪造。
- 输入框默认 1 行，最多 16 行（384px 文本高度），小窗口按 45vh 限高，内部滚动；+ / Auto 在左，真实配置模型/上下文在右，回车发送/停止在输入区右下。新聊天与已有对话底部固定，欢迎与建议移回可滚动中间区，已去除快捷键提示。Enter/Shift+Enter 与 IME 行为保留；未接入斜杠命令，因此 placeholder 保持“和 Jarvis 一起工作”，不展示不可用命令承诺。
- 上下文 hover/点击使用真实总量/容量、k/M 格式与百分比，未知显示 —；模型不硬编码 Opus 5.5，容量不硬编码 1M。支持外部点击/Esc 关闭；模型输入保留原有手填流程并支持键盘提交。
- 工具/文件记录展示支持独立折叠、路径、统一 diff 的旧/新行号、红绿增删与内部滚动；数据契约为可选 activities，无数据不显示。运行时继续 `tools: []`，没有新增文件/Shell 工具；本轮 diff 仅通过测试 profile 中的结构化活动记录验证，不能宣称已接入真实工具事件。
- 真实窗口发现原 navigator.clipboard 被现有 Electron 权限策略拒绝，新增受限 `agent.copyReply({sessionId,messageId})`：主进程按 ID 取非运行中 Assistant 正文写剪贴板，拒绝任意文字和用户消息，继承可信窗口校验；无通用剪贴板读取接口。
- `pnpm check`、`pnpm build`、完整 44/44 回归与 diff 检查通过。已验证 16 行上限/收缩、底部位置、IME、复制/拒绝用户消息复制、上下文数值/浮层、时间与历史恢复、停止/中断、上滚时流式追加不抢滚动及 reduced-motion。真实截图目录：`apps/desktop/test-results/8e7f4cfb-0a2d-43af-9dd5-c7d7bb8d0201/agent-homepage-Chat-relay--0b3e4-secrets-theme-and-isolation/`。网络为本地模拟中转，Windows 实机与真实服务仍未验证；未新打包。

### Composer V2、上下文与文件 Diff（2026-10-21，含底部固定纠正）

- **用户要求**：按输入框/hover/上下文截图修改设计；Pi SDK 若不支持分类分析就只显示 `Context 106.6k / 1M (11%)`。补充文件行展开路径与 diff。随后明确删除“Enter 发送 / Shift…”提示，聊天输入框始终在底部，新聊天页也一样。本轮只修改 Figma 与设计记录，无应用代码变更。
- **最新 Composer**：继续使用集 `121:4438`，保留 Empty `121:4335`、Ready `121:4370`、Running `121:4405` ID。主组件移入 Components 区 `225:12773`（9400,100）。输入区复制既有 macOS 26 衍生输入框背景 `28:378` 并适配 16px 圆角；单行输入面 56px 高，总组件 94px 高，底部工具行独立。左侧 + / Auto，右侧模型 / 上下文圆环；发送回车图标/停止位于输入区右下角。旧盾牌、思考强度和语音入口隐藏，最新截图要求取代此前完整旧 Composer 的布局要求；不推定附件/Auto/斜杠命令已经实现。
- Model `Model#225:0` 与 Prompt `Prompt#225:4` 为文本属性；模型 Opus 5.5、占用 106.6k 与容量 1M 均为设计示例，不表示已配置真实服务。新增 Lucide corner-down-left `225:12776`。
- **最大行数当前方案**：根据参考图采用默认 1 行、上限 16 个可视行，14px 字号/24px 行高。3 行稿 `227:13175` 总高 138；16 行稿 `227:13225` 总高 450，文本视口 384px，20 行示例正文 480px，VERTICAL 内部滚动并裁切。16 行为本轮拟定的设计参数，用户未单独指定数字；小窗口建议输入区不超过窗口高 45%，提前滚动，不能无限遮住对话。
- **Hover/点击**：新增 HoverAdd `227:12825`、HoverAuto `227:12875`、HoverModel `227:12925`、HoverSend `227:12975`、HoverContext `227:13025`、ContextOpen `227:13075`、ContextUnknown `227:13125`。底色 hover 通过 MOUSE_ENTER/MOUSE_LEAVE 的 Boolean 绑定实现；上下文点击再次关闭。hover 用黑色单行 tooltip，点击用主题适配的单行 popover，不显示分类条或 See detailed breakdown。未知为 `Context — / —`，不能显示为 0%。修复操作栏裁切导致浮层不可见、发送图标沿用旧白色覆盖的问题。
- **SDK 已核实**：仓库依赖 `@earendil-works/pi-coding-agent@1.3.0`，本地 `dist/core/extensions/types.d.ts:197` 的 ContextUsage 仅 tokens/contextWindow/percent；`dist/core/agent-session.js:3471` 返回聚合估算，并支持未知 null/undefined。同期 [官方源码](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/extensions/types.ts) 同样仅这三个字段。SDK 不直接给出截图中的 MCP/Skills/System prompt/Memory 分类 token 计量；定制估算是额外工作，本轮按用户要求回退总量。应用现有上游 usage 取值策略未改，若未来使用 SDK 估算须明确估算语义。
- **文件 diff**：在既有工具记录 `216:12116` 中，两条文件行 `216:12125`/`216:12133` 分别可独立展开；详情 `229:12901`/`229:12942`，滚动视口 `229:12903`/`229:12944` 高 220px，包含示例路径、行号、+/- 和红绿增删背景。箭头随展开/收起切换；代码使用已确认可用的 Atkinson Hyperlegible Mono Regular，其余 UI 保持 Noto Sans SC。路径与 diff 均是示例，不新增工具或文件权限。
- 新增 [输入框浅深交互总览](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=230-12411) Section `230:12411`，位于 Page (9600,0)，1940×2917；Composer 对照 `230:12412`；展开 diff 浅色 `230:13312`、深色 `232:13794`。扩展示例使用独立变量模式，默认对话页的文件 diff 仍收起。
- **用户最新底部固定要求已落实**：移除 10 个 Keyboard hint 与 14 个旧键盘提示容器；首页 `5:35`、宽屏 `122:4390`、深色新聊天 `179:12172`、Ready `181:12092` 的 Composer 从欢迎区移到新底栏 `235:24395`–`235:24398`。旧底部说明隐藏，欢迎语/建议留在中间；全部 14 张首页/Chat 页面采用“工具栏 + 可增长/滚动的内容区 + bottom dock”，底栏内边距底部 14px，不再有快捷键或运行状态提示占据输入框下方。键盘行为本身没有因删文案而改动。
- **验证**：28 个原有 Composer 实例（含隐藏层和旧规格实例）统一到新主组件，10 个已有消息 dock 与 4 个新聊天 dock 固定底部。首页、完成页、紧凑页临时增高 100px 后，dockBottom 均等于 mainHeight（根 Frame 边框占 2px），随后恢复原尺寸。新聊天浅深与紧凑最终截图通过；浅深 Composer 状态、上下文浮层、16 行裁切及浅深 diff 截图通过；Ready 发送导航到等待页仍存在。总览 0 IMAGE 填充，主 UI 为可编辑图层。已回读 hover、点击、滚动配置，未在 Present 逐个操作或执行真实剪贴板/网络功能。
- Figma 交互说明 `181:12996` 更新，Composer/SDK 说明文本 `232:13797`；操作状态与节点保存于 `figma-sync-2026-10-21/composer-v2-state.json`。未提交或推送；旧节中“Composer 保留完整附件/盾牌/语音”和“底部快捷键提示”的描述以本节为准。

### Chat 对话样式按参考图调整（2026-10-21，最新设计）

- **用户确认**：先改聊天对话，仅修改设计稿。用户消息不显示姓名，气泡长度跟随消息；Agent 顶部展示调用工具/文件变更记录，底部仅复制和回复时间；完成后显示 Jarvis Logo，回复中 Logo 有动效。本节取代此前“双方都用带姓名气泡”的 Chat 视觉描述，不改变应用已实现能力。
- **已修改**：消息集 `177:7847` 改名 `Jarvis / Chat / Message`，保留六个原变体 ID 与 Body 属性。用户变体 `177:7819` 隐藏姓名、右对齐浅灰气泡、Hug 文字，最大 680px 后换行；Agent 五态隐藏姓名和气泡底色，正文占消息区宽度，最大阅读宽 880px。完成/停止/中断底部仅复制与相对时间，等待/输出中不提前显示完成时间。中断原因保留，原“重新发送”行隐藏，说明改为从输入区重新发起。
- 四张核心稿使用参考图的图标设计对话示例：完成浅色 [179:11487](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=179-11487)、深色 `179:11572`；输出中浅色 `179:11657`、[深色 179:11740](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=179-11740)。此前第一轮对话隐藏保留，当前只显示与参考图对应的一组用户/Agent 对话；其他状态页保留原工作安排示例并继承新样式。共处理 10 张含消息区的 Chat 状态页（含未配置页的消息容器）。
- **组件位置**：新增 Components 区 `216:12073`，(7200,1100)，1800×1900；消息集已移入该区，原引用保持。新增工具记录组件 `216:12116`、复制按钮 `216:12108`（复用既有 macOS 衍生图标按钮）、Lucide copy `216:12107`、回复 Logo `216:12103`。Logo 是已确认 App Icon `192:12530` 的可编辑矢量缩小副本，未使用参考截图替代 UI。
- **工具记录**：消息新增 `Show activity#219:0`，默认隐藏；四张核心稿开启并显示创建 SVG/修改 HTML、绿色新增和红色删除行数。记录位于正文上方，摘要点击通过 Boolean `VariableID:216:12142` 切换明细可见性；文件名具有文本属性。工具/文件/行数均为设计示例；当前应用仍是中转站纯文字 Chat，不因设计稿新增工具展示而扩展文件/Shell 权限。
- **时间与 Logo**：新增 `Reply time#219:7` 文本属性，示例“2 分钟前”。回复完成后静态 Logo；Waiting/Streaming Logo 使用透明度 0.45→1→0.45 的 1.2 秒呼吸，Figma 时间轴演示两轮共 2.4 秒。真实页面的 5 个关键帧和时间轴均读回；未导出视频，不宣称实播验证。说明要求实现时持续回复期间循环，结束后停止，减弱动态效果时保持静态。
- **气泡自适应验证**：组件区示例 `221:12764` 包含短句 `221:12765`（74×45）、参考消息 `221:12769`（313×45）、长文 `221:12773`（680×70），已截图确认 Hug 与换行。900px 页面已有两条短消息宽 228/270px，未越出 620px 内容区；窄窗长文仍需实现时按内容区进一步限宽，不能将固定 680px 作为所有窗口的硬宽度。
- **交互说明**：更新 `181:12996`，新增说明文本 `222:19995`，约定复制只取回复正文（不含工具记录/时间）、成功反馈“已复制”、独立滚动及当前设计/实现边界。Figma 未执行真实剪贴板；复制反馈仅写入交互说明，未制作可操作的剪贴板功能。
- **验证**：浅色完成、深色输出、紧凑窗口与气泡长短样例已截图检查；修复消息实例主题覆盖导致黑色底/黑色文字的问题，页面保留真实主题变量绑定并设置对应主题的回退色。五张重点页面读回均为可编辑文字/矢量/组件，0 IMAGE 填充、0 非 Noto Sans SC 可见文字。工具记录切换动作及绑定读回通过，未在 Present 实际点击。紧凑页超长历史内容在滚动视口内裁切属预期，Composer 保持完整。
- 状态与返回节点保存在 `figma-sync-2026-10-21/chat-conversation-v2-state.json`。未修改应用源码、未提交或推送；侧栏、设置、完整 Composer 不作本轮重设计。

### 优先 macOS 26 本地副本与控件统一（2026-10-21，最新规则）

- **用户确认**：“优先使用 macOS 26 UI Kit，copy 出来。输入框需要统一，有官方衍生版本就优先使用。”后续通用控件先复用现有官方衍生本地主组件；缺失时从 UI Kit 复制、本地化后使用。保留 Lucide、Noto Sans SC 和本地 Light/Dark 变量；不要因旧“本地控件”策略而重新手画已有官方对应的控件。业务专用 Composer、消息、媒体节点和容量圆环保持既定结构。
- **输入框**：用户名主组件内 `127:4727` 从旧自建 `9:267` 切换为官方衍生 `28:373`，保留 620×36 和 Hugo 文字；三张通用设置稿同步生效。修复 `28:373` 背景、边框、文字的本地主题绑定与混合模式，消除深色模式白底/浅字问题。界面页旧输入框引用为 0；旧主组件重命名 Deprecated，未删除。
- **官方复制来源**：Checkboxes key `0540a4ddfe002059f2f7d6f44edb1512b452eef6`；Segmented Control key `e8c9aafb2846ba0ac1edbc90aa94e33a04a20f97`；菜单项来自 Pop-Up with Menu key `486b61793e2e84a65810d053d9692134bd5b5556` 的 Item。复制后解开内部远程实例、清除远程样式/变量依赖，重新建立文字属性和本地主题绑定，保留来源说明。导入时的临时远程 ID 不作为后续定位依据，需重新导入获得有效句柄。
- 新增本地副本区 [macOS 26 本地衍生控件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=201-12911) `201:12911`，位于 Components (5400,100)，1200×860。Checkbox 集 `205:11381`：Disabled `201:12912`、Unchecked `201:12917`、Checked `201:12922`，Label 属性；Theme 集 `205:11382`：System `201:12928`、Light `201:12941`、Dark `201:12952`，三个 Option 文本属性；Menu item `201:12964`，Label/Selected 属性；Toolbar icon action `207:11748`，Icon 替换属性。
- **下载复选框**：三个下载设置主组件中的实例 `107:3968`/`107:3984`/`107:4000` 已换为官方复制的三态，页面继承更新，旧复选框引用为 0。旧集 `107:3940` 标记 Deprecated。勾选矢量源自官方；菜单图标仍为本地 Lucide。
- **主题切换**：原主组件 `86:1517` 保留 ID 和 620×44 外部尺寸，内部改用三个官方三段控件副本。实例 `206:11406`/`207:11754`/`207:11765` 的可见性分别绑定既有 selected/system、selected/light、selected/dark；内部按钮保留设置主题变量模式的原型动作。工具拒绝子层 CHANGE_TO 方案且未提交，最终采用上述既有变量控制状态，不宣称 Present 实点已验收。
- **目录菜单**：`162:6217` 的四条可见行换为 `201:12964` 实例，保留四个目录/操作标签与当前选择指示；旧普通 Frame 行隐藏保留。菜单尺寸保持 228×198。
- **节点参数**：`94:1657` 原位复用官方衍生 Pop-Up Button `28:381` 的本地背景副本，箭头统一为 Lucide chevrons-up-down；保留 Label/Icon 属性、40px 高度及原实例引用，未创建另一套参数组件。
- **画布图标按钮**：`207:11748` 从现有官方衍生 `28:411` 复制并增加 Icon 属性；四张画布稿 `67:918`/`70:952`/`72:1270`/`72:1507` 的缩小、放大、适应视图、缩略图、点阵、磁吸共 24 个普通 Frame 换成实例，36×36 和 Lucide 图标保留，12 个已有变量切换动作迁移到新实例。旧 Frame 隐藏并改名 Deprecated，不批量删除。
- 新增 `color/on-accent` `VariableID:206:11383`，用于实色强调背景上的文字/勾选（Light 白色、Dark 深色），避免误用原来针对浅强调底的 color/accentText。scopes 为 TEXT_FILL/SHAPE_FILL；既有全局 accentText 语义不变。
- **验证**：[浅深控件验证稿](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=207-12003) `207:12003` 位于 Components (5400,1100)，显示真实组件实例。浅深验证稿修复后截图、深色通用设置 `114:4247`、浅色节点画布 `72:1507` 已检查。新副本区远程实例 0、非 Noto Sans SC 文字 0、残余远程变量绑定 0；属性、用户名内容与按钮动作已读取核对。完整状态保存于 `figma-sync-2026-10-21/native-controls-state.json`。未在 Present 逐项点击，未修改应用代码、未提交/推送。
- 本轮完成上述明确候选的控件迁移；前一轮提出的表单行/写作状态栏等组合组件化仍为独立待办，不将其标为完成。

### Figma 画布整理与复用审计（2026-10-21，最新位置）

- 用户要求整理重复稿、布局、未组件化重复部分及 macOS 26 UI Kit 可替代的自建控件。本轮已实时读取 Figma，通过 MCP 整理画布，未改应用代码、未提交。页面实际名称为 `Page`（`0:1`）、`App Icon`（`172:8710`）、`Components`（`2:104`）。
- 61 张界面/规范 Frame 保留原 ID 和尺寸，划入 8 个 Section，区内双列排版；旧记录中的绝对位置已失效。首页与 Chat `199:11182`、通用与内网设置 `199:11183`、中转站状态 `199:11184`、项目与画布 `199:11185`、媒体编辑规范 `199:11186`、写作主稿与状态 `199:11187`、侧栏原型对照 `199:11188`、Composer/交互说明 `199:11189`。入口：[整理后的设计稿](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=199-11182)。
- Components 的 33 个原顶层组/组件排入 [本地组件总览](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=199-11377) `199:11377`；主组件和组件集合计 195 个（含变体），未新建或替换主组件。App Icon 未调整。前后结构及位置分别保存于 `figma-sync-2026-10-21/organization-before.json`、`organization-after.json`。
- **重复判断**：写作 Editing `149:5790`/`149:5992` 与侧栏左右展开 `171:6797`/`171:7799` 的可见文字、一级布局尺寸一致，属于内容重复的原型基准；后者已改名标注，保留侧栏切换用途。未找到在本次采样的布局/样式/文字/组件引用属性上完全相同的整页副本，不宣称像素级或全部属性等同。通用 `87:1353` 与下载 `114:4022`/`114:4247` 是未配置/已配置及浅深状态，已统一名称为“设置 / 通用 / 下载未配置或已配置 / Light或Dark”，不是应删除的重复页。
- **已验证的组件化缺口**（只统计可见普通 Frame，遇实例不下钻）：中转配置表单 9 份、Field line 45 份；写作文件标签容器、路径与编辑模式栏、文档状态栏各 18 份；画布 Window toolbar、缩放控件、视图选项各 4 份。建议提取表单行、标签栏组合、路径栏、状态栏、画布工具栏；不要将整张 Home 页面组件化。字段输入、文档 Tab、左右 Sidebar、消息和 Composer 已有主组件，不能笼统说这些没有组件。
- **遗留副本**：隐藏旧输入区 14 份、隐藏旧写作侧栏 18 份仍在树内；本轮保留，未删除。组件库的 message-square、plus、sliders-horizontal、cpu、contrast、folder、plug、bookmark-check、database、info 存在同名不同 ID 的 Lucide 主组件，作为后续统一引用候选，尚未做逐个矢量等同性或全文件引用迁移。
- **macOS 26 核查**：当前仍启用该库，已通过库搜索确认 Checkboxes、Text Field、Search Field、Pop-Up Button、Pop-Up with Menu、Pulldown with Menu、Push Button、Segmented Control、Window/Button、Window/Button Group 等资源存在。搜索可用不等于已导入或逐变体适配验证。
- 自建替换候选：下载复选框 `107:3940` → Checkboxes；主题偏好 `86:1517`（内部三个普通 Frame）→ Segmented Control；节点参数 `94:1657` → Pop-Up Button；目录切换菜单 `162:6217`（内部菜单项为 Frame）→ Pop-Up/Pulldown with Menu；画布独立工具按钮组合 → Window/Button 与 Window/Button Group。这些是建议，尚未替换。
- 输入框双轨已确认：`9:267` 是旧自建 Text field，用户名组件 `127:4725` 仍复用它；`28:373` 的来源说明明确为 macOS 26 衍生本地组件，中转站字段也确实引用它。界面页包含隐藏层的引用统计分别为 3 和 67，不能当作可见控件数。推荐优先统一到既有 `28:373`；其他 Apple 衍生本地按钮、搜索、侧栏项也不能按“没有远程引用”判成手画。
- 继续保留 Lucide、Noto Sans SC 与本地组件策略；本轮用户要求核查 UI Kit 使用，尚未明确要求恢复全部远程关联。Composer、消息气泡、媒体节点和上下文容量圆环属业务控件，不因官方库存在通用控件就强行替换。
- **验证**：61 张 Frame ID/尺寸均保留，Section 子项无越界；46 个原型目标 ID 均可解析。已检查通用设置区、写作侧栏对照区和组件总览截图。未在 Present 逐一点击，不宣称完整交互回归；未进行组件迁移，因此组件化缺口继续待处理。初次读取出现 429，短暂等待后恢复，不再作为当前阻塞。

### V1 Chat 与 App Icon 纳入 0.1.6（2026-10-21）

- 用户授权将 Agent、App Icon 及其余改动统一打包发布。已通过 PR #28→develop、#29→main，`v0.1.6` 指向 `9526901`；[双平台预发布](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.6) 的 macOS arm64 DMG/ZIP 与 Windows x64 EXE 均已上传，唯一云端流程全部成功。
- Figma 页面/组件 ID 未改；本轮是版本及发布记录，不新增 UI 实现。未签名/未公证、真实中转站待联调和 Windows 功能待实机验收的边界继续保留；具体资产摘要见 engineering.md。

### 首页 Chat V1 与中转配置已实现（2026-10-21）

- 用户授权开始 coding；已按完整 Composer `121:4438` 和 Chat/配置页面设计实现首页、最近会话、左右气泡、流式/停止/中断、手动重发/复制/重命名及中转站设置。原 Figma 节点不变，本轮未写 Figma。
- 使用现有 SidebarLayout、IconButton、Lucide、Noto Sans SC 与浅深主题；深色历史标题继承主题文字，900×640 输入框保持完整。附件/权限/语音保留图标但禁用并明确说明；思考强度暂显示不可调的提示，不伪造模型能力。模型可手动填写/获取，配置测试与保存独立；增加折叠的容量/输出上限，容量与上游 usage 缺失时圆环显示未知。
- 回复区只渲染可选择的纯文本，不执行 HTML/脚本；接近底部时追加跟随，上滚时保留位置并显示回到最新。设置页当前不接官方服务商登录。写作与画布 UI/Agent 范围不扩展，原入口保留。
- 检查、构建、完整44项回归通过，最后命名/状态栏收尾后最终 macOS arm64 未签名目录包的真实 Chat 回归1/1通过；浅深聊天、紧凑窗口和模型设置截图已查看。记录路径与基线/共享 checkout 注意事项见 engineering.md 最新节。功能通过本地模拟服务验证，不代表真实中转站兼容性或 Windows 实机验收。

## 0.2.0 集成与发布（2026-10-22）

- 用户新授权检查全部本地修改并提交、推送、合并、发布 0.2.0；本节替代此前仅本地开发/提交的授权状态。纳入 feature/ui-style 的 11 个提交和自动更新提交 21e0c80，保留历史分支及旧设计 stash。
- 根包、桌面包与变更记录统一 0.2.0。按 feature → develop → main PR 和 main 合并提交标签发布；本地集成及云端发布验证全部通过。
- 合并后使用 Node 22.23.3 验证：pnpm check、构建与完整 Electron 回归 74/74（2.2m）通过；更新清单 3/3 和 Apple 网络有限重试 7/7 通过，git diff --check 通过。真实 DeepSeek 服务及两个签名版本间的生产自动升级仍未验证。
- [PR #42](https://github.com/qianyuzhao-ai/Jarvis/pull/42) 合入 develop（6286015）；[PR #43](https://github.com/qianyuzhao-ai/Jarvis/pull/43) 合入 main（5a191aa507e9e27a7d455c171c439c21c12d32b6），两者与已验证集成树一致。注释标签 v0.2.0 指向该 main 提交，标签对象 9d7fd3f84de5a2ec5f745ae24002abf137510e0b；唯一标签运行 [39709911615](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39709911615) 已触发，未修改旧标签。发布运行 macOS、Windows、统一发布三个作业均 success；[v0.2.0 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.0) 于 2026-10-22 10:28:00（UTC+8）发布，非草稿、预发布，8 个资产均 uploaded。

- Apple 只读查询 [39711114877](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39711114877) 确认本次公证 288cecf8-f672-46de-bbe7-4d5b58f9a5ce 为 Accepted；正式打包及目录/ZIP/DMG 内应用的签名、票据、Gatekeeper 均通过，三者均 accepted / Notarized Developer ID。本次无需重试发布。
- 发布资产包含 macOS arm64 DMG/ZIP、Windows x64 未签名 EXE、latest-mac.yml / latest.yml、三个 blockmap。两端云端校验更新目标、版本、大小及 SHA-512；线上清单已下载回读，其 SHA-256 与 GitHub digest 相同，所有目标名称/大小匹配实际发布资产，未发布 builder 调试文件。
- 0.1.8 没有更新器，需手动安装一次 0.2.0；后续生产签名版本之间的真实升级仍需更高版本验证。真实 DeepSeek 服务和 Windows 实机功能不在本次云端签名/清单验证结论内。


## 应用图标（2026-10-21）

- **深浅图标待后续**：用户计划明天准备两版 macOS icon 样式，本轮仅提交已有分支改动，未接入 Icon Composer 或新增深浅图标素材；应用内主题与 macOS 图标外观是独立设置。
- **安装镜像图标最新要求**：用户确认 `.dmg` 文件本身保留 macOS 默认图标；仅挂载后的磁盘使用透明圆角 Jarvis 图标。基础打包配置显式设置 `dmg.icon: resources/icon.icns`，不增加文件图标后处理。桌面 `Jarvis-0.1.8-macos-arm64.dmg` 曾在本轮短暂设置本地自定义图标，已按用户最新要求通过 `NSWorkspace.setIcon(nil, ...)` 恢复默认并返回成功；不修改旧镜像内容，旧挂载卷需使用新包后更新。测试镜像生成、只读挂载及卷内 `.VolumeIcon.icns` 字节比对通过，测试卷已卸载；用户随后授权本地提交，不推送或发布。
- **最新要求与修正**：用户提供 Windows 安装包/快捷方式与 macOS Dock 截图，明确只保留圆角矩形，移除外部方形底色。旧 PNG 四角为不透明 `(245,245,245,255)`，该底色随格式转换进入 ICO/ICNS；本轮从原节点 `192:12530` 导出透明 SVG，保存为 `apps/desktop/resources/icon.svg`，用 Electron Chromium 渲染后生成三种图标资源。保留原 100px 透明留白、圆角底与紫蓝主体，未修改 Figma。
- **导出边界**：本轮 Figma `get_screenshot` 虽返回透明 PNG，但丢失 mask 内的紫蓝主体，因此未用于应用资源；改用 `exportAsync({format:'SVG_STRING'})` 保留完整路径、渐变和滤镜，经本地渲染视觉确认主体完整。PNG 与全部 ICO/ICNS 尺寸四角透明检查通过；检查、构建通过。用户随后授权本轮本地提交；不推送或发布，Windows 安装及双平台系统图标显示待新包实机验收。
- 本轮本地 macOS arm64 未签名目录打包通过：`release/0f51fe49-d1d3-42bb-bbf6-5cdc6de91f4f/mac-arm64/Jarvis.app`；包内 PNG/ICNS 与源码字节一致，Info.plist 引用正确。系统 Dock/Windows 桌面的实际显示仍待新包验收。
- 下列为首次接入历史，最新透明背景要求优先。
- 用户指定采用 [jarvis-icon-white 1](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=192-12530)，节点 `192:12530`。已通过 Figma MCP 读取设计和原始导出，保留原有浅色背景、圆角底与紫蓝环形图形，没有修改 Figma。
- 原始 1024 × 1024 PNG 保存为 `apps/desktop/resources/icon.png`，从同一原图生成 macOS `icon.icns` 与 Windows 多尺寸 `icon.ico`；只做格式和尺寸转换，未重绘或裁切。本地预览与 Figma 截图核对通过。
- 基础 electron-builder 配置指定两平台图标并将 PNG 复制到 Resources；主进程为窗口设置图标，macOS 开发运行设置 Dock 图标，正式包采用应用 bundle 图标。
- 检查、构建、窗口导航与隔离回归 1/1 和 macOS arm64 本地未签名目录打包通过；已读取产物 Info.plist 的 `CFBundleIconFile=icon.icns`，包内 ICNS 与运行时 PNG 均与源码 SHA-256 一致。Windows 仅验证 ICO 资源及配置，未执行 Windows 安装包或实机验收。用户授权本轮仅提交图标相关改动；未推送或发布。

### Composer 按用户截图统一与深色聊天记录修复（2026-10-21，最新纠正）

- 用户明确指定截图中的 **Jarvis / Agent Composer** 完整组件 `121:4438`：Empty `121:4335`、Ready `121:4370`、Running `121:4405`。保留附件、权限、上下文、模型/思考强度、语音、发送/停止的完整视觉设计，取代上一轮擅自精简的方案；这些入口不扩大“首期仅首页 Chat + 中转站”的实现范围。
- 已将 13 处简化 Composer 实例切换回完整组件，保留页面 ID、实例位置、宽度和发送/停止原型；未配置态仍用 Empty 外观配配置提示。调整正确组件最小宽度约束，900px 窗口可用宽 620px 时控件完整。错误简化组件集 `177:7986` 已从 Components 页移除，页面与组件页均无其引用；API 仍能返回无 parent 的旧对象，不以非 null 误判为仍在画布。
- 深色聊天记录标题原继承默认 Sidebar 标签的固定黑色填充。已修复 `28:334` / `28:340`、`17:218` 及 Sidebar Main `46:897` 中历史区域的文字主题绑定/混合模式，同时覆盖页面 15 处“最近会话”区域，标题用 `color/text`，分段标签用 `color/muted`；现有显式覆盖也已替换。
- 验证：深色流式页 `179:11740` 与紧凑页 `181:12776` 截图检查通过，完整 Composer 控件和侧栏历史文字可见；13 处实例实际指向正确三态主组件，发送/停止导航重新绑定。更新交互说明 `181:12996` 与 Google 方案，应用源码未改。原始与简化方案的下方记录均属历史，以本节为准。

### 首页 Chat 与中转站模型配置 V1（2026-10-21，最新范围）

- **用户确认**：先完善设计；第一版只接首页 Chat，写作空间和创作空间的 Agent 暂不处理；模型设置只接中转站 API，官方 API 暂不做；对话采用用户右侧、Agent 左侧气泡，支持 SSE 流式输出。本轮仅 Figma、方案及项目记忆，无应用实现修改。
- **当前方案**：一个活动中转站连接，配置名称、Base URL、遮蔽 Key、接口协议、默认模型；获取模型或手动填写。协议稿提供 OpenAI 兼容 Chat Completions / Responses，实际支持以目标中转站联调为准。官方服务商切换旧稿保留隐藏，设置页 `8:53` 原位更新。测试与保存分开；成功测试仍“更改尚未保存”，保存后另有已保存稿。地址/模型/Key 均为示例。
- **Chat 页面**：[完整浅色](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=179-11487) `179:11487`，深色 `179:11572`；[流式浅色](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=179-11657) `179:11657`，深色 `179:11740`；等待 `179:11823`、停止浅色 `179:11906` / 深色 `181:12289`、中断 `179:11992`、未配置 `179:12078`；发送前 Ready `181:12092`，深色新对话 `179:12172`，900×640 稿 `181:12776`。原首页 `5:35` 换用 V1 Composer，旧主组件保留。
- **设置页面**：[中转站配置](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=8-53) `8:53`（1180×820，实际位置 -1690,-1171），深色 `179:12290`；未配置 `179:12564`、测试中 `179:12838`、成功未保存 `179:13112`、认证失败 `179:13386`、模型列表 `179:13660`、协议菜单 `181:12673`、已保存 `181:12390`。可用模型只是设计示例，并非已查询的服务列表。
- **组件**：Components 页新增消息组件集 `177:7847`（用户完成，Agent 等待/输出/完成/停止/中断）、Composer `177:7986`（Empty/Ready/Running/Unconfigured）、连接反馈 `177:8015`（Untested/Testing/Success/Error）。复用本地控件、Lucide 和主题变量，Noto Sans SC。V1 Composer 隐藏附件、权限、语音和未经能力确认的思考档位，保留上下文圆环、模型、发送/停止；宽度随内容区伸缩，不受旧 788px 最小值限制。
- **流式契约**：同一 Agent 气泡追加文字；停止/异常断流保留部分输出，异常可手动重发，不自动重试；消息区独立滚动，底部输入保持可见，用户上滚时不强制跟随，提供回到最新。SSE 由主进程/Pi 消费，再通过受限 preload 事件回传 renderer，不新增本机 HTTP 服务。交互说明稿 `181:12996`。Figma 仅状态演示，不是真实 SSE。
- **原型与验证**：示例建议→Ready→等待→流式→完成，停止到保留输出态；未配置去设置，测试→成功→单独保存，模型/协议菜单返回配置。已读取导航与状态变体，未在 Present 实际点击。完整浅深、停止、中断、未配置、菜单、认证失败/成功和紧凑稿已截图检查；修正消息行高度裁切、原生文字 LINEAR_BURN 深色对比度及小窗口输入宽度/侧栏设置入口。紧凑侧栏 `184:11083` 是专门脱离实例后适配的本地 Frame，内部控件仍为实例；消息/历史视口裁切用于滚动。
- **已验证边界**：22 张相关页面结构读取均为可编辑文字/矢量/组件，0 个可见 IMAGE 填充、字体均为 Noto Sans SC。完整节点/脚本记录在 `memory/figma-sync-2026-10-21/agent-v1-state.json`。已同步 [Agent方案](https://docs.google.com/document/d/1vhqRZOgR2JJ22RINUgMvDaAqsQEkbBxa2FvaJt3K1yc) 并回读核对。SDK 选型、真实中转站协议/模型和实现仍待确认/验证，未安装依赖、运行构建或应用测试。

### Pi Agent 方案审阅边界（2026-10-21）

- 已将接入研究写入 [Agent方案](https://docs.google.com/document/d/1vhqRZOgR2JJ22RINUgMvDaAqsQEkbBxa2FvaJt3K1yc) 并全文回读，用户 check 后再实现。方案建议首页对话先行，随后写作/画布只读助手；这些阶段与 SDK 选型均待确认，不视为新的 UI 实现授权。
- 现有 Composer 和写作助手节点仅根据本地设计记忆引用，本轮未读取或修改 Figma。完整会话页/历史列表、配置反馈状态和画布助手入口仍需设计验证；权限、思考强度与语音不能因已有视觉稿就宣称功能可用。应用实现未改，未运行构建/窗口测试。

### 写作空间基础 UI 已实现（2026-10-21）

- 用户已认可设计并授权开始基础代码。当前 `feature/writing-space` 完成写作入口、本地目录/文件树、目录下拉、搜索图标按需展开、新建文档/文件夹、多文档标签与保存、基础 Markdown 实时预览、大纲和侧栏布局。Figma 页面及组件 ID 保持不变。
- 代码保持既定层级：左右栏/标签栏同色，选中标签与编辑区同色并衔接，首个 Tab 无左侧空白，相邻 Tab 有细分隔符；工具栏 Lucide 图标统一 18px。左右侧栏可独立收起与拖宽，正文最大 680px，macOS 原生窗口控制不使用网页仿制圆点。右侧 icon Tab 为文章大纲/写作助手，助手无输入和发送入口。
- 文档切换保留编辑状态与撤销，保存失败/外部冲突显示可操作反馈，另存副本保护原磁盘内容；侧栏布局/宽度/右侧 Tab、最近目录和打开标签可恢复。实时预览基础覆盖标题、强调、引用和代码样式；图片/表格/任务框完整交互后续补充。
- 验证：检查/构建和完整 38 项 Electron 回归通过；最后样式收尾后，写作 4 项再次通过。浅深真实窗口截图已检查，路径见 engineering.md。当前是基础版实现，不将所有 Figma 设计或高级编辑交互标为已完成；未接入 Pi Agent，未改其他待实现的首页/用户名设计。
- 方案与实际实现状态已记录并回读：[Google 文档](https://docs.google.com/document/d/1w5ipoZlR4-9uYy8kAjLkDB46kuU_2VJYmbIfefZ-FS4)。本轮未提交或推送。

### 左右侧栏展开与收起对比（2026-10-21）

- **用户要求**：查看左右侧栏展开和关闭的 UI 效果。本轮仅做 Figma。
- 新增浅深色各四张独立 Frame，均 1440 × 900：左右展开、仅左展开、仅右展开、左右收起。布局是 Page 1 的两列四行，起点 (26000,-2482)，列间距 1640、行间距 1100；标题 `171:6796` 位于 (26000,-2572)。
- 页面对应：Light 左右展开 `171:6797`、仅左 `171:7041`、仅右 `171:7285`、两侧收起 `171:7542`；Dark 左右展开 `171:7799`、仅左 `171:8043`、仅右 `171:8287`、两侧收起 `171:8544`。链接格式沿用现有 Jarvis 文件。
- 左侧展开时宽 260，右侧展开时宽 280；收起后不保留迷你栏，由编辑区使用释放空间。编辑区宽度依次为 900 / 1180 / 1160 / 1440，正文均保持 680px 居中，避免长行。两侧不互相依赖。
- 左侧收起后，窗口控制和左侧栏展开按钮移到标签栏最左侧的 140 × 44 容器；这段空间用于窗口控制，不是空留白。右侧始终保留顶部右侧栏开关。文档标签、目录上下文和正文均保留。
- 新增 Lucide panel-right 本地主组件 `170:6979`（components 页，14580,280，SVG 来自项目 lucide-react 1.60.0）。此前标签栏右侧误用 panel-left 的 10 张写作页已同步更正为右侧栏图标；左右开关图形可区分。
- 八张稿各有左右两条导航，共 16 条独立切换原型；原浅深编辑页的左右开关也连入对应单侧收起稿。展开/收起仅为同主题设计页之间切换，不表示应用窗口已有此功能。
- **验证**：浅色四种组合和深色双侧收起稿截图检查通过，无控件遮挡或侧栏残余空白；八页结构读回为 Noto Sans SC、0 个 IMAGE 填充，窗口尺寸和正文宽度正确。未修改应用代码，未运行应用测试。

### 写作空间背景层级、Tab 衔接与图标统一（2026-10-21）

- **用户最新要求**：右侧栏背景与左侧栏相同，Tab 标签栏沿用该背景；选中 Tab 与 Markdown 编辑区同色，Tab 之间有分隔符。用户截图只作为层级参考，不照搬浏览器外观；同时修复搜索图标和其他操作图标大小不一致。
- 当前表面关系：左侧栏、右侧栏和文档标签栏统一绑定 `color/sidebar` `VariableID:5:4`；选中文档 Tab 绑定与编辑区相同的 `color/canvas` `VariableID:5:3`，透明未选中标签显示侧栏底色。该方案取代上一轮文档 Tab 独立灰底，仍保持中性色，不使用蓝色选中背景或底线。
- 用户后续要求去掉标签最左侧空白：8 张含文档 Tab 的状态页标签栏左内边距由 20px 改为 0，第一个 Tab 的 x=0，与编辑区左边缘对齐。两张无文档空态保留标题内边距。浅色编辑页截图检查通过。
- 文档标签主组件 Active `151:5684` / Inactive `159:6158` 改为 208 × 44，保留上方 8px 圆角，底角为 0；52px 标签栏下对齐，选中标签下沿与编辑区直接衔接。相邻标签间新增 1 × 20px 中性细竖线，位于 12 × 44px 对齐容器内。右端侧栏开关也用 44px 对齐容器，不再贴着栏底。
- 右侧栏组件四态 `158:5889` / `158:5928` / `158:5966` / `158:5998` 背景和顶部图标栏均改为侧栏背景；图标 Tab 的选中底色使用编辑区颜色，保持只显示 icon。
- 图标根因：新建文件/文件夹 SVG 的顶层 Frame 为 MIN/MIN，外层实例变小时内部 SVG 仍为 24px；搜索原图标已有 SCALE 约束。现已将 `162:6166` / `162:6172` 改为 SCALE/SCALE，内部线宽统一为 1.75（24px 原始视口），文件工具栏四个动作的图标及内部 SVG 均为 18 × 18，按钮仍为 28 × 28。没有仅改外框来冒充尺寸一致。
- 已同步全部 10 张写作状态页：原编辑/空态/助手稿与浅深搜索、目录菜单稿。8 张有文档标签的页面各有一个分隔符，两张无文档空态不添加无意义分隔符。
- **已验证**：浅深编辑页、浅色助手页与最终对齐后的浅色编辑页截图检查通过；逐页结构读取确认左右栏/标签栏背景 token 一致，选中 Tab/编辑区 token 一致；工具图标及内部 SVG 尺寸统一。未改应用代码。

### 写作侧栏目录切换与按需搜索（2026-10-21）

- **用户确认要求**：“我的写作”位置直接显示当前文件夹名称，下拉选择其他目录；移除重复的底部切换文件夹入口和“本地文件夹 · Writing”说明。搜索改为 icon，与新建文件、新建文件夹同处文件操作栏，点击才展开输入框。
- 原位更新 Sidebar Writing `146:5073`：当前目录行 `146:5089` 高 32px；隐藏原目录说明 `146:5098`、底部切换区 `146:5201` 和本地保存提示 `146:5206`；原常驻搜索 `153:5711` 改为默认隐藏，位于文件操作栏下方。共享 Sidebar 组件集新增 `Folder name#162:0` 文本属性、`Search expanded#162:4` 布尔属性；目录名不再是独立固定产品标题。
- 文件操作栏 `146:5115` 高 32px，包含“文件”标签和搜索、新建文件、新建文件夹、更多四个纯图标入口，动作主组件 `162:6176`，28 × 28，Icon 为 INSTANCE_SWAP。新增本地 Lucide file-plus `162:6165` / folder-plus `162:6171`，来源为项目 lucide-react 1.60.0 SVG。
- 新增本地 [目录下拉菜单](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=162-6217) 主组件 `162:6217`，在 components 页的写作组件区。包含当前目录“我的写作”、其他目录示例“工作笔记”“内容草稿”和“打开其他文件夹…”入口；当前项使用中性底色与“当前”提示。
- 原六张写作页同步为默认搜索收起与统一目录入口。未打开目录页 `149:6194` 顶部显示“打开文件夹”，不显示虚构当前目录名。
- 新增完整交互状态稿：浅色搜索展开 `163:6323` (18200,-282)、深色搜索展开 `163:6564` (19840,-282)、浅色目录菜单 `163:6805` (21480,-1382)、深色目录菜单 `163:7078` (23120,-1382)，均 1440 × 900。浅深编辑首页的目录名和搜索图标链接对应状态页，展开态再次点击搜索收起，目录菜单点击当前目录/标题关闭。
- **已验证**：默认浅色页、搜索展开页与浅深菜单页截图检查通过，无裁切/重叠，原中性文档标签和右侧图标 Tab 保持；四张新增页字体均为 Noto Sans SC，0 个图像填充。全部为可编辑 Figma UI，目录列表和操作为设计/原型示例，不表示真实目录选择、新建或搜索功能已实现；未改应用代码。

### 文档标签选中态使用中性色（2026-10-21，灰底方案已被上方层级修订取代）

- 用户反馈浅色模式无法辨认当前文档；随后明确否定蓝色背景，要求中性色区分。当前文档标签改为浅色灰底 `#E8EAED` / 深色灰底 `#41464D`、Medium 主文字色；未选中标签无底色、次要文字色。取消蓝色背景与指示底线。范围限于顶部文档标签，不扩大到文件树或右侧图标 Tab。
- 文档标签组件升级为 Active / Inactive 组件集 `159:6163`，Active 主组件保留 `151:5684`，Inactive `159:6158`；原蓝色指示线 `159:6162` 已隐藏。新增主题变量 `color/document-tab-active` `VariableID:160:6165`。
- 四张有文档的页面 `149:5790`、`149:5992`、`158:6135`、`158:6340` 的八个标签实例均同步；当前文档文字保留，清理历史文字透明度覆盖。对页面实例按当前浅深模式重新绑定对应中性底色与文字色，修复旧实例解析后缓存颜色造成的深色亮底问题。
- 浅深编辑页最终截图检查通过，当前标签与未选中标签区别清楚，深色文字可读。用户否定的蓝色试稿仅是中间状态，不再作为当前方案。未改应用代码。

### 写作空间右侧栏改为图标 Tab（2026-10-21）

- **用户最新要求**：右侧栏采用多 Tab，Tab 按钮只显示 icon，包含“文章大纲”和“写作助手”。该要求取代原上下分区布局。
- 右侧栏保留 280px 宽，顶部为 52px 图标栏：Lucide list-tree 表示文章大纲，message-square 表示写作助手；按钮 36 × 36，选中为主题选中底色，按钮内没有可见文字。内容区标题显示当前栏目名；一次只显示对应面板，大纲和助手各自占用完整高度。默认选中文章大纲。
- 已更新原四页 `149:5790` / `149:5992` / `149:6194` / `149:6378`。新增助手选中稿：[Light](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=158-6135) `158:6135`，位置 (21480,-2482)；[Dark](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=158-6340) `158:6340`，位置 (23120,-2482)，均 1440 × 900。助手继续为不可输入的占位，不实现对话。
- 本地主组件区在 components 页：[Right sidebar tabs](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=158-5871) `158:5871`，位置 (14900,100)。图标按钮集 `158:5888`，Active true/false，Icon 为 INSTANCE_SWAP；侧栏集 `158:6036`，Tab Outline/Assistant × Document Open/Empty 共四态：`158:5889`、`158:5928`、`158:5966`、`158:5998`。新增 Lucide list-tree 图标主组件 `158:5864`，SVG 来自项目 lucide-react 1.60.0。
- 四态内已配置四条 CHANGE_TO 切换动作，保持 Open/Empty 上下文；读回确认按钮栏可见文字节点数均为 0。图标悬停名称与无障碍名称已记录为实现要求，没有将说明当作已实现的 tooltip。
- 验证：浅深大纲选中态、浅色助手选中态和无目录空态截图检查通过，0 个整页图片填充，字体 Noto Sans SC；六张页面均保留可编辑文字/矢量/组件。原上下分区节点保留隐藏，未改应用代码。

### 设置侧栏顶部返回入口（2026-10-21）

- **用户要求**：设置页的“返回工作台”移到顶部，与写作空间一致。此前仅修改 Figma；本轮用户明确要求按 Figma 落实应用 UI。
- **应用当前状态**：实时读取 Sidebar Settings `48:874` 的设计上下文及截图，确认返回实例 `48:873` 位于窗口控制与设置标题之间。`Sidebar.tsx` 已将返回入口从 footer 移至顶部；按钮高 24px、左对齐、6px 图文间距、13px / 20px 次要文字色，复用本地 Lucide ChevronLeft（14px、1.75 描边）。移除设置页底部旧入口及空 footer；保留原返回逻辑，主工作台 footer 不变。
- **本轮验证**：`pnpm check`、`pnpm build` 与 diff 检查通过，真实 Electron 主题/设置返回回归 1/1 通过（1.7s），浅深色设置截图已对照查看。只实现本次返回入口，不调整其他已有设计差异；本轮未修改 Figma，现有节点 ID 不变，尚未提交或推送。
- 原位更新 Sidebar Settings 主组件 `48:874`：窗口控制 → 返回工作台 → 设置标题 → 分类列表 → 弹性留白。返回实例保留 `48:873`，从 y=776 移至 y=58，198 × 24、左对齐、Lucide 左箭头与次要文字色。
- 为消除旧按钮实例中浅深主题颜色覆盖，新增本地顶部返回主组件 `155:5696`（components 页，14500,100），将原返回实例 swap 到该主组件，实例 ID 不变。
- 模型服务 `8:53`、内网地址 `84:1221`、通用 `87:1353`、浅色下载 `114:4022`、深色下载 `114:4247` 共五页已读取确认顶部位置继承，均保留返回首页 `5:35` 的原型导航。
- 通用页与深色下载页最终截图检查通过，返回文字在浅深背景均清晰，无裁切或重叠；未改应用代码。

### 写作空间：本地 Markdown 实时预览（2026-10-21）

- **用户确认要求**：加入以本地目录为基础的 Markdown 写作空间；左侧为文件目录，右侧为标题导航与 AI 对话占位；编辑体验选择“实时预览”。本轮授权只做 Figma 设计稿，不写应用代码。
- **当前方案**：主侧栏新增“写作空间”，进入后切换为文件侧栏，保留返回工作台；三栏窗口 1440 × 900，左侧 260、右侧 280，中间自适应。正文最大 680px，默认 16px / 26px 行高，文档标题 30px。当前编辑标题露出 `##` 与光标，其余部分为排版后的正文，展示实时预览概念。
- 目录顶部显示当前文件夹名并提供目录下拉切换，文件操作栏含搜索、新建文件/文件夹与更多图标，搜索按需展开；文件夹与文档使用真实层级示例。中间包含多文档标签、路径、实时预览模式、正文与底部本地保存/字数/编码示意。右侧现已改为纯图标 Tab：文章大纲显示分级导航与当前章节高亮，写作助手显示不可输入的 AI 空态，无发送按钮。
- 页面（均在 Page 1）：[浅色编辑](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=149-5790) `149:5790`，位置 (18200,-2482)；[深色编辑](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=149-5992) `149:5992`，位置 (19840,-2482)；[未打开本地目录](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=149-6194) `149:6194`，位置 (18200,-1382)；[已打开目录、未选文档](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=149-6378) `149:6378`，位置 (19840,-1382)。
- 复用原 Sidebar 组件集 `48:1001`，新增 `Mode=Writing` 变体 `146:5073`；Main 变体中新增写作空间入口 `146:5207`，原 Main/Settings ID 保留。为不横向挤占已有组件，Writing 放在同一组件集下方；侧栏组件容器随之增高，未移动既有页面。
- 新增主组件集中在 components 页 [写作空间组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=146-5036) `146:5036`，位置 (13700,100)。文件行集 `146:5064`（File `146:5038`、Selected `146:5047`、Folder `146:5056`，Label 文本属性）；大纲行 `146:5065`；AI 占位 `146:5067`；文档标签 `151:5684`；主题适配搜索 `153:5705`。全部复用本地 Lucide、Noto Sans SC 和主题变量。
- 原型：原首页 `5:35` 中写作入口链接未打开目录页；“打开本地文件夹”在原型中跳至已打开目录的示例页，该操作不调用真实系统选择器；点击示例首篇文档可进入浅色编辑页；四页返回工作台链接首页。模式切换、大纲跳转、折叠/拖宽、编辑/搜索/保存与 AI 均未实现真实交互。
- **已验证**：四张页面、修订后浅深编辑稿、未选文档稿及新增入口首页均已截图检查。修复了多行正文高度导致的间距问题、文件标签分散、深色搜索白底/低对比度及未选文档错误高亮。最终结构读回：四页均为 Noto Sans SC，0 个 IMAGE 填充，保留可编辑文字、矢量和本地组件实例。
- **边界与待定**：目录、文件名、文章、字数与“已保存到本地”均为设计示例，不是读取或写入了用户本地文件。未实现编辑器、文件系统桥接或真实 AI。多目录切换、附件规则、自动保存/外部冲突处理、源码模式、快捷键与响应式尺寸为讨论方案，尚未完成实现与验收；不将整个 Obsidian 功能集视为已确认范围。

### 本轮画布 UI 已同步 Figma（2026-10-21）

- **用户授权范围**：同步本轮对话已实现的 UI 样式，覆盖引用候选/标签/预览、完整选中边界、可编辑节点名及默认名称、中心生成占位与完成角标移除、多选下载图标和数量。未扩展到旧记录中无关的导入/Excel/右侧栏工具栏或流程示例待办。
- 已原位更新图像主组件 `72:1093`、视频主组件 `72:1138`，保留 ID；Title 默认分别为“图像生成”/“视频生成”，新增框下名称、Selected 与 Generating 布尔属性；生成中使用中心图标和“正在生成…”覆盖预览，生成时应关闭 Downloadable。成功样例无“已完成”角标。上传资源组件集 `107:4050` 新增 Selected，3px 完整外框与选中底色，名称继续用 File name 文本属性。
- 已原位同步六种 Image/Nano/Video 普通和放大编辑主组件：`75:1358`、`77:1373`、`95:1842`、`95:1929`、`95:2086`、`95:2224`。引用标签可编辑，新增 Show mention menu 属性；候选编号固定单行、文件名结尾省略。普通面板引用区域没有上传加号，空态为静态媒体图标，有引用时为叠卡；放大面板保留原素材管理。
- 新增本地主组件集中在 components 页：[本轮画布控件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=136-4750) `136:4750`，位置 (12680,100)，最终 816 × 627。引用标签 `136:4752`、候选菜单 `136:4754`、多选工具栏 `136:4767`、名称 Display/Editing 组件集 `136:4786`、引用 Empty/Connected 组件集 `140:4998`。工具栏下载按钮仅含图标和可下载数量，保留选择数量和连接按钮。
- 已更新既有节点画布页 Light `72:1507` / Dark `72:1270`，展示完整选中边界、默认名称、生成中占位及精简多选工具栏；其余既有页面内组件实例继承主组件更新。新增 [浅色完整状态稿](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=139-4545) `139:4545`、[深色完整状态稿](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=139-4965) `139:4965`，各 1280 × 1366，位于 Page 1 (15200,-2482)/(16600,-2482)。媒体使用可编辑示意占位，未导入用户截图中的真实图片素材。
- **已验证**：最终浅深状态稿、组件总览、浅色既有画布与放大面板截图检查通过。已修正父容器导致外框裁切、候选菜单被裁切/底栏遮挡和上传资源选中底色层级；候选单行省略可见、选中四边完整。浅深状态稿各 48 个文字节点，字体均为 Noto Sans SC，各 54 个组件实例、0 个 IMAGE 填充、0 个“已完成”角标文本。沿用本地主题变量和 Lucide，所有 UI 为可编辑文字/矢量/组件。
- 节点 ID、各阶段工具结果及验证保存在 `figma-sync-2026-10-21/state.json` 的 `canvasUiSync`；脚本保存于 `figma-sync-2026-10-21/canvas-ui-scripts.json`，续传前先核对实际状态，不盲目重复运行。本轮仅更新 Figma 和项目记忆，未修改应用源码、未提交或推送。

### 多选下载按钮精简（2026-10-21）

- 用户要求下载按钮只显示一个下载图标和可下载数量，移除“下载可用文件”文字；前方“已选择 N 个节点”提示保留。
- 本地多选工具栏现为 Lucide 下载图标 + 裸数字，数字使用等宽排版；悬停提示“下载 N 个可用文件”，辅助技术保留完整操作名称和数量，下载期间通过禁用和 aria-busy 表示忙碌。
- 检查、构建、`git diff --check` 通过，相关真实 Electron 混合媒体批量下载回归 1/1 通过，截图确认按钮仅显示图标与数量，实际下载文件名和内容验证通过。实现时未修改 Figma；后续本轮已同步，见顶部记录。用户此前授权代码本地提交，未推送。

### 生成中占位与生成节点默认名称（2026-10-21）

- **用户确认要求**：生成中替换节点中心内容为“正在生成”占位，完成后不显示“已完成”角标；生成节点始终显示可编辑名称，下载使用该名称；新建图像/视频默认分别为“图像生成”/“视频生成”。
- 本地上传、提交、运行阶段统一在整个节点中心显示 32px 加载图标和 16px“正在生成…”文字，替换原空态或旧结果；重新生成时暂不显示旧预览和单节点下载按钮，任务完成/失败后恢复可用结果。失败/结果未知继续保留异常角标，成功不显示状态角标。名称和连接端口全程保留。
- 新建节点保存默认名称；已有项目缺少名称时通过统一 `mediaName` 规则显示默认名称，引用候选、单个/批量下载使用相同名称，不覆盖用户自定义名。点击名称编辑及持久保存规则沿用上一轮。加载图标在“减少动态效果”下静止。
- 已验证：检查、构建与针对生成/默认下载的窗口回归通过，覆盖首次生成、重新生成替换旧预览、完成无角标、默认名称下载与旧项目兼容；浅深生成中截图检查通过。代码实现时未修改 Figma；后续本轮已同步，见顶部记录。用户此前授权代码本地提交，未推送。完整真实 Electron 回归 35/35 同轮通过。

### 节点选中边界与名称编辑（2026-10-21）

- **用户确认要求**：画布选中状态需明显显示整个媒体节点边界；画布名称可编辑，修改后成为当前名称，下载使用该名称。
- 本地选中样式由 2px 描边增强为 3px 蓝色外描边，3px 间距与画布底色隔离环，并为完整 360 × 240 媒体区域补充选中底色，避免透明媒体/比例留白导致边界难辨。名称仍在媒体框下方；未选中保持无框，仅真正选中节点显示边界，关联节点仍不描边。
- 上传图像/视频/音频与图像/视频生成节点共用名称编辑：点击名称进入输入、自动聚焦并选中全文；Enter 或失焦保存去除首尾空白后的名称，Esc 取消；空白输入恢复原名，键盘保存/取消后焦点回到名称按钮。名称最多 100 字符，编辑时 Backspace/Delete 不删除节点，输入法组词中的 Enter 不提交。
- 名称保存到现有本地项目；生成节点名称为可选字段以兼容旧项目，未命名生成节点现显示“图像生成”/“视频生成”（后续要求见顶部记录）。改名同步引用候选、预览、单个与批量下载；下载扩展名按真实媒体类型处理，名称中的 `%20` 和 `.v2` 保留。历史请求账本不因节点改名重写。
- **验证**：检查、构建、`git diff --check` 通过；完整真实 Electron 回归 35/35 同轮通过，覆盖上传与生成节点改名、Enter/失焦保存、Esc/空白取消、编辑时防误删、重新打开项目后的名称恢复、实际单个/批量下载文件名和字节、选中区域完整底色及 3px 边界。浅深选中态截图已检查。后续本轮已同步 Figma，既有主组件 ID 保留，见顶部记录。

### 常规设置中的全局用户名（2026-10-21）

- **用户确认要求**：设置常规中增加用户名填写位置，用于应用内所有用户名展示；创作空间随生成请求上传的用户名除外，两者独立。本轮只做 UI，不修改应用代码或接入持久化。
- 沿用现有 Figma 分类名称“通用”，在主题上方新增“用户名”输入框，示例值 Hugo；说明为“用于首页问候、侧栏等所有用户名展示。不影响创作空间随请求上传的用户名。”首页和侧栏现有 Hugo 仍为同一示例，尚无真实联动。
- 主组件 [Jarvis / Settings / Display username](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=127-4725) `127:4725` 位于 components 页 (11640,1000)，620 × 116；复用 `Settings / Text field` `9:267`，输入实例 `127:4727`，使用 Value 文本属性。
- 已同步既有通用页 `87:1353`（实例 `127:4730`）、浅色下载设置页 `114:4022`（实例 `127:4735`）、深色下载设置页 `114:4247`（实例 `127:4740`）。保留原页面与主题、下载控件 ID；内容容器高度随新增区块从 470 调整为 618px，底部在页面内，无裁切。
- 验证：浅色通用页和深色设置页截图检查通过，输入与说明清晰、无重叠；Noto Sans SC、本地组件与主题变量保持。未修改创作空间的请求用户名设置。保存时机、空值规则等未在本轮扩展定义。

### Pi Agent 首页输入框设计（2026-10-21）

- **用户确认范围**：先做设计稿，不写应用代码；首页聊天输入框按用户截图的双层、大圆角样式，截图表示最小宽度，实际宽度随页面调整。未授权实现 Pi Agent 或真实语音/权限服务。
- **风格修订（2026-10-21）**：用户认可收紧比例并要求修改。三态组件、首页、宽屏页与状态总览已同步：圆角 36→24px、初始高度 198→152px、输入字号 22→18px、模型与思考强度 18→14px、发送/停止按钮 48→40px；阴影透明度降至 2.5%，模糊 10px、偏移 2px。保留双层结构、控件顺序和自适应宽度。首页及三态/宽度总览截图检查通过，未改应用代码。
- **当前设计方案**：上层输入，下层为添加附件、Agent 权限、弹性留白、上下文圆环、模型与思考强度、语音、发送/停止。占位文案为“和 Jarvis 一起工作”。第二个图标解释为 Agent 权限、模型旁“中”解释为思考强度，均是本轮设计假设，尚待用户确认。
- 首页原节点 [5:35](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=5-35) 已更新，输入实例 `122:4156`；旧输入框 `6:109` 保留但隐藏。首页保持 1280 × 820，输入框实际宽 952、初始高 152。主区左右 48px 留白，FILL、自适应居中，当前最小 788、最大 1120px、圆角 24px；这些像素值是本轮方案，不是用户明确指定的数值。
- 新增 [1600px 宽屏首页](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=122-4390) `122:4390`，位置 (13400,-2482)，输入实例 `122:4408` 宽 1120。
- 主组件位于 components 页：[Jarvis / Agent Composer](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=121-4438) `121:4438`，Empty `121:4335`、Ready `121:4370`、Running `121:4405`。空输入禁用发送；可发送为蓝色圆形上箭头；运行中为蓝色圆形停止按钮。复用原上下文环变体；用量仍不直接显示数字。
- [尺寸与状态总览](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=122-4208) `122:4208`，位置 (12000,-2482)，展示 788px 三态和 1120px 运行态的组件实例。新增本地 Lucide mic `121:4327`、shield `121:4332`，SVG 来自项目 lucide-react 1.60.0；复用 plus、arrow-up、chevron-down。新增 radius/composer 变量 `VariableID:121:4325` 与 Jarvis/composer 阴影样式。
- **已验证**：原首页、宽屏首页和总览均已截图检查，文字完整、无控件重叠；结构读取确认 Noto Sans SC，三处均无图像填充，文字与矢量可编辑。这里只交付 Figma 设计，未修改应用代码，未运行应用检查或声称功能接通。模型名称为截图对应示例，不代表当前服务能力。

### Prompt 中的素材引用（2026-10-21）

- 2026-10-21 截图缺陷修复：`@` 候选行的编号禁止压缩与换行，文件名单行省略，悬停显示完整名称。普通编辑面板左侧取消上传加号，无参考时为静态媒体占位；有参考时按与候选一致的顺序/去重规则显示堆叠缩略图和数量，包含直接连入的上传资源与生成结果，点击放大查看。放大面板保留原有本地素材添加/删除，同时展示连入资源；连入资源通过画布断开连接移除。未扩展生成服务或修改 Figma。
- 验证：`pnpm check`、`pnpm build`、`git diff --check` 通过，完整真实 Electron 窗口回归 35/35 同轮通过；新增长中文文件名布局、实际缩略图加载、候选插入、放大查看及断线计数回归，浅色候选与深色放大面板截图检查通过。URL 预览沿用现有 `jarvis-media` 安全协议，不开放 renderer HTTP 访问权限。

- 用户要求图像和视频节点在 Prompt 中用 `@` 引用素材，并以高亮标签显示；实际生成请求写为 `<<<image_1>>>`、`<<<video_1>>>`、`<<<audio_1>>>`，编号对应各自上传数组的顺序。
- 本地编辑面板现已提供 `@` 素材候选，覆盖面板参考素材和连入节点；用户看到 `@image_1` 等标签，保存的 Prompt 保持可编辑文本，提交前按最终图片、视频、音频数组顺序转换并校验编号。面板素材删除或增减时，现有标签位置同步调整；图像节点仍遵守既有规则，只接受图片参考。
- 此前仅修改本地实现；Prompt 标签与候选菜单现已同步 Figma，见顶部本轮同步记录。真实 Electron 窗口截图确认标签可见；检查、构建和完整 33 项窗口回归同轮通过。

### 画布框选与批量操作（2026-10-21）

- 2026-10-21 用户进一步明确高亮范围为当前节点的直接上下游：移除递归追踪，仅高亮以当前节点为起点或终点的边，关联节点继续无高亮。检查、构建、直接邻接逻辑测试和真实窗口连线测试通过；Figma 未修改。
- 2026-10-21 用户要求上下游高亮只作用于连线：已移除关联节点的高亮 class 和描边规则，保留实际选中节点轮廓（原 2px，后续增强为 3px，见顶部记录），避免与框选状态混淆。检查、构建和 3 项相关真实窗口回归通过，验证关联节点无描边、蓝色蚂蚁线保留、半面积框选正常；本轮未修改 Figma。
- 2026-10-21 框选判定更新：覆盖节点面积至少 50% 即命中，拖动过程中实时更新，支持反向框选和缩放/平移后的坐标换算。框选只选择节点，忽略关联连线，修复完整框住有连线节点时被连线选择回调清空的问题；单独点击或键盘选择连线删除仍保留。检查、构建、相关 10 项回归同轮通过（含 49% / 50% / 100% 边界、正反向、只覆盖连线及框选不弹编辑器）；本轮未修改 Figma。
- 用户要求框选多个节点、框选时不弹编辑面板、编辑面板打开时加入轻微动画；多选后可把整组节点连接到一个指定节点，也可一起下载已完成的图片、视频、音频。
- 本地画布已实现多选操作栏：显示选中数量，选择“连接到节点”后点击目标节点；连接沿用既有类型、去重、循环和参考数量限制，整组校验通过才写入。批量下载逐个使用现有原生保存流程，未有 URL 的节点跳过并显示汇总；音频资源可下载。普通点击仍打开单节点编辑面板，框选不打开；面板用 180ms 淡入，减少动态效果时禁用。
- 本轮只修改本地实现，尚未同步 Figma。既有 Figma 画布页面和组件节点 ID 见下文；多选操作栏与批量下载尚无对应 Figma 节点。检查、构建及 32 项真实 Electron 窗口回归同轮通过。

### 下载功能已同步到页面（2026-10-21）

- 用户要求设计稿增加下载。连接已恢复，已先检查 Page 1 实际状态：此前失败的页面调用没有留下 Workflow 或下载设置页面，原通用页也尚无下载区块。
- 已更新既有浅色画布 `72:1507` 和深色画布 `72:1270`：图像节点 `72:1534` / `72:1297`、视频节点 `72:1535` / `72:1298` 开启原主组件的 `Downloadable` 属性，结果示例显示“生成的图像 / 视频 · URL”，右上角显示 Lucide 下载按钮；空节点默认隐藏下载的主组件规则保留。
- 原通用页 `87:1353` 的内容区 `87:1544` 新增下载设置实例 `114:4005`，使用已有主组件的未配置状态。新增完整设置页：[Light / 目录已配置仍提醒](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=114-4022) `114:4022`、[Dark / 不再提醒直接保存](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=114-4247) `114:4247`，位置分别 (9640,160)、(10980,160)，1180 × 820；下载区块实例分别为 `114:4086`、`114:4311`。
- 保持本地实例、Noto Sans SC、主题变量与可编辑文字/矢量，没有整页图片。浅色画布下载入口和浅深设置页截图检查通过，无裁切或重叠。目录文字仍为设计示例，没有更改应用默认目录。
- 仅下载相关页面同步完成；此前的导入/Excel/右侧栏工具栏和连线流程展示仍待续，不将其标为已完成。所有返回 ID 已补入 `figma-sync-2026-10-21/state.json` 的 `downloadPageSync`，旧续传脚本执行前需再次核对并跳过已有下载页，避免重复创建。

### 下载设置异常反馈补充（2026-10-21）

- 后续实测定位根因并修复：开发 URL 末尾 `/` 不一致导致合法 IPC 被拒绝，真实窗口显示“请求来源不可信”。规范化可信 URL 后，已用原生窗口验证目录按钮启用、目录选择窗口成功打开、取消后恢复。未更改用户默认目录；下载/生成相关 7 项回归通过。此前“未检查窗口”的限制已被本轮实际验证取代。Figma 页面同步状态仍独立待续。
- 用户反馈无法点击选择文件夹。下载设置增加同步读取错误的捕获；主进程/preload 接口缺失时显示“下载接口尚未加载，请完全退出应用并重新运行 pnpm dev”，保留重试按钮，不再静默禁用。
- 生成图像和视频有结果 URL 时，右上下载入口已在代码及构建产物确认存在。未读取到用户正在运行的窗口；窗口自动审批 HTTP 403，不能宣称现场问题已复现。当前进程需重启以加载主进程/preload 更新，详见工程记忆。
- 本轮未修改 Figma；之前页面同步的 HTTP 403 限制仍保留。

本文件记录本项目的设计要求、Figma 位置、设计变更和未决事项。后续设计工作先读本文件，再检查 Figma 实际状态；如两者不一致，以用户最新要求和实时文件为准。

## 项目与设计范围

- 项目目录：`/Users/hugo/Developer/my-jarvis`。
- 仓库：<https://github.com/qianyuzhao-ai/Jarvis>。
- 产品名使用 **Jarvis**。方案文档沿用 **Pi Workbench** 名称，尚未统一改名。
- 产品定位：以 AI 对话、文件读取和工具调用为核心的个人工作台；先自用，再公开发布，也作为求职作品。
- 2026-10-20 用户授权搭建本地基础工程，并明确暂不引入 Pi Agent 相关工具。现已实现 React Flow 创作空间、项目列表、浅深主题、无框节点与独立编辑面板；其他 Figma 页面按任务范围逐步实现。Figma 中出现的按钮、配置和状态不代表功能已实现；工程状态见 `memory/engineering.md`。
- 用户已要求绘制首页和设置页，并指定所有主组件集中存放的位置。
- 用户新增 AIGC 创作空间：侧栏入口切换到项目列表，一个项目对应一张独立的无限画布，画布技术指定为 React Flow。已完成入口、项目列表、浅深画布及节点设计，并已在本地接入 React Flow 基础交互。
- 用户明确纠正：**给 Sidebar 做变体，不是给首页做变体。** 首页、项目列表和设置页保持独立 Frame；侧栏统一为一个本地组件集。
- 当前页面是已交付的第一版设计，不等于用户已经确认全部视觉细节。

## 方案中的设计约束

- 初始方案为 macOS 桌面端，最低支持 macOS 26，以 Liquid Glass 设计语言为方向。
- 用户已考虑未来 Windows 版本，并因此决定统一使用 Lucide 图标、将已用官方组件取消远程关联。当前仍是现有桌面页面的设计调整，尚未实现或确认 Windows 版开发排期；独立网页端与 iOS 尚未开发。
- 视觉应接近 macOS 应用：克制的层级、浅色窗口、轻透侧栏、清晰的文字与控件。
- 优先考虑键盘操作、VoiceOver、Reduced Motion 和可读性。这些是设计与实现目标，尚未完成实际无障碍验收。
- 设计 token 驱动界面；后续代码按需引入和改造 shadcn，不全量导入组件。
- Figma 中保留可编辑文字、矢量、自动布局和组件实例，不能用整页截图代替 UI。
- Figma Variables 到代码的同步、Code Connect、Storybook 均为方案目标，目前尚未接入。
- 画布中的材质与阴影只是设计表达，不代表已验证 Electron 能实现对应原生效果。

## Figma 文件与组织规则

文件：[Jarvis](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis)

文件 Key：`mIwnyR5nAlECFMam1NvmER`

| 用途 | 页面或节点 | 链接 |
|---|---|---|
| 界面页面 | `Page 1`，`0:1` | [界面页面](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=0-1) |
| 首页 | `Jarvis / 首页 / 新对话`，`5:35` | [首页](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=5-35) |
| 设置页 | `Jarvis / 设置 / 模型服务`，`8:53` | [设置页](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=8-53) |
| 创作空间项目列表 | `Jarvis / AIGC 创作空间 / 项目列表`，`42:625` | [项目列表](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=42-625) |
| 主组件页面 | `components`，`2:104` | [组件库](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=2-104) |
| 首页组件组 | `Jarvis / 首页组件`，`5:36` | [首页组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=5-36) |
| 设置组件组 | `Jarvis / 设置组件`，`8:54` | [设置组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=8-54) |
| 控件样本与适配组件 | `Jarvis / 控件样本与适配`，`17:104` | [控件样本](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=17-104) |
| 本地控件主组件 | `Jarvis / 本地控件`，`25:326` | [本地控件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=25-326) |
| Lucide 图标 | `Lucide / Icons`，`26:330` | [图标组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=26-330) |
| 上下文用量交互状态 | `Jarvis / Context usage / 交互状态`，`38:508` | [默认与悬停状态](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=38-508) |
| 创作空间组件 | `Jarvis / 创作空间组件`，`41:518` | [创作空间组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=41-518) |
| Sidebar 组件集 | `Jarvis / Sidebar`，`48:1001` | [侧栏变体](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=48-1001) |

**用户明确要求：用到的主组件都放在 `components` 页面。** 新增主组件也遵循这个位置，界面页面使用实例。

- 最新要求：优先使用 macOS 26 UI Kit 的本地副本；已有官方衍生本地主组件优先复用，缺失时从官方复制并本地化。统一使用 Lucide 图标、Noto Sans SC，允许为中文与浅深色做必要适配。
- 页面使用本地主组件的实例，保留本地复用关系；不要重新引入 Apple 远程实例或 SF Symbols 字符。
- 本地化组件保留来源说明。取消远程关联不改变原素材许可，也不代表已完成 Windows 素材授权审查。
- 修改前读取目标节点、现有组件和样式，优先复用。
- Sidebar 的 Main 和 Settings 是侧栏布局变体，不是整页变体。不要创建 `Home` 组件集，也不要把设置分类移到主内容区来实现这个要求。
- 普通组件整理应保留节点 ID；用户明确要求的远程组件本地化可以创建新主组件并重接实例，但必须恢复文字、状态、尺寸和本地属性绑定。
- 不擅自改变用户调整过的页面位置或已有内容。
- 本项目禁止批量删除文件或目录；需要批量清理时交由用户手动处理。

## 已完成的页面

### 首页：新对话

- 窗口尺寸：`1280 × 820`。
- 主内容区 `6:91` 的左上、左下圆角为 16px，窗口底色与侧栏一致，让主内容的左侧圆角可见；右侧仍由窗口外轮廓控制。
- 左侧：窗口控制、Jarvis 名称、新对话按钮、AIGC 创作空间入口、按时间分组的历史会话、用户与设置入口。本轮实时读取时侧栏中已无会话搜索，保留现状，不按旧记录恢复。
- 用户认为旧的新对话灰色选中条不好看，已改为白底细描边操作按钮：40px 高、10px 圆角、Lucide square-pen 图标、右侧 ⌘ N 提示，主组件 `41:535`。在侧栏中横向 FILL，230px 侧栏默认内宽为 198px；主组件原始宽度 228px 不作为页面内的固定宽度。当前按钮为共享 Sidebar 内的嵌套实例，不再使用原实例 ID `6:38`。
- 首页侧栏实例为 `49:648`，引用 Sidebar 的 Main 变体。创作空间入口为 `I49:648;46:777`，默认无底色，点击切到项目列表 `42:625`；旧入口 `42:610` 已随原侧栏替换。
- 首页已加入点击收起/展开侧栏的原型。默认展开，收起后主内容铺满窗口，输入框按本轮 Pi Agent 方案随主区伸缩、最大 1120px 并居中；窗口控制和展开按钮在收起态显示于主内容工具栏左侧。
- 主区：欢迎语、输入区、添加文件图标按钮、上下文占用圆环、模型选择、发送按钮、开始建议和键盘提示。
- 用户明确要求：模型选择左侧显示模型上下文占用圆环；添加文件使用 icon button，不显示“添加文件”文字按钮。
- 输入操作行已由本轮 Pi Agent 方案替换：添加附件 → Agent 权限 → 弹性留白 → 上下文占用 → 模型与思考强度 → 语音 → 发送/停止。
- 最新要求：默认只显示上下文圆环，不在输入栏显示百分比或其他数字。悬停显示详细面板，包含已用 token、总容量、剩余空间和占用比例。
- 当前首页为新对话空圆环示意；数字只在详情面板中出现。未知用量使用虚线环，面板明确标为未知，不能当作 0%。
- 开始建议：梳理一份资料、推敲一个想法、把讨论变成计划。
- 当前输入框为空，发送按钮按未输入状态展示。
- 历史会话、用户名和模型名称是设计示例，不是从用户实际会话或账号读取的数据。

### 设置页：模型服务（旧稿，已由上方中转站 V1 取代）

- 窗口尺寸：`1180 × 820`。
- 设置详情区 `9:370` 同步使用左上、左下 16px 圆角，保持与首页相同的内容表面处理。
- 左侧分类：通用、模型服务、文件与权限、MCP 连接、Skill、数据与隐私、关于 Jarvis；主题选择已迁入通用。
- 左侧整体为 Sidebar 的 Settings 变体实例 `49:1029`，保留原分类布局；没有迁移成顶部标签，也没有将设置页做成首页变体。
- 详情包括服务商切换、添加服务商、API Key、接口地址、测试连接、默认模型、取消与保存。
- API Key 默认遮蔽；测试连接和保存更改是不同操作。
- 默认模型说明限定为“新对话使用此模型，已有对话不受影响”。
- “已配置”“尚未测试当前配置”“更改尚未保存”都是设计状态，不代表真实服务已连接或保存。
- 首页及项目页底部设置入口已连到本页，设置侧栏“返回工作台”已连到首页；分类切换、输入、保存和连接测试仍未接通原型。

### AIGC 创作空间：项目列表

- 窗口 `42:625`，尺寸 `1280 × 820`；主内容 `43:544`，沿用左侧 16px 圆角。
- 页面与首页引用同一个 Sidebar Main 主组件，实例为 `49:890`。嵌套创作空间入口 `I49:890;46:777` 呈浅蓝选中态；新对话按钮 `I49:890;46:776` 点击返回首页。原入口 `42:635` 和按钮 `42:634` 已随原侧栏替换。
- 主内容包括“我的项目”标题、新建项目按钮、搜索项目、最近编辑排序和紧凑项目列表。
- 列表 `43:595` 展示画布结构缩略示意、项目名称与描述、节点数量、最后编辑时间、更多操作入口。
- 当前 4 个项目均为设计示例：播客片头视觉探索、人物一致性测试、产品短片分镜、下期播客封面；缩略图和节点数量不是实际项目数据。
- 用户明确的产品模型为“一个项目 = 一张独立无限画布”。React Flow 是后续实现要求，不出现在面向用户的界面文案中。
- 本轮只设计入口与列表，未绘制画布编辑页；项目行打开画布、新建项目、搜索、排序及更多操作尚未接通原型或真实功能。
- 已回读验证首页到列表、列表到新对话的两条原型连线；尚未用真实鼠标在 Present 模式中走查。

## 组件清单

### Sidebar 复用与变体

- 组件集：`Jarvis / Sidebar`，`48:1001`，位于 `components` 页的 `Jarvis / Sidebar components`（`46:737`）中。
- `Mode=Main` 主组件 `46:897`，默认尺寸 230 × 820，供首页和创作空间共同引用。创作空间选中状态通过嵌套入口的 State 属性覆盖，不复制整份侧栏。
- `Mode=Settings` 主组件 `48:874`，默认尺寸 230 × 820，供设置页引用，保留设置分类与返回工作台入口。
- 用户明确指定：展开态最小宽度 230px，默认使用最小宽度 230px。最大宽度当前按设计建议设为 320px，用于避免挤占主内容；320px 是建议值，不是 Apple 规范要求或用户另行指定的数值。
- 两个主组件及三页实例均设置 minWidth=230、maxWidth=320；内部按钮、标题容器、列表和底部区域横向自适应。组件描述及可见说明区 `60:1022` 均记录了宽度规则。
- 宽度 token：`size/sidebar/min`（`VariableID:60:1020`）和 `size/sidebar/max`（`VariableID:60:1021`），位于原 Jarvis 设计变量集合，Light/Dark 值相同。
- 项目页与设置页的主内容、表单和表格调整为 FILL，以适应 230–320px 的侧栏范围；已验证 320px 时关键内容没有横向溢出。Figma 尺寸约束已在本地实现为可拖动分隔线，范围 230–320px。
- 组件集暴露 `Mode` 和 `User name` 属性；主导航态的创作空间及设置入口是可编辑的嵌套实例。
- 页面映射：`5:35` → `49:648` → Main；`42:625` → `49:890` → Main；`8:53` → `49:1029` → Settings。
- 两个 Main 实例的设置按钮分别为 `I49:648;46:898`、`I49:890;46:898`，点击进入设置页；设置页返回入口 `I49:1029;48:873` 点击回到首页。
- 三张页面的 Frame ID、尺寸、画布位置和主内容均保留。原侧栏 Frame `6:26`、`42:626`、`9:273` 已被组件实例替代，旧侧栏内节点 ID 不再作为定位依据。
- 曾误建的 `Jarvis / Home` 组件集已按用户纠正删除，组件库中没有 Home 页面变体。后续不要恢复该结构。

### 首页侧栏收起/展开

- 没有创建首页组件变体，也没有复制一张收起态页面。原首页 Frame `5:35` 通过本地交互变量切换显示状态。
- 变量集合 `Jarvis / 首页侧栏交互`，ID `VariableCollectionId:53:1011`，模式 Expanded `53:0`、Collapsed `53:1`。默认模式为 Expanded，交付时首页没有强制指定模式。
- 变量：sidebar/visible `VariableID:53:1012`、titlebar/show-window-controls `VariableID:53:1013`、sidebar/width `VariableID:55:808`、titlebar/window-controls-width `VariableID:55:809`。
- 首页侧栏实例 `49:648` 保留，放在新的容器 `57:798` 中。可见性与占位宽度绑定在容器上，不能直接绑定实例可见性：本轮发现直接隐藏实例后，连接器可能在恢复模式时丢失可见性绑定。
- 同时控制容器可见性与宽度，避免隐藏内容后仍保留空白占位。侧栏展开默认占 230px，交互变量 sidebar/width 的 Expanded 值已同步为 230；Collapsed 值仍为 0。不要把 230px 最小宽度加到收起容器上。收起时主内容从 x=1 开始、宽 1278px，填满 1280px 窗口的边框内区域。
- 主内容 `6:91`、工具栏 `6:92`、对话区域 `6:104`、底部说明 `6:157` 改为横向 FILL。聊天内容列及输入框仍固定 680px，不随窗口拉伸成过长行。
- 新增本地切换按钮组件集 `Jarvis / Sidebar toggle`，`53:1024`；Collapse `53:1014`、Expand `53:1019`，尺寸 30 × 30，使用 Lucide panel-left。
- 首页收起按钮为 `I49:648;53:1025`；收起态工具栏组 `54:1053` 包含窗口控制和展开按钮 `54:1058`。展开时该工具栏组隐藏且不占位。
- 两个按钮分别通过 ON_CLICK → SET_VARIABLE_MODE 切换 Collapsed / Expanded。此次为即时状态切换，没有添加动画时间线。应用实现阶段仍需补键盘操作及无障碍提示。
- 只给首页绑定了收起/展开事件。项目列表与设置页未接入这一交互，不因共用 Sidebar 自动获得对应原型行为。
- 验证：检查两个状态截图，并通过“切到收起 → 恢复默认展开”的完整变量模式循环回读位置、可见性、绑定和导航。展开后收起按钮及创作空间/设置导航仍存在。未用真实鼠标在 Present 中走查。

首版创建了以下 17 个本地主组件。此表保留节点记录，不代表全部仍用于当前页面；当前使用情况见下方迁移记录。

| 分组 | 组件 | 节点 ID |
|---|---|---|
| 首页 | Sidebar / Conversation | `6:2` |
| 首页 | Sidebar / Selected | `6:6` |
| 首页 | Starter / Row | `6:12` |
| 首页 | Button / Icon | `6:21` |
| 设置 | Settings / Navigation row | `9:229` |
| 设置 | Settings / Navigation icon | `9:230` |
| 设置 | Settings / Icon / model | `9:241` |
| 设置 | Settings / Icon / appearance | `9:245` |
| 设置 | Settings / Icon / folder | `9:249` |
| 设置 | Settings / Icon / plug | `9:252` |
| 设置 | Settings / Icon / skill | `9:255` |
| 设置 | Settings / Icon / data | `9:259` |
| 设置 | Settings / Icon / info | `9:263` |
| 设置 | Settings / Text field | `9:267` |
| 设置 | Button / Secondary | `9:269` |
| 设置 | Button / Primary | `9:271` |
| 设置 | Settings / Provider | `9:378` |

并非所有独立界面元素都已组件化。后续发现需要复用的元素时，再提取为主组件并放入组件库页面。

### 历史：迁移到 macOS 26 官方组件

以下记录保留官方来源和迁移过程，已被后续“本地控件 + Lucide”决定取代。首页与设置页的根节点 ID、窗口尺寸和画布位置保持不变，但当前已无远程实例关联。

| 官方组件 | 用途 | 已导入组件集 ID |
|---|---|---|
| Window Controls/Standard | 两页窗口控制 | `12:131` |
| Item | 会话列表、设置分类、新对话选中态 | `14:113` |
| Search Field | 搜索对话、搜索设置 | `14:290` |
| Push Button | 测试连接、取消、保存、添加文件、添加服务商、返回工作台 | `14:627` |
| Text Field | API Key、接口地址 | `14:915` |
| Pop-Up Button | 首页模型选择、设置默认模型 | `14:939` |
| Segmented Control | Anthropic / OpenAI 服务商切换 | `14:1043` |
| Window/Button | 工具栏更多操作、禁用发送按钮 | `14:976` |

- 本地适配主组件 ID `17:218` 保留，当前改名为 `Jarvis / Sidebar row`。内部仍叫 `Native Item` 的层已改接本地默认或选中组件，不再关联官方库。
- 对话 `17:214`、新对话 `17:217` 及旧设置图标主组件保留 ID，内部图形已替换为 Lucide 实例。
- `Starter / Row`（`6:12`）继续使用，内部文档和箭头图标已替换为 Lucide；聊天输入容器及上下文占用圆环保留本地设计。
- 已不再用于当前两页的旧主组件：`6:2`、`6:6`、`6:21`、`9:229`、`9:267`、`9:269`、`9:271`、`9:378`。它们保留在原组件组中作为首版记录，不应在后续页面继续选用。
- 两页中部分被替换控件取得了新 ID；修改时从现有页面结构定位，不沿用首版控件 ID。
- 侧栏适配实例应使用横向 `FILL`，避免设置页 200 宽容器中继承 228 宽组件而裁切。
- 发送按钮保持官方 XL 的 `36 × 36` 尺寸；输入操作行同步使用 36 高度。

### 当前本地控件

| 本地主组件 | 节点 ID |
|---|---|
| Jarvis / Window controls | `28:330` |
| Jarvis / Sidebar / Default | `28:334` |
| Jarvis / Sidebar / Selected | `28:340` |
| Jarvis / Search field | `25:327` |
| Jarvis / Button / Secondary | `28:361` |
| Jarvis / Button / Primary | `28:367` |
| Jarvis / Text field | `28:373` |
| Jarvis / Model selector | `28:381` |
| Jarvis / Provider switch | `28:392` |
| Jarvis / Icon button / More | `28:411` |
| Jarvis / Icon button / Send disabled | `28:425` |
| Jarvis / Icon button / Add file | `28:438` |
| Jarvis / Button / Text | `28:451` |

- 上述控件已移除嵌套远程实例、远程变量绑定和远程样式依赖；页面继续通过本地实例复用。
- 本地化时须显式重建文字和布尔属性绑定。远程变体单独克隆后，属性定义及绑定可能不保留，不能只检查 `componentProperties` 的值。
- 中文按钮文字使用自动宽高，不沿用英文默认标签的固定宽度，否则会出现换行或裁切。
- 图标按钮改为轻底色、8px 圆角的本地控件，移除原有玻璃效果；保持现有操作顺序和窗口布局。

### 创作空间与侧栏新增组件

| 组件 | 节点 ID |
|---|---|
| Jarvis / New conversation button | `41:535` |
| Jarvis / Creation space entry | 组件集 `41:559`，Default `41:543`，Selected `41:551` |
| Jarvis / New project button | `41:560` |
| Jarvis / Project list row | `41:566` |
| Lucide / square-pen | `41:520` |
| Lucide / layout-grid | `41:524` |
| Lucide / workflow | `41:530` |

- 主组件均在 `components` 页的 `41:518` 内，没有引入远程组件或 SF 字体。
- 项目行具有 Title、Description、Node count、Updated 文字属性，后续实例修改使用属性覆盖。
- 两类操作语义保持区分：新对话是创建动作，用独立按钮；创作空间是页面导航，用默认/选中状态。

### 聊天输入区组件

- 附件按钮主组件：`Jarvis / Add file`，`22:313`；首页实例 `22:336`。内部改接本地 `28:438`，使用 Lucide `plus`，尺寸 `36 × 36`。
- 上下文占用组件集：`Jarvis / Context usage`，`22:335`；首页实例 `22:343`，紧邻模型选择左侧。
- 圆环组件为 Jarvis 自定义容量指示器。已检索的 macOS 官方 `Determinate` 为横向进度条，未用它替代用户要求的圆环，也未用不确定进度动画表达占用。
- 圆环直径 20，图标控件整体改为 `36 × 36`。默认百分比文字已隐藏，轨道使用 muted 颜色以保证仅图标时仍可辨认。
- 组件集保留 ID `22:335`，增加 `State=Default / Hover`；Usage 仍为 Empty、Used、Unknown。
- Default 变体：Empty `22:322`、Used `22:326`、Unknown `22:331`。Hover 变体分别为 `38:514`、`38:546`、`38:580`。
- 悬停面板尺寸 `288 × 228`，12px 圆角，位于圆环上方，右侧与控件对齐。内容包括模型名、百分比、已使用、总容量、剩余空间，以及系统指令/消息/工具结果的计入说明。
- Empty 的 `0 / 200,000`、Used 的 `50,000 / 200,000` 是设计示例，不代表所选 Claude Sonnet 的真实配置或实时用量；Unknown 显示未知状态及 `—`。
- 交互组件集已移到 `components` 页的状态展示区 `38:508`。原展示行 `22:312` 保留附件主组件和三个默认圆环实例。
- Figma 原型已配置：默认态 `ON_HOVER` 或 `ON_CLICK` 切换为对应 Hover；Hover 态 `MOUSE_LEAVE` 或再次点击返回默认。首页交付时恢复为 Empty / Default。
- 为防止面板裁切，输入操作行、Composer、首页内容列和开始对话容器允许内容溢出；主内容区仍保留圆角裁切。
- 验证方式：回读交互连线，并在首页强制切换 Hover / Default 检查截图；尚未通过真实鼠标在 Present 模式中走查，也没有接入实时数据。
- 后续应用实现仍需支持键盘聚焦、Escape 关闭和“上下文用量”无障碍名称。附件按钮的提示及文件选择功能尚未实现。

## 视觉基础与当前限制

### AIGC 无限画布设计（2026-10-20）

- 用户明确要求先做设计稿，参照所附截图的深色无限画布；顶部改成「图像」「视频」两个按钮。本轮没有修改应用代码或安装 React Flow。
- 新页面：[Jarvis / AIGC 创作空间 / 无限画布](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=67-918)，节点 `67:918`，在 `Page 1`，位置 (3266, 160)，尺寸 1440 × 900。
- 设计为默认空画布：18px 窗口圆角，60px 顶栏，中性深灰背景、24px 间距点阵；左上窗口控制、返回和「未命名项目」；顶部中央为图像 / 视频独立按钮；左下为缩小、100%、放大、适应视图，右下依次为缩略图显示、背景点阵显示、磁力吸附三个开关。
- 浅色版本：[无限画布 / Light](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=70-952)，节点 `70:952`，位置 (4946, 160)，尺寸 1440 × 900，位于深色稿右侧。两版共享组件和布局；浅色采用近白画布、浅灰顶栏、白色控件与深色文字图标。原深色节点 `67:918` 保留，并加上 Dark 名称后缀。两版截图检查通过，浅色无缺失字体；项目列表的新建入口仍进入原深色画布。
- 当前画布不显示 Sidebar，以画布空间为主。返回项目列表可回到既有工作台导航；本轮没有改动共享 Sidebar。
- 主组件在 `components` 页的 `Jarvis / 无限画布控件`（`66:1026`）中。按钮组件集 `66:1061`，Default `66:1047`、Hover `66:1054`，包含 Label 和 Icon 属性，配置了悬停与离开状态连线。
- 新 Lucide 图标 image `66:1029`、video `66:1034`、minus `66:1038`、maximize `66:1041`、map `66:1044`，来自本地 lucide-react 1.60.0（ISC）。复用原有 plus、chevron-left、layout-grid 和窗口控制。
- 在原变量集合中增加 `canvas/background`、`canvas/toolbar`、`canvas/control`、`canvas/control-hover`、`canvas/border`、`canvas/dot`，ID 为 `VariableID:66:1020` 至 `VariableID:66:1025`。这组画布专用颜色已分别配置 Light / Dark 值；深色画布显式使用 Dark，浅色画布显式使用 Light，既有浅色页面未切换主题。
- 原型连线：项目列表「新建项目」`43:559` → 画布 `67:918`；画布返回按钮 `67:927` → 项目列表 `42:625`。回读确认连线，未在 Present 中实测。
- 顶部图像 / 视频按钮已配置添加对应节点的 Figma 原型，详见下方节点设计记录；尚未接入真实生成能力。
- React Flow 实现约束：一个项目对应独立画布；点阵属于背景，顶部和底部控件固定于视口，不随节点平移缩放。真实平移、缩放、动态节点创建、缩略图导航、点阵切换与磁力吸附尚未在应用中实现（Figma 已配置缩略图与点阵显示开关），Figma 的 100% 仅为设计示例。
- 验证：整页和控件截图检查通过，修正了组件展示区域裁切；页面文字无缺失字体，11 处实例均解析为本地主组件。此结论仅覆盖新画布，不代表全应用深色模式已经验收。

### 图像与视频节点（2026-10-20）

- 用户要求图像、视频节点设计，并在浅深两版画布中支持点击顶部按钮添加对应节点。本轮仅修改 Figma 和设计记忆，没有修改应用代码。
- 节点展示稿：深色 `72:1270`，浅色 `72:1507`，分别位于原画布下方 y=1260，尺寸均为 1440 × 900。两节点横向并列，适合直接评审。
- 主组件集中在 components 的 `Jarvis / Media nodes`（`72:1092`）：Image node `72:1093` 已按后续要求改为 360 × 240 无框占位符；Video node `72:1138` 也已按最新要求改为 360 × 240 无框占位符，旧表单隐藏保留。
- 首版结构（已被两类无框占位符与独立面板取代）：可拖动标题栏与更多入口、空结果预览、提示词、参考图入口、模型选择、参数、禁用生成按钮、左右连接端口。图像默认示例为 1:1 / 1 张，视频为 16:9 / 5 秒；这些是设计占位参数，不是已确认的模型能力。具体选项由后续选择的模型决定。
- 新增 node/surface、node/preview、node/field、node/border 四个变量（`VariableID:72:1088` 至 `VariableID:72:1091`），具有独立 Light / Dark 值。两版复用同一节点主组件和 Lucide 图标。
- 交互入口仍是原空画布：深色 `67:918`、浅色 `70:952`。顶部按钮的 ON_CLICK 使用 SET_VARIABLE 显示节点；默认每类各显示一个，重复点击不会继续创建。这是有限原型，React Flow 阶段才实现任意数量新增、拖拽、连线、表单输入与真实生成。
- 变量集合 `VariableCollectionId:72:1181`，深色图像 / 视频变量 `VariableID:72:1415`、`VariableID:72:1417`；浅色为 `VariableID:72:1652`、`VariableID:72:1654`。默认均 false；浅深两页状态独立。
- 可见性绑定到 wrapper Frame 而非节点实例：深色 `73:1246`、`73:1247`，浅色 `73:1248`、`73:1249`。内部节点分别为 `72:1182`、`72:1227`、`72:1419`、`72:1464`，实例本身保持可见。该结构避免实例隐藏恢复时绑定不稳定。
- 为避免悬停切换覆盖页面添加动作，原画布的顶部按钮实例当前仅配置点击动作；主组件仍保留 Default / Hover 外观。节点展示稿中的顶部按钮仅作视觉展示，交互请从原空画布进入 Present。
- 验证：浅深节点展示截图通过；无缺字、无远程实例。已通过变量设 true → 下一次调用回读 visible=true → 恢复 false → 回读 false 验证四个容器的状态循环，并确认点击动作指向对应变量。未在 Present 中用真实鼠标点击，不能将 API 状态验证描述为完整交互实测。

### 图像节点拆分为占位符与浮动面板（2026-10-20）

- 用户以新截图明确纠正：画布上只显示无框的图片占位符，点击之后弹出面板，Prompt、模型、尺寸均在面板中编辑。这一要求取代首版图像表单卡片；随后用户明确要求视频采用相同方式，见下节。
- 保留图像主组件 ID `72:1093`，改名为 `Jarvis / Image node / Borderless placeholder`，360 × 240、无描边、无标题栏、无外露端口，内部仅图标和“点击编辑图像”。旧表单子层隐藏保留，不在画面中显示。
- 独立面板主组件 `75:1358` 位于 components 页 (7200, 500)，760 × 199，16px 圆角。上层为参考图入口与 Prompt，下层为添加、模型、尺寸、数量与生成按钮；增加关闭入口。参考截图中的 SKILL 和 Sunburst 名称未引入；16:9 / 2560 × 1440 为尺寸示例。
- 浅深两份节点展示稿仍为 `72:1507` / `72:1270`，现在展示无框占位符与打开的编辑面板。视频节点移至 x=980，避免被浮动面板遮挡，内容保持原样。
- 面板容器：深色交互画布 `75:1421`，浅色 `75:1475`；深色展示 `75:1529`，浅色展示 `75:1583`。面板位于画布 (100, 470)，没有嵌入图像节点内部。
- 显示变量在原添加节点原型集合中：`VariableID:75:1420`、`VariableID:75:1474`、`VariableID:75:1528`、`VariableID:75:1582`，分别对应上述四个容器。原空画布默认关闭；展示稿现默认打开视频面板、关闭图像面板。点击图像节点打开图像面板并关闭视频面板；关闭入口只关闭面板，节点自身仍保留。
- 本轮截图检查浅深主题均通过，展示稿打开/关闭动作与容器绑定已回读。未在 Present 实际点击；Prompt 输入、模型和尺寸菜单仍是视觉设计，未接入应用代码。

### 视频节点采用独立浮动面板（2026-10-20）

- 用户明确要求视频与图像一致：画布只显示无框视频占位符，点击弹出编辑面板，浅深同步。
- 视频主组件 `72:1138` 改为 `Jarvis / Video node / Borderless placeholder`，360 × 240、无描边、无标题栏、无外露端口，仅视频图标与“点击编辑视频”。旧卡片子层隐藏保留，所有现有实例同步更新。
- 视频编辑面板主组件 `77:1373` 在 components 页 (7200, 820)，沿用图像面板的 760 × 199 布局和主题变量。上方为首帧/参考图入口与 Prompt；底栏为模型、比例/分辨率、时长和生成按钮。1920 × 1080 / 16:9 / 5 秒仅为设计示例。
- 四张画布的视频面板容器分别为 `77:1424`（深色交互）、`77:1469`（浅色交互）、`77:1514`（深色展示）、`77:1559`（浅色展示），位置 (620, 470)。显示变量分别为 `VariableID:77:1423`、`VariableID:77:1468`、`VariableID:77:1513`、`VariableID:77:1558`，均在原原型集合内。
- 点击视频：先关闭同画布图像编辑面板，再打开视频面板。点击图像：先关闭视频面板，再打开图像面板。关闭按钮只隐藏当前面板，节点保持。两类面板互斥，不会同时遮挡画布。
- 原空画布 `67:918` / `70:952` 仍默认无节点、编辑面板关闭。展示稿 `72:1270` / `72:1507` 默认显示两个占位符并打开视频面板，点击图像可切换。
- 浅深两版最终截图通过；四个视频实例尺寸、点击动作、关闭动作、容器可见性绑定与默认值已回读，面板无缺失字体。未进行 Present 真实点击测试；未改应用代码或接入生成。

### 右下角三个画布开关（2026-10-20）

- 用户明确顺序：第一个显示缩略图（画布总览），第二个隐藏/显示背景点阵，第三个新增磁力吸附开关。同步四张画布：`67:918`、`70:952`、`72:1270`、`72:1507`。
- 当前默认方案：缩略图关闭、点阵显示、磁力吸附关闭。点击开关反转布尔变量，选中态显示浅蓝/深蓝底色。点阵开关的选中含义为“正在显示”，点击后隐藏背景点。
- 缩略图面板 220 × 140，位于按钮组上方 (1200, 684)，包含当前视口及简化节点标记；原空画布中的标记随添加节点变量显示。它是 Figma 总览示意，未实现缩略图拖动导航或实时视口同步。
- 磁铁图标主组件 `80:1313` 在 components 的画布图标组，来自本地 Lucide 1.60.0 / ISC。磁力吸附目前只演示开关状态，实际吸附方式与阈值留待 React Flow 实现，隐藏点阵不会自动关闭吸附。
- 变量集合 `VariableCollectionId:81:1186`，每张画布各有 minimap / dots / snap 三个独立布尔变量，共 12 个。深色交互为 `81:1191/1194/1197`，浅色交互为 `81:1209/1212/1215`，深色展示为 `81:1227/1230/1233`，浅色展示为 `81:1245/1248/1251`（均使用 `VariableID:` 前缀）。
- 缩略图节点依次为 `81:1200`、`81:1218`、`81:1236`、`81:1254`。右下组仍距右侧 20px，新增按钮后向左扩展。
- 验证：浅深两版“缩略图打开、点阵隐藏、吸附选中”截图通过；点击 NOT 表达式与全部默认值回读确认。交付已恢复默认值。未在 Present 实测鼠标点击，未修改应用代码。

### 共享视觉基础

- 变量集合：`Jarvis / 首页`，ID 为 `VariableCollectionId:5:2`。目前首页、设置页与画布共用，名称仍保留初始命名。
- 集合已有 Light / Dark 模式；首页和设置页完成浅色设计，新无限画布已完成深色截图检查，其他页面深色模式尚未验收。
- 主要颜色变量：canvas、sidebar、surface、text、secondary、muted、border、accent、selected、accentText、soft。
- 已有间距变量：4、6、8、10、12、16、20、24、28、32、40、48、64。
- 共享文字样式：`Jarvis/body`、`Jarvis/label`、`Jarvis/caption`、`Jarvis/title`、`Jarvis/latin`。
- 当前页面和本地组件统一使用 **Noto Sans SC**，不再依赖 SF Pro / SF Pro Rounded 或 SF Symbols 字符。
- 字体历史：首版遇到 SF Pro 缺字，曾回退至 Noto Sans SC；接受许可后官方控件中的 SF 字体曾显示正常；本次为统一本地设计，全部改为 Noto Sans SC，并验证无缺字。
- 用户已在 Figma 文件中启用 **macOS 26** 库，连接器已确认其处于已添加状态。
- 官方组件导入限制已解除：2026-10-20，用户说明刚刚接受 Apple Design Resources 许可协议，随后单组件和组件集导入均成功。此前 `Not permitted to upsert from library` 与首次使用授权未完成有关，不能归因于订阅不包含 UI Kit。
- 权限排查时先验证了 `Window Title/Standard`（远程主组件 `12:124`）和 `Window Controls/Standard`（远程组件集 `12:131`），未放置测试实例。随后按用户要求完成了上述页面迁移。
- 官方库的权限问题已解决，但用户最新决定是使用本地控件。库保持启用不代表当前页面仍有远程依赖；不要继续沿用“官方库不可调用”的旧结论，也不要未经要求恢复远程关联。
- 排查 Apple UI Kit 时要区分“添加库”和“首次插入时接受资源许可协议”；协议由用户自行阅读和选择，不能代替用户接受。
- 官方依据：[Apple UI Kit 入门](https://help.figma.com/hc/en-us/articles/24037833895831-Get-started-with-Apple-s-UI-kit)说明 UI Kit 对所有套餐开放，首次插入需要接受资源许可，SF Pro 有独立的可选许可步骤。[MCP 入门](https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server)说明教育版支持写入画布。实际账号检查显示用户在 `project` 团队拥有教育版 Full 席位。

### 当前图标规则：Lucide

- 用户明确选择 Lucide，取代此前讨论过的 SF Symbols 方案。
- 使用官方 `lucide` 包的 SVG 路径，当前来源版本为 `1.8.0`，许可标识为 ISC。不要凭外观手绘替代，也不要使用特殊字体字符充当图标。
- 当前图标基于 24px viewBox，线宽 1.75，圆角端点与连接；按控件需要显示为 14、16、18 或 24px，颜色复用 Jarvis 变量。
- 图标主组件位于 `26:330`；已包含 message-square、plus、search、panel-left、sliders-horizontal、cpu、contrast、folder、plug、bookmark-check、database、info、file-text、arrow-right、ellipsis、chevrons-up-down、chevron-down、arrow-up、eye、external-link、chevron-left、x。
- 上下文占用圆环是数据指示组件，不替换为静态 Lucide 图标。macOS 窗口红黄绿控制仍作为当前 Mac 窗口示意保留；未来 Windows 窗口装饰需另行设计。
- 最终检查：界面页 103 处实例、组件页 44 处实例均能解析到本地主组件；两页无远程变量绑定、SF 私用字符和缺失字体。该数量是本次快照，后续修改前仍需实时读取。

### 历史：SF Symbols 使用评估

- 用户询问项目能否使用 Apple SF Symbols。当前项目仅面向 macOS，适合将 SF Symbols 用作应用内界面图标。
- 依据：[Xcode 与 Apple SDK 许可协议](https://images.apple.com/legal/sla/docs/xcode.pdf)第 2.10 节按 Apple 品牌设备及对应操作系统限定系统图像用途，未在该节要求界面必须由 SwiftUI/AppKit 编写。因此 Electron 本身不构成排除条件，这是基于条款范围的判断，不是 Apple 对 Electron 集成方式的专项确认。
- [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)禁止将 SF Symbols 或易混淆的相似图像用于 App 图标、Logo 或其他商标用途；部分代表 Apple 产品或功能的符号还有单独限制。
- 若未来增加 Windows 或面向非 Apple 平台的网页端，需重新选择相应平台的图标资源，不能自动沿用本项目的 Apple 图标。
- 实现方式仍待验证：设计稿可以使用官方符号；Electron 中的静态资源或原生渲染路径需单独验证，不把 Figma 中的私用字符当作稳定的网页图标接口，也不因 UI Kit 可用就推定可以打包分发 SF 字体。
- 此处仅保留研究结论。用户随后已明确选择 Lucide，不实施全量 SF Symbols 替换。

## 设计修改记录

| 日期 | 修改 | 验证结果 |
|---|---|---|
| 2026-10-20 | 明确缩略图和点阵按钮语义，新增磁力吸附开关，四张画布同步 | 浅深开关选中态及缩略图截图通过；NOT 动作与默认值回读通过 |
| 2026-10-20 | 视频也改为无框占位符及独立编辑面板，浅深同步，图像/视频面板互斥 | 两版截图通过；四个实例的打开/关闭动作、默认值和尺寸回读通过；无缺字 |
| 2026-10-20 | 按用户新截图将图像节点改为无框占位符，Prompt / 模型 / 尺寸移入独立浮动面板，浅深同步 | 两版截图通过；展示稿开关连线及容器绑定回读；视频卡片保留 |
| 2026-10-20 | 新增图像 / 视频节点主组件及浅深两版展示稿，顶部按钮接入添加节点原型 | 两版截图、字体与本地实例检查通过；四个显示变量循环回读通过；交付原画布默认空状态 |
| 2026-10-20 | 新增无限画布浅色版本，画布变量拆分 Light / Dark 配色 | 两版截图检查通过，浅色无缺字，深色配色保持；仅更新设计和记忆 |
| 2026-10-20 | 参照用户截图新增深色 AIGC 无限空画布，顶部为图像 / 视频按钮，增加画布控件与项目列表往返导航 | 整页与控件截图通过，文字无缺字，11 处本地实例；原型连线回读正常。未开发 React Flow |
| 2026-10-20 | 新建首页、首页组件和基础变量 | 页面为可编辑图层，无整页图片替代 |
| 2026-10-20 | 将无法显示的 SF Pro 文字改为 Noto Sans SC | 字体缺失清单为空，截图中的英文标签恢复显示 |
| 2026-10-20 | 新建设置页，完成模型服务详情 | 截图检查通过，无已知文字裁切 |
| 2026-10-20 | 按用户要求，将两个组件组移到 `components` 页面 | 17 个主组件迁移完成，36 处实例引用保持正常；首页和设置页的位置、尺寸未改 |
| 2026-10-20 | 创建本地 `memory/design.md` | 记录本轮设计要求、位置和变更，供后续沿用 |
| 2026-10-20 | 排查 macOS 26 库导入权限；用户刚接受 Apple 资源许可后重试 | 单组件、组件集均导入成功，回读确认均为远程资源；未放置测试实例或替换现有设计 |
| 2026-10-20 | 将首页和设置页的通用控件迁移到 macOS 26 官方组件，新增官方控件展示组和侧栏适配组件 | 两页根节点、尺寸及位置保持；8 类官方控件保留远程关联；修正侧栏宽度和按钮尺寸后，页面及组件展示截图检查通过，无可见缺字 |
| 2026-10-20 | 在输入区模型选择左侧增加上下文占用圆环，将添加文件改为原生加号图标按钮 | 主组件已放入 components；0%、25% 示例及未知状态布局正常；输入区截图检查通过，无缺失字体 |
| 2026-10-20 | 按用户新要求统一 Lucide 图标，将已用官方控件改为本地主组件，移除嵌套远程依赖；字体统一 Noto Sans SC | 两页及组件样本截图检查通过；中文按钮属性、选中态和字段值已恢复；界面页与组件页的远程实例、远程变量、SF 私用字符和缺失字体均为 0 |
| 2026-10-20 | 两页主内容左侧增加 16px 圆角；上下文用量默认仅图标，新增悬停详情面板与点击切换 | 默认态无可见数字；三组用量状态的交互连线回读正常；首页展开/收起、设置页及状态展示截图通过，当前首页恢复为默认态 |
| 2026-10-20 | 侧栏新增 AIGC 创作空间入口，新建项目列表页；新对话改为白底描边按钮 | 首页和项目列表截图检查通过；列表 4 行示例数据、全部本地组件、Noto Sans SC 无缺字；首页到列表及返回新对话的原型连线已回读确认 |
| 2026-10-20 | 按用户纠正，将 Sidebar 建为 Main / Settings 两个变体，并让三张页面引用；撤销误建 Home 变体 | 首页与项目页共享同一 Main 主组件；设置页使用 Settings；页面位置、尺寸及主内容保持，截图与导航连线回读通过，无缺字 |
| 2026-10-20 | 首页新增侧栏点击收起/展开，收起态窗口控制移入主内容顶部，主内容自适应填满窗口 | 修复隐藏后空白占位及展开恢复问题；状态循环和两态截图通过，输入宽度保持 680px，交付默认展开；未创建首页变体 |
| 2026-10-20 | Sidebar 两变体和三页实例统一最小／默认 230px，最大暂按建议设为 320px，并增加组件说明 | 默认三页截图通过；320px 下表单与项目列表无横向溢出；最小宽度不影响收起占位归零；交付恢复 230px |

## 方案文档与未决事项

- [方案书 v0.3](https://docs.google.com/document/d/16uQSOrUhWX0zsU0gVS7f90MOHkzhzX6p4TgCgtjW-IM)
- [系统架构方案 v0.2](https://docs.google.com/document/d/13YbeT6wgkHD94h9ywu0v_knBXq-4i9e01x_SdN9F0r8)

两份文档已转换为原生 Google 文档，原 Markdown 文件仍保留。后续继续修改方案时，优先更新 Google 文档，避免产生未说明的多份版本。

以下事项仍未明确确认，不要通过 UI 设计替用户决定：

- **D1**：Host 崩溃时，接受丢失最后约 1 秒未保存文字，还是要求已显示文字零丢失。
- **D2**：第三批暂不执行任意 Skill 脚本，还是必须支持脚本执行及对应隔离能力。
- **D3**：首版最优先的真实工作场景。

用户曾回复“D1 接受／零丢失；D2 接受／需要脚本”，仍包含互斥选项；当时已询问澄清，尚未收到明确选择。

## 后续维护

- 完成设计变更后，在此文件同步记录变更、节点位置和验证结果。
- 将用户明确要求、当前设计方案、已验证结果和环境限制分开记录。
- 页面名称、节点 ID、组件数量等可能变化，操作前实时检查。
- 未完成的详情页、原型、深色模式和无障碍验证，不写成已完成。

## 本地创作空间实现（2026-10-20）

- React Flow 已接入：项目新建/搜索/排序/重命名与重新打开；每项目独立保存节点、视口及三个画布开关。
- 顶部图像/视频按钮可重复添加节点；无框占位符可拖拽和删除，点击显示对应浮动编辑面板；点击空白或关闭按钮隐藏面板，保留节点。
- 缩放、适应视图、MiniMap 导航、点阵显示和 24px 网格吸附可操作，浅深主题可切换并持久化。
- 提示词、模型与参数、参考素材在本机保存；初始交付未接入生成，当前上传与生成协议已接通并用本地模拟服务验证，未进行真实内网联调。未引入 Pi Agent。导入资源节点与 URL 渲染规则见下方最新记录。
- 本地字体采用 Noto Sans SC，图标复用 Lucide；主进程隔离保持，renderer 没有新增通用 Node/文件/Shell 能力。

### 原生窗口按钮对齐（2026-10-20）

- 用户指出红黄绿按钮高于工具栏。Electron 的 macOS hiddenInset 默认位置与自定义工具栏高度不一致。
- 主进程显式设置 trafficLightPosition 为 (16, 23)，工作台、侧栏和画布顶部统一 60px，使 14px 原生按钮在顶部栏居中。
- 类型、Lint、格式与构建检查通过；独立 Electron 测试窗口回读按钮坐标 (16, 23)、工具栏高度 60。

### 本地侧栏调宽与 Motion 动画（2026-10-20）

- 用户明确要求侧栏可调宽，并为展开/收起增加滑入滑出；随后选择 Motion for React 作为后续界面动画基础，简单颜色/hover 仍可使用 CSS。画布坐标与拖动继续由 React Flow 管理。
- 本地 SidebarLayout 统一控制侧栏与主内容布局，展开/收起使用约 260ms、无弹跳的 Motion spring，布局动画与滑动同步，允许中途反向。首次进入不播放入场动画。
- 拖拽范围 230–320px，默认 230px；拖动时禁用过渡以保持跟手，松开后保存宽度，重新打开应用恢复。旧数据缺少 sidebarWidth 时使用 230px。
- 分隔线支持左右方向键每次 10px，Shift + 方向键每次 1px，Home/End 设到边界，双击恢复 230px；Escape 取消当前拖动。工作台和设置侧栏共用此行为。
- 收起时保留侧栏节点以完成退出动画，但使用 inert 和 aria-hidden 排除交互与辅助技术焦点；焦点移到展开按钮，展开后回到收起按钮。系统减少动态效果开启时立即切换。
- 验证：拖动上下限、重载宽度恢复、键盘操作、中途反向、焦点和减少动态效果测试通过；展开/收起截图通过，原有功能回归共 7 组通过。

### 通用设置中的三种主题（2026-10-20）

- 用户要求主题选择迁入“通用”，一共三个按钮：“跟随系统”“Light Mode”“Dark Mode”，默认跟随系统；独立“外观”分类不再显示。
- Figma 通用页 `87:1353`，位于 (2523, 1561)；主题主组件 `86:1517` 在 components 页 (7200, 1120)，尺寸 620 × 44。共享 Settings 侧栏的旧外观行 `48:866` 隐藏保留，通用页通过实例覆盖选中态。首页和创作空间的设置入口已导航至通用页。
- 原型偏好集合 `VariableCollectionId:86:1516`，System/Light/Dark 对应 `86:0/86:1/86:2`；按钮切换自身选中态和已有 Light/Dark 设计变量。Figma 的 System 用浅色示例，不代表能读取真实操作系统主题。交付恢复 System 默认。
- 本地 GeneralSettings 实现三个互斥按钮，选择立即生效并保存；useResolvedTheme 监听 prefers-color-scheme，系统变化只影响 system 偏好。已有保存的 light/dark 选择保留，新数据或缺失偏好默认 system。
- 已移除侧栏“外观”项和页面顶部的一键主题切换，入口统一到通用；画布使用同一解析后的主题。
- Figma 浅深截图、文字及按钮连线检查通过。本地新增主题测试覆盖默认值、系统实时切换、手动覆盖、重载恢复和画布同步；8 组集成测试全部通过，类型、Lint、格式和构建通过。

### 本地画布控制调整（2026-10-20）

- 用户要求隐藏右上 React Flow 角标、磁力吸附默认开启，并用关闭按钮下方的放大编辑按钮代替 Prompt 右下拖拽调高。
- 本地 React Flow 使用 hideAttribution 配置；新项目及缺失 snap 值的数据默认开启吸附，已有明确开关值保留。
- 用户随后纠正：需要指定宽高的放大编辑，不是铺满全屏。图像和视频面板均使用 960 × 600px 居中放大尺寸（当前实现选值），小窗口限制为视口宽减 64px、高减 120px；背后画布以半透明遮罩弱化。按钮为“放大编辑 / 还原面板”，Prompt 自适应且内容保持。Esc 优先还原，再次 Esc 关闭浮动面板；放大态包含键盘焦点循环。
- 代码检查、构建和画布交互测试通过，已查看全屏截图。整套回归中侧栏拖动出现一次不稳定结果，单独复跑通过；未改侧栏实现。此次未修改 Figma。

- 2026-10-20 放大编辑修正验证：960 × 600px 尺寸断言、图像/视频放大还原与文本保留测试通过，居中截图检查通过；此前铺满窗口的实现已取代。

### 放大态 Prompt 上下布局（2026-10-20）

- 用户要求放大态顶部是横向一字排开的参考素材，下方是主要 Prompt 编辑区域。
- 本地放大态采用两行布局：顶部素材带单行排列、溢出横向滚动，Prompt 位于其下并填充剩余高度；关闭与还原按钮位于右侧。普通浮动面板保持原布局，图像/视频复用同一规则。
- 构建与 4 组桌面测试通过，验证了 12 个参考素材同排、横向溢出、Prompt 位于素材下方及还原后内容保留；截图检查通过。本轮未修改 Figma。

### 参考素材堆叠与数量限制（2026-10-20）

- 用户要求普通浮动面板的多个参考素材固定堆叠显示，增加数量不撑开布局；本地使用固定 84 × 104px 区域、最多三层缩略预览和数量标记，点击叠卡进入放大管理，右下加号可继续添加。
- 放大态维持顶部单行参考素材、横向滚动、下方 Prompt。
- 图像节点只允许参考图片，最多 9 张；视频节点最多 9 张图片、3 个音频、3 个视频，总计最多 15 个。超额或类型不符的素材提示后跳过，保留已有素材；旧项目超额不会自动删掉，需用户在放大面板中调整。
- 本地 9 组测试通过：普通面板在 9 / 15 个素材时尺寸不变，逐类上限与错误类型被拒绝，放大态 15 个素材同排并可横向滚动，删除后堆叠数量同步。截图检查通过。

### 参考素材编号（2026-10-20）

- 用户要求按参考素材上传顺序显示从 1 开始的角标。当前显示“图片 1”“音频 1”“视频 1”等，各类型独立连续编号；视觉排列仍保留总体添加顺序。
- 删除素材后同类型编号顺次前移，新增素材追加到末尾；普通叠卡的素材编号与总量分开显示，总量标作“共 N”。
- 编号、添加顺序与删除后重编号已通过测试，截图检查通过。

### 视频参数卡片横排（2026-10-20）

- 用户要求视频节点参数区参考所附卡片样式，但不换行，顺序固定为模型、时长、宽高比、分辨率。
- 本地 VideoControls 将四项拆为独立圆角卡片；模型卡片采用上方小标签、下方模型名称，其余三项采用图标加数值。参数直接可选，普通态与放大态共用，窄窗口横向滚动而不换行。
- 生成音频开关以独立图标保留在右侧，删除和生成按钮保留。图像节点参数区未改动。
- 卡片顺序、单行几何和模型切换约束测试通过，截图检查通过。本轮未修改 Figma。

### 统一图像与视频参数规范，并同步 Figma（2026-10-20）

- 用户明确 Image 系列参数顺序为模型、宽高比、思考程度、分辨率；Nano 系列为模型、宽高比、分辨率；视频继续为模型、时长、宽高比、分辨率。全部保持单行，窄空间横向滚动。
- 本地统一使用 ParameterControl：40px 高、8px 圆角、细描边、轻底色、13px Medium 字体、Lucide 图标与下拉箭头。模型名称使用易读显示名，图像宽高比与分辨率只允许支持的组合。
- Figma 节点规范展示：[Image / Nano / Video](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=99-1645)，根节点 `99:1645`，含浅深两列、三类普通面板。
- 通用参数主组件 `94:1657`，位于 components 的 `94:1627`；原 Image / Video 编辑主组件保留 `75:1358` / `77:1373`，新增 Nano 普通面板 `95:1842`。所有组件使用本地变量和 Lucide 图标。
- 放大主组件：Image `95:1929`、Nano `95:2086`、Video `95:2224`，均为 960 × 600；浅色展示 Frame 为 `99:1860`、`99:2219`、`99:2575`，深色为 `99:2997`、`99:3218`、`99:3477`。
- 本轮同步了此前本地已完成的叠卡、数量与编号、放大态上参考素材/下 Prompt、移除入口、放大/还原入口和默认开启磁力吸附。Image/Nano 放大示例不超过 9 图；视频示例为 9 图、3 音频、3 视频，横向裁切与滚动。
- 已更新现有画布面板关闭动作和放大 Overlay 连线；展示页可从三类普通面板打开对应主题放大稿，关闭/还原返回。旧子层隐藏保留，不批量删除。
- Figma 普通态浅深展示及放大态截图检查通过；本地新增 2 项图像参数测试通过，既有画布/生成/主题等 8 项通过。侧栏拖动回归再次出现不稳定结果，单独复跑仍失败，本次未改侧栏实现。类型、Lint、格式与构建通过。

### 模型选择器按内容占宽（2026-10-20）

- 图像与视频模型选择器最小宽度为 160px，长模型名自动撑宽，不再填满参数行；后续参数保持 8px 间距靠左排列。普通态与放大态共用，操作按钮仍位于右侧。
- 本地构建及 2 项节点参数测试通过，实测短名称为 160px、长名称撑宽、后续参数间隔为 8px。本轮未同步 Figma。

### 新建节点默认参数（2026-10-20）

- 用户明确要求新图片节点默认使用 GPT Image 2.5 Flare、16:9、Medium、2K；新视频节点默认使用 Seedance 2.5、5s、16:9、1080P。
- 本地统一创建入口 `apps/desktop/src/renderer/src/features/creation/types.ts` 的 `createMedia` 已落实；图片尺寸存为 `16:9(2k)`，视频分辨率存为 `1080p`，与现有参数及协议格式一致。已有节点的保存参数不迁移。
- 验证：新建图像/视频参数直接断言、`pnpm check`、构建及 2 项现有节点参数测试通过。Electron 测试在沙箱中无法启动进程，获准在沙箱外重跑后通过。本轮未修改 Figma。

### 桌面拖入资源与无框 URL 节点（2026-10-20）

- 用户明确要求：画布接受桌面图片、视频、音频，拖入即上传；图片/视频使用 upload 地址，音频使用 upload-media 地址。节点本质是 URL，在画布上渲染媒体。
- 本地新增独立资源节点，成功后以返回的 URL 显示图片或带原生播放控件的视频/音频，无边框、透明背景，下方显示文件名，右上提供删除按钮。导入资源不弹出生成编辑器，生成节点的结果也统一按已保存 URL 渲染。
- 支持多文件拖放、按当前缩放/平移换算落点、网格吸附及批量资源网格排列；拖入时展示提示。顶部增加“导入素材”图标按钮作为文件选择入口。
- 上传中显示状态，失败显示原因并提示重新拖入；URL 加载失败可重新加载媒体。缺少配置、空文件、类型不符及超限在导入时提示；有有效文件时仍可继续上传。图片/视频/音频各沿用 32/200/64 MiB 限制。
- 资源仅持久化元信息与 URL，不保存文件副本；应用重启后按 URL 恢复显示，不重新上传。切换项目后上传继续归属原项目，删除节点不删除上游资源；中断上传重启后明确标为失败，不自动重传。
- 验证：新增 5 项 Electron/协议测试通过，浅深截图检查通过；检查及构建通过。完整回归中其他 11 项也已有通过结果，其中旧画布测试适配 Seedance 2.5 默认值后单独通过；期间一次提示词多出空格未复现，记录见 `memory/engineering.md`。本次使用本地模拟服务和 DataTransfer 拖放，未完成真实内网或 Finder 手动拖放验收。
- 本轮只修改本地实现，未修改 Figma。

### Excel 导出与右侧栏按钮占位（2026-10-20）

- 用户要求导出画布项目全部请求（JSON、返回 URL）和按模型的图像次数/视频秒数统计，并明确删除节点不能删除统计；请求账本独立于画布节点，同节点多次生成和删除节点都保留历史。
- 右上角原“已保存到本机”的可见位置改为“导出 Excel”按钮；保存状态保留为辅助技术状态文本，本地保存失败仍由全局提示显示。导出按钮打开原生保存对话框，有处理中、成功、取消和失败反馈，避免重复点击。
- 导出按钮右侧新增 Lucide `PanelRightOpen` 按钮，名称为“展开右侧栏”，当前禁用，提示“待实现”。只做入口占位，没有新增右侧面板内容或展开行为。
- 导出文件含“消耗统计”和“请求明细”。统计按模型分组，成功/失败/进行中/结果未知分开；上传只进入明细。视频秒数采用成功请求配置时长，自动或历史缺失时长另列未知次数。旧请求缺失 JSON、模型等明确标为未记录，不按当前节点补造。
- 明细保留生成实际 JSON 和上传 multipart 元数据、URL、状态、时间、节点/请求 ID；长 JSON/地址按同名分段列顺序拼接，不截断。节点删除和应用重启后均可导出历史记录。
- 验证：检查、构建和完整 20 项回归同轮通过，包括删除节点后重启导出；900 × 640 浅深截图通过。本轮只修改本地实现，未修改 Figma。

### 从左向右的节点连线（2026-10-21）

- 用户确认的连接规则：图像节点可接入上传的图片和图像生成节点；视频节点可接入上传的图片/音频/视频及图像/视频生成节点。生成节点左侧为输入、右侧为输出；上传资源只输出，没有输入端口。
- 默认连线为细灰色实线并带方向箭头；点击节点后仅高亮直接连接当前节点的上游和下游连线，不包含上游的上游或下游的下游，边使用蓝色蚂蚁线；关联节点不高亮。共享祖先的其他分支保持灰色；点击空白恢复默认，选择状态不保存。减少动态效果时高亮保留、蚂蚁线停止。
- 节点和连线统一固定层级，边和拖拽预览线始终低于节点，选中时不抬升边。节点底色遮挡穿越其区域的线，包含透明媒体和留白；默认无节点描边，仅实际选中（点击或框选）的节点显示选中轮廓。
- 支持保存与重新打开连线、点击选线后 Delete/Backspace 删除；删除节点自动移除相关边，不删除独立请求账本和消耗统计。禁止自连、重复连线、循环及不支持的类型。
- 连线也接入实际生成：直接上游的已完成 URL 作为参考，不重复上传；上游尚无 URL 时明确提示并阻止请求。编辑面板显示连入数量，参考数量按面板素材和连线合并限制。不会自动生成整条链路。
- 验证：检查、构建及完整 25 项回归同轮通过，浅深截图通过，包含层级、临时线、键盘连接/删除和减少动态效果。仅完成本地实现，Figma 中原无端口稿未同步，本轮没有修改 Figma 节点。

### 图像和视频节点下载入口（2026-10-21）

- 用户要求图像和视频节点有点击下载功能。本地在有可用 URL 的节点右上角增加 Lucide 下载图标按钮，覆盖上传资源和生成结果；上传资源的下载和删除按钮并排，生成节点的任务状态改到左上角。空节点没有下载按钮。
- 点击后读取原文件信息、打开原生保存位置选择框，显示处理中、已下载、已取消或失败提示，可关闭反馈；防止重复点击，按钮操作不触发节点编辑或拖动。下载保存原始媒体字节，按返回的媒体类型建议文件扩展名。
- 节点维持无框呈现、原有端口和连线层级；只新增下载操作，不改变节点 URL 或请求账本。减少动态效果时停止下载图标旋转。
- 验证：检查、构建及完整 27 项回归同轮通过；四类节点下载字节、取消、失败和旧文件保护均验证，浅深截图检查通过。本轮仅修改本地实现，未同步 Figma。

### 默认下载目录与 Figma 同步进度（2026-10-21）

- 用户确认：设置中可选择、保存默认下载位置；勾选“不再提醒”后直接保存，否则每次都弹出保存框。当前实现位于“设置 → 通用 → 下载”，即时保存；只有目录已设置才允许勾选，重启恢复，同名自动编号避免覆盖。
- 本地 `DownloadSettings` 的目录、选择/更改、禁用/未勾选/已勾选、保存反馈已实现并检查浅深截图；检查、构建与完整 28 项回归同轮通过。
- 用户要求把最近新增按钮、组件和页面同步到现有 Jarvis Figma 文件。复用已有 Noto Sans SC、文字样式、浅深变量及本地主组件，没有重新引入远程 Apple 组件。

已写入并验证的组件区：[下载与流程控件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=107-3856)，根节点 `107:3856`，在 `components` 页，位置 (9240, 100)，尺寸 2200 × 1526。

| 已完成对象 | Figma 节点 | 状态 |
| --- | --- | --- |
| 媒体图标按钮 | `107:3899` | Default / Busy / Disabled；图标 INSTANCE_SWAP |
| 导出按钮 | `107:3917` | Default / Busy |
| 节点端口 | `107:3932` | 默认 / 高亮 |
| 下载勾选项 | `107:3940` | 禁用 / 未勾选 / 已勾选 |
| 下载设置区块 | `107:3955` | 未配置 / 已选目录仍提醒 / 直接保存 |
| 下载反馈 | `107:4013` | 下载中 / 完成 / 取消 / 失败 |
| 上传资源节点 | `107:4050` | 图像 / 视频 / 音频，文件名 TEXT 属性 |

- 新增 Lucide 下载、上传、右侧栏、文件夹、音乐、忙碌、勾选、错误图标均来自当前代码包 SVG，为可编辑矢量。本地新增 workflow/edge、高亮和控件圆角变量，复用现有颜色/文字样式；组件图标缩放和文件名裁切已经修正，组件总览截图通过，文字字体核对为 Noto Sans SC，没有整页图片替代 UI。
- 原图像主组件 `72:1093`、视频主组件 `72:1138` 已显示左右端口，新增 `Downloadable` 布尔属性和 `Preview label` 文字属性；保留原组件 ID。下载默认隐藏，实例有结果时可开启。
- 既有 Image 编辑主组件与放大稿默认值更新为 Image 2.5 Flare、16:9、Medium、2K；Image/Nano/Video 各型号选择器改为按内容占宽、最小 160px。六个普通/放大编辑组件新增默认隐藏的连入参考节点提示，返回 ID 和属性键已记入状态文件。
- **页面同步尚未验证完成**：更新通用页、四张既有画布工具栏、创建浅深灰线/高亮流程示例及下载设置页面的调用返回传输 HTTP 403，没有返回页面写入节点 ID；随后只读查询和 whoami 同样 403，因此无法确认该页面调用是否产生任何修改，不能声称全部同步完成。
- 续传资料已保存在仓库：[状态与已返回 ID](figma-sync-2026-10-21/state.json)、[待执行页面脚本](figma-sync-2026-10-21/pages-script.txt)。恢复连接后必须先只读检查 Page 1 的实际状态，再按已完成内容续传，不能盲目重建；若已有不完整的 Workflow 根节点，需针对剩余部分续写，不能把脚本的“已存在”分支当作完成验证。
- Figma 中 `/Users/hugo/Downloads` 是已验证存在目录的设计示例，不代表已替用户选择该默认位置。实际目录由应用内原生目录选择产生。

### Pi Agent 首页设计变更记录（2026-10-21）

- 按用户参考图更新首页输入框，新增三态组件、宽屏首页与尺寸总览；三处截图和可编辑结构验证通过。应用代码未改；权限入口、思考强度及具体尺寸仍为当前方案。

- 2026-10-21：按用户“改”修订 Agent 输入框为 24px 圆角、152px 初始高度、18px 输入文字及更弱阴影；三态和两个首页实例同步，首页与状态总览截图检查通过。

- 2026-10-21：按用户要求在通用设置加入全局展示用户名 UI，明确创作空间请求用户名不受影响；三张既有设置页同步，浅深截图验证通过，未改应用代码。

- 2026-10-21：用户选择实时预览，完成写作空间浅深编辑页、两个空态、Sidebar Writing 变体与首页入口；截图和可编辑结构检查通过。仅更新设计与项目记忆，未改应用源码。

- 2026-10-21：设置 Sidebar 返回工作台移到窗口控制下方，五张设置页同步，浅深截图与原型导航检查通过，仅改设计。

- 2026-10-21：写作右侧栏由上下分区改为纯图标 Tab，新增浅深助手选中稿和 Open/Empty 四态切换组件；截图与按钮无文字、原型动作读回验证通过，仅更新 UI 设计。

- 2026-10-21：根据用户反馈加强当前文档标签辨识；按最新要求采用中性灰底和加粗文字，取消蓝色试稿，浅深截图检查通过。

- 2026-10-21：合并写作侧栏目录切换入口、移除路径说明及底部重复入口；搜索改为操作栏图标并按需展开，补齐浅深菜单和搜索展开稿，截图验证通过，仅改设计。

- 2026-10-21：按用户层级参考统一左右侧栏/标签栏背景，选中 Tab 与编辑区同色并贴底衔接，添加标签分隔线；修复 SVG 缩放约束使搜索与新建图标统一 18px，10 张状态页同步，截图及 token/尺寸验证通过。

- 2026-10-21：移除文档标签栏左侧 20px 空白，8 张有文档的状态页同步，第一个 Tab 结构检查 x=0，截图验证通过；未改应用代码。

- 2026-10-21：新增浅深色共八张左右侧栏展开/收起对比稿，保留窗口控制和恢复入口，配置独立切换原型并验证布局；纠正右侧开关图标，仅更新设计。

- 2026-10-21：写作空间从设计进入基础代码实现，完整 38 项回归与最终写作 4 项验证通过，浅深实窗截图已检查。高级 Markdown 与 AI 保留后续范围，Figma 不变。
