# 写作空间重新设计实施记录

最后更新：2026-10-26

## 授权与基线

用户要求执行 `writing-space-plan.md`。按计划实施 W1–W6、分阶段验证与提交推送功能分支；不创建 PR、不合并、不打标签或发布。每阶段必须通过验证，Claude 负责最终阶段验收。

- 从 fetch 后的 `origin/develop`（`48d698e`，0.4.0）创建 `feature/writing-space`。
- 合入原会话分支的三条方案/设计记录，`memory/design.md` 顶部冲突保留两侧内容，合并提交 `b982f02`。
- 两份已有未跟踪文件 `writing-redesign-components-state.json`、`writing-redesign-components-scripts.json` 保留，不作为本轮实现新增文件。

## W1：实现已保存，阶段门禁未通过

实现提交：`631e6df`（`feat ✨️: 实现写作空间W1文件能力与多目录标签`）。

### 已实现

- 全格式列表与文件类型、文件大小/修改时间；文本白名单、严格 UTF-8 解码、BOM/CRLF 保留和版本冲突保护。首页 Agent 文档库仍只访问 Markdown。
- 同根目录改名、移动、单文件副本、移入废纸篓（文件/空目录）、系统文件管理器定位；名称与路径检查、拒绝符号链接。所有应用写入按根串行；错误从 IPC 返回时不带系统绝对路径。
- 图片资产 MIME/魔数/10 MiB 校验、assets 保存与同名同内容复用；专用 IPC、mainFrame/可信 URL 校验与活跃写入计数。
- 目录监听 300ms 合并推送、窗口销毁释放、不可监听时保留 2.5s 轮询；所有已打开文本缓冲区外部变更检测。
- `jarvis-writing://` 只读媒体协议、GET/Range/格式校验；CSP 增加该媒体/框架来源，不开放网络或通用文件接口。
- 多文件夹标签、全局标签恢复、旧键一次性迁移；目录切换与打开其他根的文档不裁剪已打开标签。
- 改名迁移主进程 Agent 会话/卡片/账本作用域，运行中或排队回复拒绝改名；renderer 同步文档 ID、标签历史、编辑器缓存与本轮撤销事务。
- 目录行（28px、12px 层级、类型图标、徽标、行内改名、菜单、键盘与文件拖放）、文件/星图分段（W1 星图为空状态）、图片/PDF/音视频/二进制预览。文本使用源码视图；类型标签图标复用 Lucide 1.60。

### 设计核对

读取 Figma 文件 `mIwnyR5nAlECFMam1NvmER` 的 File Tree Row `461:38163`、File Preview `464:38503` 的设计上下文与截图。基础控件复用 V1 Button/Input/Badge/DropdownMenu/Dialog/Tabs；只在业务层组合，无新增颜色变量或检查器白名单。图标使用同版本 Lucide 的对应图标，经 `@jarvis/ui/icons` 导出。

### 验证进度

