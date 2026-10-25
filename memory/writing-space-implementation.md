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

- 仅完成 W2；完整 `/` 命令分组、富模块 NodeView 与 W4 的 AI 入口自动发送仍在后续阶段。当前 `+` 使用基础块菜单，AI 润色预填到写作助手，由用户发送。
- Frontmatter/特殊扩展保留为原文块，复杂 HTML 不执行。混合图片与正文的同一 Markdown 段落使用原文块，独立图片可预览/插入。
- 原生历史属于挂载的编辑器视图；缓存代次保证卸载不会重新放回已经失效的历史，切换视图是历史边界，块视图切换文档时重建本地历史。Agent 事务账本与跨标签同轮撤销独立保留。
- Claude 的阶段视觉验收、其他操作系统真机、真实模型服务尚未验证；不将模拟服务或未签名本地目录包称为发布。

## W3–W6

尚未开始。
