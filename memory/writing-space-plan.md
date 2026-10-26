# 执行计划书：写作空间重新设计（Connecting the Dots）

最后更新：2026-10-26（用户明确开始 W6；此前回归失败与待验收状态继续保留）

你在仓库 `qianyuzhao-ai/Jarvis`（Electron + React 桌面工作台）中工作。本计划把写作空间改造成：全格式目录树 + Notion 式块级编辑（保留源码模式）+ `/` 命令面板与富模块（思维导图、Mermaid 等）+ 写作 Agent 块级联动 + 「Connecting the Dots」星图。设计已定稿为初稿，**按设计实现，不自行改变视觉方向，不实现本计划以外的功能**。按阶段提交；每阶段结束时写验收证据，最后由 Claude 按第 10 节逐条验收。

执行补充（2026-10-26）：用户明确要求“继续执行 W2”，本轮按此继续，不把 W1 的 macOS 日历未授权用例或 Claude 待验收状态改写为通过。随后用户明确要求“继续 W3”，据此实施第三阶段；随后明确“继续 W4”，继续第四阶段；随后明确“继续 W5”，实施星图阶段；随后明确“开始 W6”，执行总验收与收尾。实施证据与具体边界见 `memory/writing-space-implementation.md`。

## 0. 必读资料