- 文件主进程 4 组测试通过：全格式/文本/BOM/CRLF/冲突，文件操作边界，资产格式/大小/符号链接，媒体 GET/Range/越界。
- 原写作实窗 6/6 通过（重启单目录恢复、冲突另存、主题与布局等）；跨目录用例增加双根重启恢复，并在完整回归通过。
- 写作 Agent 实窗通过，包括新增的改名后同轮撤销、恢复原名后继续 Agent 编辑；保留原版本冲突与越界断言。
- 新目录实窗通过：F2 改名、修改保存新路径、创建副本、图片真实加载、二进制预览、文本打开；旧键迁移测试在完整回归通过；新增移动、定位与废纸篓确认（原生操作替身）实窗测试随后通过。
- `pnpm check`、`pnpm build` 最终通过。完整 `pnpm test:smoke` 为 **182/183 通过（5.6m）**，唯一失败为既有 `agent-calendar-ui.spec.ts:77`（期望 7 天，实际 0 天）。只读隔离进程回读状态为 `{provider: apple, access: not_determined}`；没有申请权限、读取或修改个人日程，也没有跳过或删除断言。日志 `/private/tmp/jarvis-writing-w1-smoke.log`。
- 完整回归后仅补充文件菜单用例并调整目录头部内边距、选中行背景；最终 check/build、目录实窗 **3/3（8.2s）** 通过。没有把这次专项复验称为全套通过。
- 初轮失败及修复：更多按钮文件名模糊匹配；跨根打开替换标签；另存副本提前裁剪旧标签；新协议遗漏 CSP；目录行默认按钮居中。均保留失败证据并复验相关流程。
- 图片/目录初步截图：`apps/desktop/test-results/a98ffb2c-ac89-4704-9bd1-a3c173ecac56/writing-tree-writing-tree--35fe4-images-and-duplicates-files/`。这些截图早于最终样式。最终目录浅深、图片预览截图在 `apps/desktop/test-results/d31efede-520d-493e-ad53-d9f0bd9d8b4e/writing-tree-writing-tree--35fe4-images-and-duplicates-files/`（`tree-light.png`、`tree-dark.png`、`preview-light.png`），已检查对齐与裁切；不替代 Claude 的逐像素设计验收。

### 与旧测试的冲突处理

`writing.spec.ts` 原“switching writing folders clears obsolete tabs”预期切换目录关闭其他目录标签，与本计划 W1.4 的新行为相反。改为验证两个目录标签保留、切换可读，并增加重启恢复；未删除读取/写入/冲突业务断言。这是需求变化对应的断言替换，非为通过测试放宽行为。

### 尚未验收与实现取舍

- W1 交付时完整回归仍有一项失败，且尚无 Claude 的验收结论；用户随后明确继续 W2，见下方授权补充，未将旧失败改写为通过。
- 文本文件目前使用 CodeMirror 纯文本源码模式，未新增各语言的语法高亮依赖。文件预览中图片与二进制面板已有实窗验证；PDF 内置查看器与音视频完整播放、Linux 监听降级、Windows 原生废纸篓/定位仍待目标环境验收。
- 目录与预览复用现有 WritingSpace 宿主，目录行与预览独立为 `tree/FileTreeRow.tsx`、`viewers/FilePreview.tsx`；未另拆整份 WritingSidebar。范围与进程边界不变。
- 无新增生产依赖；W6 打包与依赖总验收尚未执行。

## W2：已实现，阶段证据见下方

实现提交：`47655e3`（`feat ✨️: 实现写作W2无损块编辑与双视图`）。

2026-10-26 用户明确要求“继续执行 W2”，本轮据此进入 W2，覆盖此前等待 W1 验收的执行限制；W1 日历失败与外部验收状态不改写为通过。

步骤：转换层与样本 → 块编辑与增量同步 → 视图无关 Agent → 文档框架/块交互 → 实窗回归与打包依赖检查。

依赖选择：Tiptap 3.31.4（npm 发布时间 2026-09-30，3.32.0 的 2026-10-13 发布时间不足两周，不选）。计划列表外显式加入 `@tiptap/core` 同版本，原因是本项目直接使用 Node/Extension/getSchema 等 API，避免依赖 pnpm 间接可见性。

### W2 实现

- 固定 Tiptap 3.31.4 全家族与 remark/unified 精确版本，未使用整体 Markdown 序列化插件。新增 `editor/markdown` 的 mdast ↔ ProseMirror 转换；顶层原文、原空白、规范化指纹与块 ID 保留。未知 HTML/脚注/引用定义及 W3 扩展块以不可编辑原文块呈现，源码入口可编辑。
- Markdown 默认块视图，文本文件保持源码模式；按文档记住视图。两种视图共用 `DocumentSession.content`，块编辑使用最小文本补丁；外部更新保留未变化前后块，同块数时分别更新变化块。块范围与源文本选区双向映射。
- `BufferView` 隔离 CodeMirror/Tiptap，未显示文档的 Agent 修改只更新缓冲区并清理缓存。保留 SHA-256 校验、15 秒租约、未保存标志、同轮事务撤销；块视图用 ProseMirror 历史元数据合并一轮 Agent 修改。源码缓存重新配置当前监听器，避免旧组件闭包写回。
- 文档头部使用独立文件标题、Frontmatter icon 选择、路径/修改时间/字数；标题不会改正文 H1。图标修改只替换 YAML scalar 范围或追加 icon 键，其他字节保持。现有 read/save 响应增加可选 mtime 元数据，无新增 IPC。
- 正文 680px 居中，大纲短线/展开导航、块句柄/添加/拖放指示/基础转换菜单、划选 BubbleMenu（粗斜删除线、代码、链接）与 AI 润色请求预填。双链候选复用 CandidateList；共享 `writing-links.ts` 排除代码与 URL 片段，失效引用显示危险色；图片粘贴/拖入经既有 saveAsset 与只读协议显示。
- 未新增颜色变量或 token 检查器白名单。Figma 只读核对 Document Header `466:38578`；布局沿用计划的 `482:37226` / `482:38315` 目标，Figma 未写入。

### W2 验证与修复

- 19 个原创往返 fixture，覆盖 README 格式、双链/标签、中英混排、三种列表符号/起始值、任务列表、GFM 表格对齐、两种围栏、HTML、脚注、Frontmatter、CRLF、BOM、emoji、扩展块、空行、图片、接近 4 MiB 与嵌套图片复杂结构。fixture 目录使用 `.gitattributes` 禁止换行转换，保证 Windows checkout 仍覆盖原始 LF/CRLF/BOM。逐字节往返、单块最小差异、未知结构、Frontmatter scalar 与双链保留测试通过。
- 块视图实窗验证 20 次视图往返、文本选区往返、打开不写盘、单块编辑、外部更新保留未改动 DOM、基础块转换、引用候选/新标签跳转、图片粘贴实际保存与加载、图标与标题改名。Agent 原测试改为块视图选区定位，业务断言保留并通过。
- 原源码输入测试显式选择“源码”，副本/新文档验证默认块视图；保留更新前保存、冲突、CRLF、重启与跨目录行为断言。
- 发现并关闭 StarterKit 的 trailingNode 默认扩展：自动尾段会在反复切换后累计空行。发现 remark 默认转义双链，增加文本 handler 保留双括号。
- 首轮完整回归 **188/190（5.8m）**：日历环境失败保留；旧标签迁移失败定位到 Tiptap 在 React 提交前读取尚未挂载的 view.dom。改为 `immediatelyRender: false` 并等待初始化后挂载块控件/缓冲区接口，独立 **5/5（10.0s）** 复验通过。首轮日志 `/private/tmp/jarvis-writing-w2-smoke.log`，最终全套日志 `/private/tmp/jarvis-writing-w2-smoke-final.log`。
- 第二轮完整回归 187/190（6.3m）：旧标签迁移已通过；保留日历环境失败。开发模式模型对话用例一次超时，独立复验通过。新增块转换断言定位到 Radix pointerdown 打开菜单早于 click，原目标未捕获而误转换相邻列表；改为 onOpenChange 固定目标与选区，并只从编辑器正文追踪悬停，转换完整流程通过。
- 最终源码 check/build、写作/Agent/转换/文件树专项 **10/10（21.6s）** 通过。19 样本的 schema 有效性也校验，无法表示的复杂结构明确显示原文块，不把非法 ProseMirror 节点交给编辑器。
- 最后完整回归 **189/190（5.8m）**，唯一为 macOS 日历未授权环境用例；旧标签迁移、块转换、开发模式模型对话、Agent、写作、更新均通过。日志 `/private/tmp/jarvis-writing-w2-verified.log`。之后仅补充复杂 Markdown 节点合法性检查与第 19 份嵌套图片 fixture，转换专项 **5/5（2.8s）** 通过；不把整套回归称为全绿。最终 check/build 通过。未签名 macOS arm64 目录包 `release/bd29bd32-641d-4ad9-bb8e-7d8fb658d299` 经新脚本 `node apps/desktop/scripts/verify-packaged-writing.mjs release/bd29bd32-641d-4ad9-bb8e-7d8fb658d299` 验证：**487 项生产依赖**、ASAR 原生启动、0.4.0、打开块编辑器、实际修改与保存均通过，无 pageerror。截图 `/var/folders/wj/jwvdfxm571qcz67200hp7mkw0000gn/T/jarvis-packaged-writing-rp5dcM/writing-blocks.png`。脚本独立于现有旧标签启动验证，避免影响历史版本发布重试。
- 浅深块编辑截图：`apps/desktop/test-results/4ba08b30-dd7e-4e32-bb1d-a1d2ad617287/writing-blocks-blocks-open-fe5f8-switches-and-edit-one-block/blocks-light.png`、`blocks-dark.png`。已检查单行工具栏、680px 正文、标题与 H1 独立、大纲位置；Figma 阶段签收仍待 Claude。