1. 根目录 `AGENTS.md`：协作规则、命令、进程边界、**文件删除限制**（禁止 `rm -rf` 等批量删除；只能逐个删除明确路径的文件）、当前范围。本计划授权的范围变化见第 2 节，完成后同步更新 `AGENTS.md`「当前范围」。
2. `memory/engineering.md`：工程命令、进程边界、测试做法。
3. `memory/ui-v1-implementation.md`：V1 组件的实现约定（cva、`cn`、`@jarvis/ui/icons`、预览页、`scripts/check-tokens.mjs`）。沿用同样约定。
4. `memory/design.md` 顶部「写作空间重新设计：页面拼接」「写作空间重新设计：组件初稿」两节。
5. `memory/figma-sync-2026-10-21/writing-space-components-state.json`：全部组件与页面的 Figma 节点 ID、变体、属性。
6. 实现方案（产品层说明与决策来源）：[Google 文档](https://docs.google.com/document/d/1g_eXz9PgoO5-4QvWC77TR4ZxMlXU30oPZv7xV1R0m5g/edit)。本计划与之冲突时以本计划为准。
7. Figma 文件 `mIwnyR5nAlECFMam1NvmER`。能访问 Figma MCP 就逐项核对；不能时以本计划数值和 state 文件为准。

### 设计来源索引

| 内容 | Figma 节点 |
|---|---|
| 页面 `V1-视觉换新` · 分区「写作空间 · 重新设计」 | `482:37225` |
| 块编辑页 Light / Dark | `482:37226` / `482:38315` |
| `/` 面板 + 反向链接页 Light / Dark | `483:54226` / `483:54935` |
| 全景星图页 Light / Dark | `484:40061` / `484:41707` |
| PDF 预览页 Light / Dark | `484:40856` / `484:42362` |
| 页面 `V1-Components` | `332:28013` |
| 29 Writing · File Tree（File Tree Row、File Tree Menu、Writing Left Header、File Preview） | Section `461:37991` |
| 30 Writing · Document（Document Header、Document Toolbar、Outline Rail、Inline Reference、Backlink Item、Backlinks） | Section `466:38295` |
| 31 Writing · Block Editor（Block Handle、Drop Indicator、Block Menu、Turn Into Menu、Bubble Menu、Slash Command Item、Slash Menu） | Section `470:38586` |
| 32 Writing · Rich Blocks（Callout、Toggle、Code、Mermaid、Mind Map Node、Mind Map Block、Image、Table、Block Highlight） | Section `471:39101` |
| 33 Writing · Dots Graph（Dot、Graph Edge、Resonance Card、Graph Mini Panel、Graph Toolbar、Timeline Slider） | Section `473:39285` |
| V1 图标库（新增 35 个，共 95 个 `Icon / *`） | Section `391:32605`，网格 `391:32607` |

每个分区底部有 `… / Review` 浅深评审样张，是状态组合的参考。

## 1. 分支与提交

- 从最新 `origin/develop` 创建 `feature/writing-space`。保留已有未提交改动，不重置、不丢弃。
- 阶段 W1 → W6 按顺序，每阶段至少一个独立提交，中文信息（`feat: …` / `refactor: …` / `test: …`）。
- 每阶段完成后推送功能分支。**不要**创建 PR、合并、打标签或发布。
- 在 `memory/` 新建 `writing-space-implementation.md` 记录每阶段 SHA、命令结果、截图路径、与本计划的差异和理由，并登记到 `AGENTS.md` 记忆索引。本计划如需调整（必须有理由），同步改本文件并在实施记录里说明。

## 2. 用户已确认的决策（2026-10-25）

1. **写作 Agent 可以读取其他文档**：只读，仅限当前文档所属文件夹，只给标题、标签、摘要（不读全文），用于「寻找共鸣点」。
2. **拖线连接**：只在**来源文档末尾**的「## 关联」段追加 `- [[目标]]`，不写目标文档；反向关系由索引推导。
3. **大标题即文件名**，与正文第一个 H1 独立，不互相同步。
4. **阶段顺序**按本计划：目录与标签先行，星图最后。

基础技术决定（不得改变）：

- **Markdown 字符串是唯一真相源**。`DocumentSession.content` 仍是缓冲区；Tiptap 块视图与 CodeMirror 源码视图都只是它的视图。写作 Agent 的四个缓冲区工具、SHA-256 版本校验、15 秒租约、同轮撤销与操作账本**行为不变**。
- **未修改的块按原文输出**（块级原文保留），打开后不编辑不得出现「未保存」或字节差异。
- **所有磁盘操作在主进程**，只接受「文件夹 ID + 相对路径」，渲染进程不获得通用文件能力。

## 3. 全局约束

- pnpm、TypeScript strict、Biome、Tailwind v4、Lucide（只经 `@jarvis/ui/icons` 导入）。React 组件 PascalCase 文件名，其余 kebab-case。
- 不关闭 sandbox / contextIsolation；renderer 不导入 Electron / Node API；不向 renderer 暴露通用文件、Shell 或 IPC。新增原生能力只能是第 5 节列出的写作 IPC 与 `jarvis-writing://` 只读协议，全部 zod 校验、沿用 `main/writing/bridge.ts` 的 mainFrame + 可信 URL 校验。
- `packages/ui` 保持无业务依赖。写作业务组件放 `apps/desktop/src/renderer/src/features/writing/`。只有确实通用、与写作无关的控件才进 `packages/ui`（本计划不要求新增）。
- 只用现有 tokens 变量类，**不新增颜色变量**，`scripts/check-tokens.mjs` 不得新增白名单条目。
- 删除文件只用 `shell.trashItem`（移入废纸篓），文件夹仅限空文件夹。
- 文稿保持 UTF-8 Markdown 纯文本，不生成私有数据库；图谱索引放 `userData`，是可随时重建的缓存。
- 新依赖锁定**精确版本**（不带 `^`/`~`，发布至少两周），更新 `pnpm-lock.yaml`；打包后必须通过 `scripts/verify-packaged-dependencies.cjs`。
- 测试：不得删除行为断言来通过；定位器因布局变化可更新，但原有业务断言必须保留等价覆盖。允许删除的断言只有：写作空间旧的内部 `localStorage['jarvis:writing-tabs:*']` 恢复断言（由全局标签恢复替代），需在实施记录中逐条列明替代用例。
- 每阶段结束必须通过 `pnpm check`、`pnpm build`、`pnpm test:smoke`（完整回归）；无法运行时如实说明原因，不得声称通过。
- **范围外（不要实现）**：「转换为 Markdown 副本」（docx/csv）；思维导图 JSON 格式；协同编辑；云同步；数学公式块；写作 Agent 读取其他文档**全文**或写其他文档；Shell 工具；扫描用户其他 Agent / Pi 技能目录。

## 4. 现状（实现前必须读懂的代码）

| 位置 | 现状 | 本计划要改 |
|---|---|---|
| `src/main/writing/files.ts` | `list()` 只放行 `.md`；`bytes()` 只读 `.md`；`location()` 做越界与符号链接校验；`save()` 原子写 + 版本校验；`create()` | 全格式列表、文本白名单读写、新增 rename/move/duplicate/trash/reveal/saveAsset |
| `src/main/writing/bridge.ts` | IPC：roots/list/read/save/create/search/choose | 新 IPC、推送事件、资产协议注册 |
| `src/shared/writing.ts` | 请求 schema 与 `WritingBridge` 类型 | 新 schema、条目字段 |
| `src/preload/index.ts` | `desktop.writing.*` 七个方法 | 增加对应方法与事件订阅 |
| `src/renderer/src/features/writing/useWriting.ts` | 单一「当前文件夹」`root`；`localStorage['jarvis:writing-tabs:<rootId>']` 恢复文档；2.5 秒轮询外部修改 | 多文件夹文档、删除旧标签存储、改名联动、监听事件 |
| `src/renderer/src/features/writing/WritingSpace.tsx` | 左栏目录树 + 编辑区 + 右侧写作助手宿主 | 新左栏、EditorHost、文件预览、星图 |
| `src/renderer/src/features/writing/MarkdownEditor.tsx` | CodeMirror 6 | 保留为源码视图 |
| `src/renderer/src/features/writing/use-writing-host.ts` | Agent 命令宿主；`find()` 要求文档属于当前文件夹；`changeBuffer()` 用 CodeMirror 全文替换 | 按 scope rootId 查找；视图无关的缓冲区更新 |
| `src/renderer/src/features/writing/writing-transactions.ts` / `writing-history.ts` | 同轮事务与撤销（基于文本） | 不改语义 |
| `src/renderer/src/App.tsx`（约 296–361 行） | 写作标签按 `writing.root` 过滤（`pruneTabs`） | 改为按文档自身 rootId |
| `src/renderer/src/features/shell/tabs.ts` | `TabView` 已有 `rootId` | 增加 `fileType`（可选） |
| `src/main/agent/packs/writing.ts` | 四个缓冲区工具 | 增加 `find_related_documents`、选区块信息、富模块提示词 |
| `src/main/agent/writing-broker.ts` / `service.ts` | 写作命令转发、会话 `writingScope` | 改名迁移会话与账本作用域 |
| `src/shared/agent-ledger.ts` | `pack: canvas | writing | files` | 增加 `writing-link` |
| `src/shared/agent-targets.ts`、`features/agent/open-targets.ts` | 上报当前文件夹已打开文档 | 上报所有已打开写作文档 |
| 测试 | `writing.spec`、`writing-agent.spec`、`writing-agent-commands.spec`、`window-tabs.spec`、`agent-delegation*.spec`、`agent-generation.spec`（写作汇总） | 全部保持通过，并新增第 9 节用例 |

---

## 阶段 W1：目录、文件能力与标签收敛（不依赖新编辑器）

### W1.1 共享类型（`src/shared/writing.ts`）

```ts
export type WritingFileType = 'markdown' | 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary';
export interface WritingEntry { name: string; path: string; kind: 'file' | 'directory';
  fileType?: WritingFileType; size?: number; mtime?: number; }
```

- 新增 `writingFileType(name)`（共享纯函数，主进程与渲染层共用）：
  - markdown：`.md .markdown`
  - text：`.txt .json .yaml .yml .toml .csv .tsv .log .ini .xml .js .mjs .cjs .ts .tsx .jsx .py .rb .go .rs .java .kt .swift .c .h .cpp .css .scss .html .sh .zsh .sql`
  - image：`.png .jpg .jpeg .webp .gif .svg`；pdf：`.pdf`；audio：`.mp3 .wav .m4a .ogg`；video：`.mp4 .webm .mov`
  - 其余为 binary。
- 新 schema：`writingRenameSchema {rootId, path, name}`、`writingMoveSchema {rootId, path, targetDir}`、`writingTrashSchema {rootId, path}`、`writingRevealSchema {rootId, path}`、`writingAssetSchema {rootId, documentPath, mime: 'image/png'|'image/jpeg'|'image/webp'|'image/gif', bytes: Uint8Array ≤ 10 MiB}`。名称校验复用 `create()` 的规则（抽成共享函数 `validateEntryName`）。

### W1.2 主进程 `WritingFiles`（`src/main/writing/files.ts`）

| 方法 | 行为 |
|---|---|
| `list(rootId, path)` | 返回除 `.` 开头外的全部文件与文件夹，带 `fileType/size/mtime`（`lstat`，符号链接条目不展示）；排序不变（文件夹在前，`zh-CN` numeric）。 |
| `search(rootId, query)` | 同步放开格式，上限不变（20 000 访问 / 300 结果）。 |
| `read` / `save` | 允许 markdown 与 text；其他类型报「这个格式不能作为文本打开」。UTF-8 严格解码失败报「文件不是 UTF-8 文本」。4 MiB 上限、BOM/CRLF 保留、原子写、版本校验均不变。 |
| `create(…, kind:'file')` | 名称无扩展名时补 `.md`；有扩展名且属于 markdown/text 时保留，其他扩展名报错。 |
| `rename(rootId, path, name)` | 同目录改名；目标存在 → `WritingConflict('已存在同名文件')`；`serial` 串行化；返回新条目。 |
| `move(rootId, path, targetDir)` | 同一授权文件夹内移动；不能移到自身或子目录；目标重名冲突。 |
| `duplicate(rootId, path)` | 生成「名称 副本.ext」，重名递增「名称 副本 2.ext」；文件夹不支持。 |
| `trash(rootId, path)` | 文件：`shell.trashItem`（注入函数，测试可替换）。文件夹：`readdir` 为空才移入，否则报「文件夹不为空」。 |
| `reveal(rootId, path)` | `shell.showItemInFolder(absolute)`（注入）。 |
| `saveAsset(rootId, documentPath, mime, bytes)` | 校验魔数与 mime 一致、≤ 10 MiB；写入 `dirname(documentPath)/assets/`（不存在则建）；文件名 `YYYYMMDD-<sha256 前 8 位>.<ext>`，内容相同复用；返回相对文档的路径 `./assets/<name>`。 |

所有新方法先经 `location()`；错误信息不含绝对路径。

### W1.3 IPC、推送与协议（`src/main/writing/bridge.ts`、`src/main/index.ts`、`src/preload/index.ts`）

- 新增通道：`writing:rename`、`writing:move`、`writing:duplicate`、`writing:trash`、`writing:reveal`、`writing:save-asset`。写入类计入 `activeWrites`（更新安装保护）。
- 推送 `writing:changed {rootId, paths[]}` 与 `writing:renamed {rootId, from, to}`：只发给可信窗口。
- **文件监听** `src/main/writing/watcher.ts`：渲染层「订阅」某 rootId 时，用 `fs.watch(directory, {recursive:true})` 监听；300 ms 防抖合并路径；忽略 `.jarvis-*.tmp` 与隐藏文件；Linux 上不支持递归时退化为保留现有 2.5 秒轮询（必须有这条退化路径）。窗口销毁时取消订阅。监听只用于刷新目录与标记外部修改，**不替代** `save()` 的版本校验。
- **资产协议** `src/main/writing/asset-protocol.ts`：在 `protocol.registerSchemesAsPrivileged` 增加 `jarvis-writing`（standard、secure、stream、supportFetchAPI），`protocol.handle` 只接 GET，URL `jarvis-writing://<rootId>/<encodeURIComponent(path)>`；路径经 `location()`；只返回 image/pdf/audio/video；支持 Range；响应头只带 content-type、content-length、content-range、accept-ranges、`Cache-Control: no-store`。写法参照 `main/generation/bridge.ts` 的 `jarvis-media`。
- preload 增加对应方法与 `onChanged/onRenamed` 订阅（返回取消函数），`WritingBridge` 类型同步。

### W1.4 渲染层：多文件夹文档与标签收敛

- `useWriting`：
  - 删除 `jarvis:writing-tabs:<rootId>` 的读写。首次启动迁移：若旧键存在，把其中文档转成全局写作标签（去重，交给 App 的 `open`），然后删除旧键。
  - 文档会话不再要求属于 `root`：`root` 改名为「目录树当前文件夹」，只影响左栏目录树与星图；`openDocument` 接受 `(rootId, entry)`；切换左栏文件夹**不再关闭**其他文件夹的文档（去掉 `switchRoot` 里「先 flush 再切换」对已打开文档的影响，只需保存，不丢弃）。
  - 外部修改检测：有 watcher 事件时立即检查对应文档；保留 2.5 秒轮询作为退化。
  - 改名联动：收到 `writing:renamed` 时更新 `DocumentSession.path/id`（id = rootId + ':' + path），并通知 App 更新标签（见下）。
- `App.tsx`：`pruneTabs` 的写作条件改为「文档在 `writing.documents` 中存在（按 tab.rootId + ref）」，不再比较 `writing.root`；切换左栏文件夹不裁剪其他文件夹的标签。改名时 `ref` 与 `title` 同步，后退 / 前进历史中的同一文档也更新。
- `use-writing-host.ts`：`find()` 改为按 `scope.rootId + path` 查找已打开文档；`canUndo` 去掉 `doc.rootId === root.id` 条件；`setOpenDocuments` 上报所有已打开写作文档（全部文件夹）。
- `TabView` 增加可选 `fileType`，标签图标随类型（file-text / file-code / file-image / file-music / file-video-camera / file-archive）。

### W1.5 Agent 侧改名迁移

- `AgentService.renameWritingScope(from, to)`：把会话 `writingScope`、卡片产物路径、账本条目 `writingScope` 中等于 `from` 的改为 `to`（文件夹改名或移动时按前缀改写）。由 bridge 在 `rename`/`move` 成功后调用；该文档有运行中的回复时，`rename`/`move` 直接拒绝：「写作助手正在修改这个文档，请稍后再改名」。
- 主 Agent 的 `writing-library` 包不变，但 `list_documents`/`search_documents` 继续只列 Markdown（文本类型不进入主 Agent 的文档工具）。

### W1.6 左栏 UI（Figma 29）

- `features/writing/tree/WritingSidebar.tsx`：`Writing Left Header`（文件夹选择「我的文档 ▾」：已授权文件夹 + 「添加文件夹」；右侧操作 files 视图为 搜索 / 新建文档 / 新建文件夹，graph 视图为 寻找共鸣点 / 在编辑区展开全景；下方 Tabs segment「文件 | 星图」，选中项按文件夹存 `localStorage['jarvis:writing-left-view:<rootId>']`，读写包 try/catch，失败默认「文件」）。W1 中「星图」标签可见但内容为「星图将在后续版本提供」空状态，W5 接入。
- `FileTreeRow.tsx` 按 `File Tree Row`：高 28、左右 6、间距 4、radius-control；缩进每级 12；文件夹有 12px 箭头槽（文件也保留同宽空槽对齐）；类型图标 16（fg-secondary）；名称单行省略；外部格式（binary、pdf）显示 Badge neutral subtle（扩展名大写）；hover / selected 显示 ghost icon-xs「更多」；行内改名（输入框 surface + focus-ring 1.5px，Enter 确认，Esc 取消，失焦确认，重名回滚并 toast）；拖放目标（info subtle 底 + accent 1px 描边）。键盘：上下移动、左右折叠展开、Enter 打开、F2 改名、Delete 移到废纸篓（确认框）。
- `FileTreeMenu`（DropdownMenu，同时作为右键菜单）：
  - 文件：在新标签页打开、重命名、移动到…（打开文件夹选择对话框，只列当前文件夹内的目录）、创建副本（⌘D）、在访达中显示（Windows 文案「在资源管理器中显示」）、分隔、移到废纸篓（⌘⌫，AlertDialog 确认）。
  - 文件夹：新建文档（⌘N）、新建子文件夹（⇧⌘N）、重命名、在访达中显示、分隔、移到废纸篓（仅空文件夹；非空时禁用并说明）。
- 拖拽文件到文件夹行完成移动。
- **文件预览** `features/writing/viewers/`（Figma `File Preview`）：image（按比例适应、尺寸与大小、复制 Markdown 引用、插入到最近激活的 Markdown 文档末尾）；pdf（`<iframe src="jarvis-writing://…">` 由 Chromium 内置查看器渲染，外层沿用卡片样式与页数信息可省略）；audio / video（原生控件）；binary（信息面板 + 在访达中显示）。text 类型用源码视图（CodeMirror，按扩展名加载语言包，可选：至少 json / yaml / js / ts / python / html / css，其他纯文本）。非 Markdown 标签打开时右侧写作助手 Composer 禁用并提示「写作助手只支持 Markdown 与文本文件」（text 类型允许）。

### W1 验收

- 目录中有 `.txt/.png/.pdf/.docx/.zip/.mp3` 时全部可见且类型正确；空 Markdown 目录不再误报。
- 改名 / 移动 / 副本 / 废纸篓 / 定位五项各自主进程单测（越界、符号链接、重名、非空文件夹、名称非法、改名到自身子目录）与实窗用例通过。
- 改名一个已打开、写作助手有会话的文档后：标签标题更新；写作助手仍能读写该文档；账本撤销仍能找到它。
- 多个文件夹的文档可同时以标签打开；切换左栏文件夹不关闭其他标签；重启后标签由全局标签恢复；旧键迁移后被删除。
- 外部修改：watcher 下 1 秒内标记；无 watcher 时仍按轮询生效。
- 视觉：左栏与预览页浅深截图对照 Figma `29` 分区与 `484:40856` / `484:42362`。

---

## 阶段 W2：块编辑内核（Tiptap + 无损往返 + 双模）

### W2.1 依赖

`@tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder @tiptap/extension-bubble-menu unified remark-parse remark-gfm remark-frontmatter remark-stringify mdast-util-to-markdown`（精确版本，同一 Tiptap 主版本）。不引入 `tiptap-markdown` 一类整体序列化库（无法满足原文保留）。

### W2.2 转换层 `features/writing/editor/markdown/`

- `parse(markdown) → {doc, blocks}`：remark（gfm、frontmatter）→ mdast → ProseMirror 节点。每个**顶层块**节点带 `attrs.source`（原文片段）与 `attrs.sourceHash`；块之间的分隔（空行数量、行尾）记录在块的 `attrs.leading`。
- 映射：paragraph、heading 1–6、blockquote、bulletList / orderedList / taskList（保留原列表符号 `-`/`*`/`+` 与有序起始值）、codeBlock（保留围栏字符与长度、语言）、horizontalRule（保留原写法）、table（GFM，保留对齐）、image、hardBreak、行内 strong/em/strike/code/link。
- 扩展块（W2 先识别为可编辑或原文块，W3 做交互）：GitHub Alert 与 `[!CALLOUT 😀]` → callout；`<details><summary>` 固定结构 → toggle；```` ```mindmap ```` → mindMap；```` ```mermaid ```` → mermaid。
- 无法识别的结构（脚注定义、任意 HTML、数学公式、引用式链接定义等）→ `rawBlock`：不可编辑，显示原文与「在源码中编辑」按钮。
- `serialize(doc) → markdown`：节点内容与解析时一致（比较 `sourceHash` 与重新规范化后的内容）时**原样输出 `source`**；只有被编辑的块用统一规则生成（列表符号、强调符号沿用该块原写法；新块用 `-`、`**`、`_`）。Frontmatter 原样保留，只在设置图标 / 标签时修改对应键。
- 行内双链 `[[名称]]`、`[[名称|别名]]` 与 `#标签` 解析规则放 `src/shared/writing-links.ts`（主进程索引共用）：标签要求前面是行首或空白，排除标题 `#`、URL 片段与代码内文本。

### W2.3 EditorHost 与同步 `features/writing/editor/EditorHost.tsx`

- markdown 文档默认块视图，工具栏「块视图 | 源码」切换（按文档记住，`localStorage['jarvis:writing-view:<rootId>:<path>']`，失败用默认）；text 文档只有源码视图。
- 块视图 → 缓冲区：每个 Tiptap 事务结束后找出变化的顶层块，只重新序列化这些块，生成 `{from, to, text}` 补丁应用到 `content`（调用 `writing.change`），不做全文重写。
- 缓冲区 → 块视图（Agent、拖线、源码视图、重新读取）：对比新旧文本得到变化区间，定位受影响的顶层块，只替换这些块的 ProseMirror 节点；光标与未受影响块的 NodeView 状态保留。
- 维护「块 ID → 文本区间」映射（`blockRanges`），供 Agent 选区、高亮、大纲使用。
- 切换视图前同步当前视图修改；选区按文本偏移映射到另一视图最近位置。
- 撤销：块视图用 Tiptap history，源码视图用 CodeMirror history；切换视图是一次撤销边界。写作 Agent 的同轮撤销仍走 `WritingTransactions`（基于 `content`），与当前显示哪个视图无关。

### W2.4 `use-writing-host.ts` 视图无关化

- `stateFor()` / `changeBuffer()` 不再假设 CodeMirror：抽象接口 `BufferView { getSelection(): {from,to}; applyExternal(content, meta) }`，由当前挂载的视图实现；未挂载的文档只更新 `content`（并清除该文档的视图缓存，下次打开重新解析）。
- Agent 的 `agentHistoryAnnotations` / `finishWritingAgent` 语义在块视图中用 Tiptap 的 `addToHistory` 与 meta 实现等价分组：一轮 Agent 修改在用户撤销栈中是一步。
- `read_selection` 在块视图中返回的仍是文本偏移。

### W2.5 文档框架 UI（Figma 30）

- `Document Header`：Emoji（Frontmatter `icon`；点击打开简单 Emoji 选择 Popover，无图标时 hover 显示「添加图标」）+ 大标题（32 Bold，即文件名去扩展名；失焦或 Enter 调 `writing:rename`，保留扩展名；重名显示 danger 提示并回滚）+ 元信息（路径 · 修改时间 · 字数）。正文 H1 不同步。
- `Document Toolbar`：路径、文件名、保存状态（已保存 / 未保存 / 正在保存… / 外部已修改）、块视图 | 源码、搜索。
- 正文列：块视图宽 **680 居中**（窗口窄于所需宽度时按可用宽度减左右各 48，最小 480）；表格、思维导图、Mermaid 可展开到编辑区全宽（W3）。
- `Outline Rail`：编辑区右边缘，H1/H2/H3 短横线 16/12/8 宽，当前阅读位置强调色；悬停展开毛玻璃大纲卡片（`surface-raised` 92% + backdrop-blur，popover 阴影），点击平滑滚动，移开收起。两种视图共用（从 `content` 解析标题）。
- 块交互：`Block Handle`（hover 行首出现 + 与 ⋮⋮；点击 + 在下方建空块并打开 `/` 面板，空块原位打开；拖动 ⋮⋮ 移动块并显示 `Drop Indicator`；点击 ⋮⋮ 选中整块（`Block Highlight selected`）并弹出 `Block Menu`）；`Turn Into Menu`；`Bubble Menu`（划选文字时：AI 润色、加粗、斜体、删除线、行内代码、链接；链接模式可输入 URL 或 `[[` 选择文件）。
- `[[` 触发文件候选（`CandidateList`，数据来自目录搜索；W5 后改用索引），插入 `Inline Reference wiki-link`；`#标签` 渲染为 tag 胶囊。点击双链打开文档，⌘/Ctrl 点击在新标签页打开；目标不存在显示 broken。
- 粘贴 / 拖入图片 → `writing:save-asset` → 插入 `![](./assets/…)`；失败 toast，不插入。图片经 `jarvis-writing://` 显示。

### W2 验收（阶段门槛）

- **往返示例库** `tests/fixtures/writing-roundtrip/`（至少 15 个文件：GitHub README、Obsidian 笔记含双链与标签、中英混排、嵌套列表三种符号、有序列表起始值、任务列表、GFM 表格含对齐、围栏代码 ``` 与 ~~~、HTML 片段、脚注、Frontmatter、CRLF、BOM、emoji、4 MiB 边界附近的大文件）：每个文件「解析 → 不编辑 → 序列化」与原文**逐字节一致**；编辑一个块后，差异只出现在该块的文本区间。
- 打开文档不编辑：状态保持「已保存」，磁盘不写入。
- 块视图 / 源码切换 20 次内容不变，选区落在对应位置。
- 写作 Agent 原有用例在块视图下全部通过（版本冲突、同轮一步撤销、跨标签写回、未保存提示、不落盘）。
- 视觉：块编辑页浅深截图对照 `482:37226` / `482:38315`。

---

## 阶段 W3：`/` 命令面板与富模块（Figma 31、32）

### W3.1 `/` 面板

- 空块输入 `/` 或点击 +：`Slash Menu`（宽 320，最大高 400 可滚动，底部提示「上下键选择 · 回车插入 · Esc 关闭」）。条目用 `Slash Command Item`（32px 图标方块 + 名称 + 说明 + Markdown 快捷写法，active 为强调色）。
- 分组与条目：
  - **AI 写作助手**：AI 续写、AI 润色 / 改写、AI 总结全文、AI 生成思维导图、AI 生成流程图。
  - **基础排版**：正文、一级 / 二级 / 三级标题、无序列表、有序列表、待办清单、引用、分割线。
  - **内容强化与富模块**：思维导图、流程图 / 图表、高亮框、折叠块、表格、代码块、图片。
- 过滤：中文包含、拼音全拼与首字母（`pinyin-pro`，精确版本）、英文关键字（每条配 keywords）。无结果显示 empty。
- AI 条目不直接改文档，统一调用 W4 的 `askWritingAssistant`。

### W3.2 富模块 NodeView（`features/writing/blocks/`）

| 模块 | 交互与落盘 |
|---|---|
| Callout | `Callout Block` 六种：note/tip/important/warning/caution → `> [!NOTE]` 等；custom → `> [!CALLOUT 💡]`。类型切换菜单；标题默认取类型名（可编辑，写在标记同行之后）；内容可嵌套块。 |
| Toggle | `<details><summary>…</summary>` + 空行 + 内容 + `</details>`；展开状态不落盘。 |
| Code | 语言选择（ghost xs）+ hover 复制；高亮用 lowlight（按需注册常用语言）；字体用系统等宽字体栈。 |
| Mermaid | 预览 / 源码切换、展开；`mermaid` **动态 import**，`securityLevel: 'strict'`，`startOnLoad: false`；渲染失败显示 `mode=error`（错误信息 + 源码，出错行 danger 色）；模板：流程图、时序图、状态图。 |
| Mind Map | ```` ```mindmap ```` 内部为缩进 Markdown 列表（2 空格），第一项为中心主题。`@xyflow/react` 渲染，自研水平树布局（不存坐标）；节点 `Mind Map Node`（root / branch / leaf × default / selected / editing）。快捷键：Tab 新增子节点、Enter 新增同级、Delete 删除（root 不可删）、双击改字、方向键移动选中；适应视图；全屏编辑（Dialog）。每次编辑写回缩进列表文本；解析失败按普通代码块显示并提示。 |
| Image | 缩放手柄（宽度只在会话内，不落盘）；图注 = alt；左右对齐不落盘。 |
| Table | 行列增删（末尾 + 行 / + 列）、对齐（写入分隔行）、Tab 在单元格间移动。 |
| Block Highlight | agent：Agent 修改过的块 `info subtle` 底 + 左侧 2px accent 条，约 1.2 秒淡出；selected：整块选中。 |

- 宽模块（表格、思维导图、Mermaid）可切「全宽」，只影响显示。

### W3 验收

- 每个模块「/ 插入 → 编辑 → 保存 → 用外部编辑器读取 Markdown 正确 → 重新打开显示一致」；对应 fixture 加入往返示例库。
- 思维导图快捷键实窗用例；Mermaid 不进入首屏 chunk（构建产物检查：mermaid 单独 chunk，写作空间初始加载不请求它）。
- 视觉：`/` 面板页浅深截图对照 `483:54226` / `483:54935`，富模块对照 `32` 分区评审样张 `477:52159`。

---

## 阶段 W4：写作 Agent 块级联动

- `askWritingAssistant(prompt, range?)`（`features/writing/assistant-bridge.ts`）：展开右侧写作助手（若关闭），把编辑器选区设为 range，向该文档会话发送指令。入口：`/` 面板 AI 条目、`Block Menu`「AI 编辑此块」（range = 块的文本区间）、`Bubble Menu`「AI 润色」（range = 选区）。指令文案：续写「请从光标处接着写」、润色「润色所选内容，保持原意」、总结「总结全文，插入为文首的高亮框」、生成导图「根据全文生成思维导图，插入到光标处」、生成流程图同理。
- `read_selection` 返回增加 `block: { type, headingPath: string[] }`（只读信息，schema 向后兼容）。
- Agent 修改到达：块视图按 W2.3 增量替换，被改块显示 `Block Highlight agent`；回执卡片、整轮撤销、账本保持现状。
- 写作包系统提示词增加富模块语法（mindmap 缩进列表示例、mermaid 示例、Callout 写法），说明「新增块用插入工具，不重写整篇」。
- 权限不变：仍只能改当前文档缓冲区，不保存磁盘。

### W4 验收

- 三个入口各自唤起助手并只改对应块；高亮出现在被改块；一次撤销恢复整轮。
- `writing-agent-commands.spec` 中「工具不暴露文件操作」断言保持；新增 `block` 字段断言。

---

## 阶段 W5：星图（Connecting the Dots，Figma 33）

### W5.1 主进程 `GraphIndex`（`src/main/writing/graph-index.ts`）

- 点：授权文件夹内除隐藏文件外的每个文件：`path, name, fileType, mtime, firstSeen`（`birthtime`，无则首次索引时间）`, title`（Markdown 第一个标题或文件名）`, tags, summary`（正文前 200 字，去 Markdown 标记）`, inbound`（被引用次数）。
- 边：`link`（`[[双链]]`、指向文件夹内文件的相对链接、图片引用），每条带 `firstSeen`（所在文档 mtime 近似）；`tag` 关系按标签分组下发，不逐对存边。
- 双链解析：名称唯一时直接匹配；重名优先同目录，其次路径最短；找不到 → broken（供反向链接区与修复）。
- 存储 `userData/writing-index/<rootId>.json`（JsonFile 原子写），记录每文件 mtime+size；启动或首次打开星图时增量解析；watcher 事件与保存触发增量更新；分批（每批 ≤ 200 文件、批间让出事件循环）。上限 20 000 条目、单文件 4 MiB，超出时下发 `truncated: true`。
- IPC：`writing:graph {rootId} → {dots, links, tags, truncated, indexing}`；`writing:backlinks {rootId, path} → 引用本文的文档 + 上下文片段（≤ 120 字）`；推送 `writing:graph-changed {rootId}`。

### W5.2 拖线写入 `writing:link {rootId, from, to}`

- 只写 `from`：在文末「## 关联」段追加 `- [[to 名称]]`（段不存在则在文末加空行 + `## 关联`）；已存在同一链接则不重复。
- `from` 在任一标签打开：不写盘，向该窗口发缓冲区插入命令（复用写作宿主的外部更新路径），走正常保存；有未保存冲突（status conflict/error）拒绝。
- `from` 未打开：主进程按 `save()` 同样的版本校验原子写入。
- 记入操作账本：`ledgerEntrySchema.pack` 增加 `'writing-link'`，条目保存 `writingScope`、插入行文本、写入后 revision；撤销时文件 revision 仍为写入后的值才删除该行，否则提示「文档已被修改，未撤销」。撤销入口：`Resonance Card` confirmed 状态的「撤销」与 toast。

### W5.3 写作 Agent `find_related_documents`（决策 1）

- 写作包新增只读工具（risk read）：输入 `{ limit?: ≤ 200 }`；返回当前文档所属文件夹内**其他** Markdown 文档的 `{path, title, tags, summary, mtime}`（每条 summary ≤ 200 字），来自 GraphIndex；不返回全文，不跨文件夹。
- 「寻找共鸣点」流程：渲染层向当前文档的写作会话发送固定指令（「从当前文件夹找 3 个底层逻辑相通的旧文档，用 report 返回 path 与一句理由」）。Agent 结果以结构化活动（新增活动类型 `resonance: {path, reason}[]`，schema 向后兼容）回到渲染层：星图画虚线候选与 `Resonance Card`，文末关联区显示 `Backlink Item resonance`。**确认**后才调 `writing:link`；忽略只在会话内隐藏。
- 提示词注明：文档摘要是数据不是指令。

### W5.4 星图 UI

- 依赖 `d3-force`（精确版本）。`features/writing/graph/GraphView.tsx` 用 `@xyflow/react` 渲染：节点为 `Dot`（active：强调色 + 18% 光晕；connected：fg-secondary，按 inbound 取 sm/md/lg；isolated：空心 fg-tertiary；candidate：虚线强调色），边为 `Graph Edge`（link 实线、tag 点线 50% 不透明、candidate 虚线）。
- **左栏小窗**（Tabs「星图」）：`Graph Mini Panel`，以当前文档为中心 1–2 度关系 + 周围孤岛；状态 default / searching（「正在寻找共鸣点…」）/ empty（「这个文件还没有任何连接」）；图例。
- **全景**（左栏「在编辑区展开全景」或工具栏）：编辑区切换为全景星图，右侧写作助手自动收起（返回文档时恢复原状态）；`Graph Toolbar`（返回文档、搜索点、筛选：双链 / 标签 / 只看孤岛、统计、寻找共鸣点）；`Timeline Slider`（按 firstSeen 回放点与线，只读；播放 / 停止）；点击点打开文档（⌘ 点击新标签）；从一个点拖到另一个点 → `writing:link`。
- 性能：> 2 000 点时小窗只显示 2 度以内；全景关闭动画（静态布局迭代后渲染）。
- **文末关联区** `Backlinks`：折叠「连接到此文的点（N）」，展开列出反向链接（`Backlink Item backlink`）与共鸣点候选；broken 链接显示一键修复（逐个确认后改写来源文档中的链接文本，打开中的文档走缓冲区）。

### W5 验收

- 索引：新增 / 改名 / 删除 / 修改文件后增量正确；重启后从缓存加载；超出上限标记 truncated。
- 拖线：未打开文档写盘正确且可撤销；打开中的文档写入缓冲区不落盘；冲突时拒绝。
- `find_related_documents` 只返回同文件夹其他文档的元数据；单测断言不含全文、不含其他文件夹。
- 2 000 点 fixture 下小窗与全景可交互（实窗用例记录首次渲染耗时，写入实施记录）。
- 视觉：全景页浅深截图对照 `484:40061` / `484:41707`，反向链接对照 `483:54226`。

---

## 阶段 W6：总验收与收尾

- `pnpm check`、`pnpm build`、完整 `pnpm test:smoke` 通过；`pnpm package:dir` 后 `verify-packaged-dependencies` 与打包启动验证通过（写作空间可打开、块视图可编辑）。
- 更新 `AGENTS.md`「当前范围」：写作空间改为块级编辑 + 源码模式、全格式目录与文件操作（重命名、移动、副本、移入废纸篓）、`jarvis-writing://` 只读资产协议、星图与共鸣点、写作 Agent 可只读同文件夹文档元数据、拖线写入来源文档末尾。
- 更新 `memory/engineering.md`（新 IPC、协议、索引位置、依赖）与 `memory/design.md`（实现与设计差异）。
- 在 `memory/writing-space-implementation.md` 写最终报告：每阶段 SHA、命令输出摘要、截图路径（浅深 8 张页面 + 关键状态）、与本计划的差异与理由、已知限制。

---

## 5. 新增 IPC / 协议一览（主进程与 preload 只允许这些）

| 通道 | 方向 | 请求 | 说明 |
|---|---|---|---|
| `writing:rename` | invoke | rootId, path, name | W1 |
| `writing:move` | invoke | rootId, path, targetDir | W1 |
| `writing:duplicate` | invoke | rootId, path | W1 |
| `writing:trash` | invoke | rootId, path | W1，仅文件或空文件夹 |
| `writing:reveal` | invoke | rootId, path | W1 |
| `writing:save-asset` | invoke | rootId, documentPath, mime, bytes | W1/W2，≤ 10 MiB |
| `writing:watch` / `writing:unwatch` | invoke | rootId | W1，订阅监听 |
| `writing:changed` / `writing:renamed` | push | rootId, paths / from, to | W1 |
| `writing:graph` / `writing:backlinks` | invoke | rootId (+ path) | W5 |
| `writing:graph-changed` | push | rootId | W5 |
| `writing:link` | invoke | rootId, from, to | W5，记账本 |
| `jarvis-writing://<rootId>/<path>` | protocol | GET | W1，只读 image/pdf/audio/video |

## 6. 新增依赖一览

Tiptap 系列、unified / remark 系列、`mdast-util-to-markdown`、`lowlight`（含 `@tiptap/extension-code-block-lowlight`）、`mermaid`（动态导入）、`d3-force`、`pinyin-pro`。全部精确版本；如需其他依赖，先在实施记录写明理由。

## 7. 视觉实现要点

- 尺寸、颜色、圆角、阴影按 Figma 组件；颜色只用 tokens 类（`fill`、`fill-hover`、`selection`、`surface-raised`、`border`、`separator`、`info-subtle`、`success-subtle`、`warning-subtle`、`danger-subtle`、`accent` 等）。
- 已知设计取舍（照做）：`/` 面板高亮用强调色（与 CandidateList 一致）；Callout 默认插入 GitHub 标准类型；共鸣点徽标用 `Badge tone=info subtle`（`tone=accent subtle` 组件现有渲染问题，本计划不修）；全景星图与文件预览时右侧写作助手收起。
- 中文输入法组合输入：块视图中 `/`、`[[`、Enter 新块、Tab 缩进在 composition 期间不得触发。

## 8. 风险与处理

| 风险 | 处理 |
|---|---|
| 往返不一致导致「未保存」或 Git 噪声 | W2 门槛：示例库逐字节一致才能进入 W3 |
| 块视图、源码视图与 Agent 同时修改 | 所有写入都经 `content` + 版本校验；冲突沿用现有拒绝逻辑 |
| 大文件夹索引慢 | 分批、缓存、上限、truncated 提示 |
| 依赖体积 | mermaid、lowlight 语言包、星图按需加载；构建产物检查 |
| Linux 不支持递归监听 | 退化为现有轮询 |

## 9. 测试清单（新增；文件名为建议）

- `writing-files.spec.ts`（主进程单测）：全格式列表与类型、文本白名单读写、rename/move/duplicate/trash/reveal 正反例、saveAsset 魔数 / 大小 / 去重、符号链接与越界。
- `writing-roundtrip.spec.ts`：示例库逐字节往返、单块编辑最小差异、扩展块（callout/toggle/mindmap/mermaid）往返。
- `writing-tree.spec.ts`（实窗）：全格式显示、行内改名、菜单五项、拖拽移动、废纸篓确认、预览视图四类。
- `writing-tabs-multiroot.spec.ts`（实窗）：两个文件夹文档同时打开、切换左栏不关闭、重启恢复、旧键迁移。
- `writing-blocks.spec.ts`（实窗）：块视图编辑、句柄菜单、转换为、BubbleMenu、视图切换、图片粘贴落盘、`/` 面板过滤（中文 / 拼音 / 英文）。
- `writing-rich-blocks.spec.ts`（实窗）：思维导图快捷键、Mermaid 预览 / 错误、表格增删、Callout 类型切换。
- `writing-agent.spec.ts`（扩展）：块视图下原有断言 + 三个 AI 入口 + 高亮 + 改名后仍可写回。
- `writing-graph.spec.ts`（主进程 + 实窗）：索引增量、反向链接、拖线写入与撤销（打开 / 未打开）、`find_related_documents` 范围、2 000 点性能记录。
- 截图：在 `ui-preview` 或专用脚本采集浅深 8 张页面截图供验收对照（macOS 基准；Linux 只作参考，不更新 macOS 基准）。

## 10. 验收（Claude 负责）

每阶段推送后，Claude 会：

1. 拉取 `feature/writing-space`，逐个提交审查 diff：进程边界（无通用文件 / Shell / IPC 暴露）、zod 校验、路径校验、错误信息不含绝对路径、无批量删除、无新增颜色变量、依赖精确版本。
2. 运行 `pnpm check`、`pnpm build`、`pnpm test:smoke`（及阶段新增用例），结果与实施记录对照；任何失败或跳过即判定不通过。
3. 按本节各阶段「验收」条目逐条复现（实窗 Playwright 脚本 + 手动场景），重点：
   - W1：改名后 Agent 写回与账本撤销；多文件夹标签；旧键迁移。
   - W2：往返示例库逐字节一致（Claude 会追加未公开的额外样本复测）；打开不编辑不落盘。
   - W3：每个富模块外部编辑器可读；Mermaid 按需加载。
   - W4：三个 AI 入口只改对应块，一步撤销。
   - W5：拖线写入位置（来源文档末尾「## 关联」）、打开中文档走缓冲区、`find_related_documents` 只读同文件夹元数据。
4. 截图对照第 0 节 Figma 节点（浅深各一），记录差异；明显偏离设计（尺寸 ±2px 以外、颜色不是 tokens、状态缺失）退回修改。
5. 验收结论写入 `memory/writing-space-implementation.md`「验收」小节：通过项、退回项（附复现步骤）、遗留限制。退回项修复后重新验收该阶段。

未通过的阶段不得开始下一阶段（W1 与 W2 可并行开发，但 W2 合入前必须先通过 W1 验收）。