### W2 边界

- W2 交付时 `+` 为基础块菜单、扩展模块为原文块；现已由下方 W3 升级。W4 的 AI 自动发送仍未实施，当前入口预填到写作助手，由用户发送。
- Frontmatter/特殊扩展保留为原文块，复杂 HTML 不执行。混合图片与正文的同一 Markdown 段落使用原文块，独立图片可预览/插入。
- 原生历史属于挂载的编辑器视图；缓存代次保证卸载不会重新放回已经失效的历史，切换视图是历史边界，块视图切换文档时重建本地历史。Agent 事务账本与跨标签同轮撤销独立保留。
- Claude 的阶段视觉验收、其他操作系统真机、真实模型服务尚未验证；不将模拟服务或未签名本地目录包称为发布。

## W3：已实现，完整门禁仍有基线限制

实现提交：`d6a1bcb`（`feat ✨️: 实现写作W3命令面板与富模块`）。

2026-10-26 用户明确要求“继续 W3”。继续保留日历环境限制和 Claude 待验收状态，不改写既有结果。

依赖：Mermaid 12.1.0（2026-10-02；12.2.0 发布时间不足两周）、pinyin-pro 3.29.5（2026-10-10）、lowlight 3.3.0、CodeBlockLowlight 3.31.4。额外显式声明 highlight.js 11.12.0，原因是直接导入常用语言模块，避免依赖传递可见性。Mermaid 动态加载，不进入写作首屏依赖。

### W3 实现

- `/` 与块左侧 `+` 打开 320px 命令面板，最大高 400px；三组共 21 项，中文、拼音全拼/首字母、英文关键字筛选，上下键/Enter/Esc、无结果状态与组合输入保护。已有文档里的斜杠不会在打开时自动触发；Esc 后继续输入不反复弹出。AI 项走统一 `assistant-bridge.ts` 入口，保持预填与打开助手，W4 再完成自动发送/块上下文。
- 富模块 schema 与 React NodeView 分离：纯转换测试不依赖 TSX。Callout 六类及可编辑标题/嵌套内容；Toggle 固定 details/summary Markdown 与仅在视图内展开；代码语言选择、lowlight 常用六种语言与复制；表格增删行列/列对齐；图片图注、缩放手柄与对齐。
- Mermaid 动态导入，strict、禁止自动启动，保留库默认 secure 键并锁定主题/CSS等初始化配置；外观取现有 tokens。流程/时序/状态模板、源码/预览、错误与行提示、展开/全宽。真实请求事件验证写作首屏不请求 Mermaid core，插入图表后才请求；内嵌指令不能弱化 securityLevel 或覆盖全局 CSS。
- 思维导图复用 React Flow，前端水平树布局；两空格缩进列表为唯一持久格式，坐标不写盘。Tab 子节点、Enter 同级、Delete（根不可删）、方向键、双击编辑、适应/全屏/全宽；无效格式或超出 1000 节点时保留可编辑源码并提示。
- 全宽、折叠展开、图片宽度/对齐均为视图状态；保存仍为 UTF-8 Markdown。Agent 修改高亮为 info-subtle + accent 左条，1.2s 透明度淡出，并提供 reduced-motion 静态提示；原同轮撤销和不自动落盘继续保留。
- 新增 5 份富模块 fixture，往返库共 24 份，增加嵌套 Toggle/双链、代码中的关闭标签、Callout 与图表语法覆盖；没有私有 JSON/侧车文件，没有新增 IPC/权限或颜色变量。

### W3 验证与修复

- check/build 已通过；转换与往返首轮 8/8，综合写作专项 16/16（22.8s）通过。富模块插入/编辑/保存/重开、导图键盘、Mermaid 懒加载与安全指令隔离、代码高亮/正文复制、图片显示状态不落盘均有实窗覆盖。
- 修复命令项可访问名称包含描述而无法精确定位；修正 Esc 的关闭状态。保留此前失败日志，未删除行为断言。
- Mermaid 实际渲染已成功（首张 SVG 约 130ms），最初失败是本地 file 资源未进入 PerformanceResourceTiming 的观测方式；改用真实 request 事件。测试异常清理只销毁隔离窗口，应用未保存保护不变。
- 新图片 NodeView 下暴露初始化首帧粘贴被忽略，改为等待编辑器/缓冲区接口就绪；原块编辑/图片回归连续 3/3（20.8s）通过。
- 截图检查发现 NativeSelect 外层占满宽度，挤压标题/图表 Tabs；修正 wrapper 的 flex 宽度。`+` 后立即输入曾污染前一段落，增加同步 DOM 焦点写回；新增断言验证查询词不落入正文，连续 3/3（6.5s）通过。
- 富模块浅深截图与 slash 筛选截图最初在 `apps/desktop/test-results/1b42e847-1b2f-4000-a8ea-6c5aca78e6b3/`；布局与加号修复后的 Callout/Toggle 截图在 `apps/desktop/test-results/0c77106c-d94b-4451-82b6-a3a0503eafc8/writing-rich-blocks-slash--6c780-itable-callouts-and-toggles-repeat2/`。完整 `pnpm test:smoke` 为 **197/199（5.9m）**，W3/写作及其余业务通过；保留日历未授权失败与 `appearance.spec.ts:121` 的真实窗口焦点恢复失败（期望 true，实际 false）。没有跳过或放宽断言。日志 `/private/tmp/jarvis-writing-w3-smoke.log`。
- 焦点用例单独三次均复现；在 `/private/tmp/jarvis-w3-focus-baseline` 用 `26d2f2f` 的 W2 源码副本、复用当前已装依赖构建后，同一断言仍失败，日志 `/private/tmp/jarvis-w3-focus-baseline.log`。当前未改 appearance 实现；未进一步归因，不称整套通过。
- 最后补充 Toggle 内双链序列化 handler 复用与第 24 个 fixture，避免编辑摘要后把内部双链转义；转换与往返 **9/9（2.8s）** 通过。随后最终 check/build 通过。
- `pnpm package:dir` 生成未签名 macOS arm64 目录包 `release/70c95829-75a3-40cd-b95c-990a57adbf53`；`node apps/desktop/scripts/verify-packaged-writing.mjs release/70c95829-75a3-40cd-b95c-990a57adbf53 --rich` 验证 **593 项生产依赖**、ASAR 原生启动、Mermaid 动态加载、导图预览与实际编辑保存通过，无 pageerror。截图 `/var/folders/wj/jwvdfxm571qcz67200hp7mkw0000gn/T/jarvis-packaged-writing-fnBIwv/writing-blocks.png`。版本仍 0.4.0，未发布。

### W3 设计与边界

- 只读读取 Figma 文件 `mIwnyR5nAlECFMam1NvmER`：Slash Menu `470:39640`、Callout `471:39165`、Mermaid `471:39499`、Mind Map `471:39677` 的设计上下文与截图；沿用 V1 Button/Input/NativeSelect/Tabs/CandidateList/Dialog/Alert，不写 Figma。
- 导图使用按文字长度约束的节点宽度与水平布局，数据变化时重新布局；普通图与全屏图共享 Markdown，展开/缩放不落盘。未将静态评审样张坐标写入内容。
- W4 的自动发送、块类型/headingPath 上下文与富模块系统提示词尚未实施；W5 星图未实施。Claude 阶段视觉验收、Windows/macOS 目标设备与真实模型服务仍未由本轮替代。

## W4：块级 Agent 联动（2026-10-26）

用户明确“继续 W4”，沿用 feature/writing-space，不把 W3 的回归失败或 Claude 待验收状态改写为通过。

### 实现

- 统一入口设置 Markdown 选区并展开当前文档侧栏；/ AI 项、块菜单“AI 编辑此块”、BubbleMenu“AI 润色”直接发送指令。侧栏等待 Agent 加载完成再消费请求，消费即移除且提交互斥；发送失败保留指令和错误供重试。
- 整块选择保留完整 Markdown 范围（含围栏），原子块以 NodeSelection 表示，普通块使用文本选区；局部选区保留源码偏移，后续用户选择或内容修改时清除精确范围。覆盖没有文本子节点的 Mermaid 等原子块。
- 快照新增可选 block.type / headingPath，旧快照仍可解析；源码与块视图共用从当前缓冲区生成的上下文。系统提示增加 Callout、Mermaid、mindmap 两空格列表示例，要求新增块用 insert_text、润色限制选区、保留块类型。
- 沿用 W2 增量更新及 W3 高亮、修改卡片与整轮撤销。没有新增依赖、IPC、工具或磁盘权限；版本与账本语义不变。

### 验证

- 命令/事务专项 4/4，通过旧快照兼容、富块类型/标题层级、工具无文件操作、范围/版本/租约、UTF-16 与同轮撤销。
- 扩展原写作 Agent 实窗：三个入口（另加 Mermaid 整块）关闭侧栏后自动打开并发送，逐项验证一次请求、精确 selection.text、block 元数据、不落盘和撤销；原手动两处编辑、高亮、原生撤销/重做、改名、跨标签修改、冲突和作用域拒绝断言均保留。最终专项 1/1（7.7s）通过。
- 初轮新增测试因正文未聚焦而未显示 BubbleMenu，修正为先聚焦正文；加入 Mermaid 后其 SVG 的 p 标签使测试定位不唯一，限定正文文本定位。没有放宽业务断言。
- check/build 通过。首轮完整回归 198/200（6.0m）：日历未授权失败保留，新增整段 NodeSelection 导致视图往返后选中文本多出换行。修正为仅原子块使用 NodeSelection，普通块恢复文本选区；保留原断言，修复后写作/Agent/命令专项 **6/6（15.1s）** 通过。首轮日志 `/private/tmp/jarvis-writing-w4-smoke.log`；最终完整回归 **199/200（6.0m）**，唯一失败为既有 macOS 日历未授权；窗口焦点和写作选区回归通过，日志 `/private/tmp/jarvis-writing-w4-smoke-final.log`。不把完整门禁标为全绿。
- 最终 check/build/diff 检查通过。未签名 macOS arm64 目录包 `release/d2db49ab-3cef-4404-a678-4907112f6015` 经 `verify-packaged-writing.mjs --rich` 验证 **593 项生产依赖**、ASAR 启动、Mermaid/导图与实际编辑保存通过；截图 `/var/folders/wj/jwvdfxm571qcz67200hp7mkw0000gn/T/jarvis-packaged-writing-En9Jke/writing-blocks.png`。未改版本、未发布。
- 截图：`apps/desktop/test-results/cf1ba2b9-c2c1-445f-ae30-6bc290666671/writing-agent-writing-Agen-c2325--and-rejects-stale-versions/` 的 w4-block/rich/bubble/slash.png。已查看选区修改、高亮和回执；沿用已有组件与样式，未修改 Figma 或 tokens，Claude 视觉签收仍待进行。只读核对 Figma Block Menu `470:38997`、Block Highlight `471:39798` 的上下文与截图，沿用既有实现。

## W5–W6

尚未开始。
