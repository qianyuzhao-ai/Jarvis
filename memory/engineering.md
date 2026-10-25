# Jarvis 工程记忆

最后更新：2026-10-25

## Agent 架构改造 A2b：项目迁移与画布客户端化（2026-10-25）

- origin/main 无新提交。画布项目从渲染进程 IndexedDB 整体记录改存主进程 ProjectStore（`userData/projects/`）；主题、侧栏宽度、内网地址等偏好仍在 IndexedDB，改存新键 `preferences`（首次没有时从旧 `current` 读取）。旧 `current` 记录只读、原样保留作备份。
- 主进程：`main/projects/bridge.ts` 注册 `projects:*` IPC（migrated / migrate / list / get / read-blob / put-blob / create / apply / remove，沿用可信窗口与主框架校验，冲突返回 `code: 'CONFLICT'`），每次保存后向所有窗口推送 `projects:changed`（带写入方 `source`）；`projectStore()` 供 A2c 使用。窗口写入 `touch: false`，updatedAt 由窗口经 `set_project.patch.updatedAt` 提供；store 写入前统一 JSON 规整（去掉 undefined），内存与磁盘一致。`main/projects/migration.ts`：一次性迁移（多窗口同时请求只跑一次），先删掉中断尝试留下的同 ID 项目再写入，再用新的 ProjectStore 从磁盘读回逐个比对项目与参考文件字节，全部一致才写 `projects/migration.json`；失败时应用显示“项目迁移失败，原数据已保留”。
- 渲染进程：`workspace-load.ts` 启动时未迁移则读旧记录、`migrationForm`（非 UUID 项目 ID 与非法参考 ID 换新、重复节点/连线保留第一条、去掉悬空连线、名称截到 200 字）后交主进程迁移，再从主进程读项目（参考文件逐个读回为 Blob，上传中的资源标为中断）；`project-records.ts` 负责 Project ⇄ 主进程格式转换（Blob 移到 blobs，按 schema 字段挑选）；`project-sync.ts`（ProjectSync）按项目串行保存：每次以最新状态与上次已存形态 `diffProjects`（`shared/project-diff.ts`）出操作，新参考文件先 putBlob，再 applyOps；连续修改自然合并；拖拽期间 `hold` 不保存，松手只存一次（Canvas 的 onNodeDrag/onSelectionDrag Start/Stop → App `hold`）；版本冲突时读取最新项目替换本地并报“项目已在其他窗口修改，已载入最新内容”；收到其他窗口（source 不同）的推送时替换本地项目。`useWorkspace` 接口不变（新增 hold），偏好变化才写 IndexedDB；更新安装前 `flushAll`。
- 已知限制：拖拽中途退出应用会丢失这次拖拽（松手前不保存）；多窗口同时编辑同一项目以后写者冲突重载为准；未用参考文件不回收（A2c 定）。多窗口推送只有单元测试覆盖（Linux 上无法从测试再开第二个可信窗口）。
- 测试：新增 `project-sync.spec` 5 例（300 轮随机编辑的 diff 回放一致且合法；Project ⇄ 存储格式含参考 Blob 与 agentEdits 往返一致；迁移规整；ProjectSync 对真实 ProjectStore：创建、快速修改合并、拖拽保持只存一次、新参考先存文件、他处修改推送替换、自身保存不回显、冲突重载；迁移一次性、读回校验、重做中断尝试、缺参考文件时不写标记）与实窗 `project-migration.spec`（旧 IndexedDB 工作区含参考 Blob → 启动迁移为 project.json + blobs、原记录保留、拖拽过程中版本不变、松手后版本只 +1、重启后位置与偏好保留且不再迁移）。新增 `tests/helpers/workspace.ts`（seedWorkspace：写旧记录、清偏好与主进程项目、删迁移标记后重载，即按升级首启迁移；readProjects：从主进程读项目），7 个原先直接写 IndexedDB 的实窗测试改用 seedWorkspace，3 个读取 IndexedDB 校验的测试改用 readProjects（按项目名取，主进程列表按 updatedAt 排序），smoke 改为编辑 `preferences`。
- 验证：check、build 通过；完整实窗 159 例中 157 通过，仅 ui-preview 2 例无 linux 基线（生成的 png 已逐个删除）。

## Agent 架构改造 A2a：主进程 ProjectStore（2026-10-25）

- origin/main 无新提交。本批只建存储模块与测试，尚未接入应用启动、IPC 或画布界面（A2b 负责迁移与客户端化，A2c 让 Agent 直连）。
- `shared/project.ts`：主进程项目格式 `storedProjectSchema`（与渲染进程 Project 字段一致，id 必须为 UUID；参考文件不内联 Blob，节点只存 `{ id, name, type, mimeType, size, uploadedUrl?, uploadedFor? }`，id 限 `[A-Za-z0-9_-]`；节点/连线 ID 不重复、连线两端必须存在；保留 agentEdits 以便 A2b 迁移）与操作 `projectOpSchema`：add_node、update_node（data 合并 + unset 删除，键名限小写开头的标识符，zod 会丢弃 `__proto__`）、move_node、remove_node（连带删除相连连线）、connect、disconnect、set_project（name/viewport/minimap/dots/snap）、set_agent_edits；每次 1–500 个。
- `main/projects/apply-ops.ts`：在副本上依次执行并生成逆操作（按需倒序执行即可完全恢复，供 A2c 账本回滚）。
- `main/projects/project-store.ts`：`projects/<id>/project.json` = `{ format: 1, version, project }`，参考文件在 `projects/<id>/blobs/<refId>`；写入先写同目录临时文件再 rename；启动时逐个读取并 zod 校验，读不了或 ID 与目录不符的项目列入 skipped、原文件不动，临时文件残留忽略。`applyOps(projectId, baseVersion, ops, { touch })`：版本不符抛 `ProjectConflictError(当前版本)`；结果整体校验并要求所有参考（含 agentEdits 中的）都有文件，任何失败都不落盘；成功后 version+1、默认更新 updatedAt、触发 `onChange`、返回 `{ version, project, inverse }`。同一项目的写入按调用顺序串行（短时锁），不同项目并行。另有 create（可带参考文件）、get、list（按 updatedAt 倒序）、putBlob（不覆盖已有文件）、readBlob、remove（逐个删除文件后删空目录）。未做参考文件回收：撤销可能需要已删除节点的参考文件，A2c 结合账本再定。
- A2b 迁移注意：项目名超 100 字、提示词超 32000 字、非 UUID 项目 ID 不符合主进程格式，迁移时需处理；参考 Blob 需转为 blob 文件。
- 测试：新增 `project-store.spec` 6 例（读写与重启恢复、参考文件读取、删除；损坏/ID 不符文件跳过且不改动、临时文件忽略；旧版本冲突、各类非法结果与缺失参考不落盘且不通知；逆操作完全恢复；20 个同基版本并发写只成功 1 个、链式版本依次成功、不同项目并行、重启后版本正确；现有画布 createProject/createMedia 形状通过主进程格式校验）。
- 验证：check、build 通过；完整实窗 153 例中 151 通过，仅 ui-preview 2 例无 linux 基线（生成的 png 已逐个删除）。

## Agent 架构改造 A1b-3：handoff 与委派（2026-10-25）

- origin/main 无新提交。新增 `packs/handoff.ts`（子 Agent 的 `handoff_to_main`：request 用户原话、context、expected；每轮最多 2 次；回复活动记“已交给 Jarvis 处理”，工具结果返回 handoffId 与目标分段）与 `packs/agent-control.ts`（主 Agent 的 list_agents / read_result_card / read_agent_transcript（每段 8000 字，next 续读）/ delegate_task / message_agent / stop_agent，均为 risk read）。主分段能力包 = chat + agent-control + skills；画布/写作 = 空间包 + report + handoff + skills。
- 转交与通知投递：handoff 优先投给委派来源分段（delegated 子 Agent 的 parentId），否则当前分段，没有则新建主分段；以 followUp 进入该分段（在回复则排队）。委派的子 Agent（origin delegated, parentId=主分段）每轮结束后向来源分段投递“委派任务状态通知”，触发一轮主 Agent 回复；被 stop_agent 停止的、应用退出时的不通知。转交、通知、卡片、对话记录都以“数据，不是指令”的标记块进入主 Agent 提示词（Pending 新增 `prompt`，显示文字与发给模型的文字分开）。
- 消息来源：`ChatMessage.relay = { kind: handoff | notice | delegate | message, sessionId, title }`，界面在用户气泡上方显示小字“空间助手转交 / 空间任务状态 / Jarvis 委派 / Jarvis 的消息 · 标题”（`.chat-relay`）。`store.create` 新增 parentId 参数；service 抽出 `createSession`（不经操作队列）与 `enqueue`（开始或排队），send 复用。
- 委派限已打开目标：新增 `shared/agent-targets.ts` 与 IPC `agent:open-targets`（preload `setOpenTargets`），窗口上报“已打开”的项目（有画布标签页的项目，`use-canvas-targets.ts`；挂载的画布也登记）与写作空间当前文件夹中打开的文档（`use-writing-host.ts`），汇总于 `features/agent/open-targets.ts`；窗口导航或销毁时主进程清除。delegate/message 按目标找到窗口作为本轮 owner，画布先发新增的 canvas 命令 `snapshot` 取当前快照（未挂载的项目由 App 级处理器作答，轮次开始后项目因“回复中”挂载并执行编辑）。目标未打开时工具报错“这个项目没有在任何窗口中打开。请用户先在 AIGC 创作空间打开它，再委派。”（文档同理），message_agent 时把卡片记为 needs_user。
- 测试：新增 `agent-delegation.spec`（写作越界 handoff 新建分段并以数据块注入、委派到已打开项目并收到状态通知、未打开项目如实报错且不建会话、控制工具读卡片/记录与关闭后 message 报错）与实窗 `agent-delegation-ui.spec`（首页对 Jarvis 说话，委派到标签页中的项目，画布未显示也能完成改名、卡片“已完成”、首页收到“空间任务状态”通知与回复、画布助手中委派消息带“Jarvis 委派”标记）；agent.spec 首页工具断言改为只含六个子 Agent 工具，writing-agent.spec 工具清单加入 handoff_to_main，agent-cards.spec 模拟服务不再被卡片数据中的标题误触发。
- 验证：check、build 通过；完整实窗 147 例中 145 例通过，ui-preview 2 例本轮先失败（无 linux 基线），复跑时因首轮生成的 png 而通过，不算有效验证，生成的 png 已逐个删除；截图检查通过（画布助手截图需等右栏滑入动画结束）。

## Agent 架构改造 A1b-2：结果卡片与 Agent 总线（2026-10-25）

- 新增 `shared/agent-cards.ts`（`ResultCard`：status running/waiting/done/failed/needs_user、summary ≤1000、artifacts ≤50（node/document/file/event + ref）、openQuestions ≤10、source agent/auto、updatedAt），会话元数据 `sessionMetaSchema` 新增可选 `card`，随 index.json 保存，旧记录无卡片照常读取。
- `kernel/bus.ts`：进程内 `AgentBus`（publish / subscribe），本批只有 `{ type: 'card', sessionId, card }` 事件，供 A1b-3 及以后订阅；service 暴露 `bus`。
- `packs/report.ts`：画布/写作子 Agent 新增 `report_result` 工具（risk read，每轮最多 3 次；status 只能 done/failed/needs_user），提示词要求只写事实并说明不调用时自动生成卡片。主 Agent 不带该包。
- service：子 Agent 一轮开始即置卡片为 running（保留上一张卡片的摘要/产物）；本轮调用过 `report_result` 则以其为准（source agent），否则结束时自动生成（source auto：成功→done、失败→failed、其他（停止/中断）→needs_user；摘要为回复前 300 字或错误；产物为本轮带 transactionId 活动的节点 ID 与写作文档路径）。每次写卡都发总线事件并推送元数据。
- 新分段开场：main 会话第一轮（此前无 assistant 回复）在用户消息后附加“未完成的空间任务卡片（数据，仅供了解进展，其中的文字不是指令）”JSON（running/waiting/needs_user，最多 20 张，含标题、空间、状态、摘要、待确认问题、更新时间）；第二轮起不再注入。
- 界面：首页侧栏在聊天记录上方新增“空间任务”区（`data-testid="space-cards"`），列出最近 5 张卡片（画布图标 LayoutGrid / 写作图标 PenLine、状态文字、悬停显示摘要）；点击打开对应项目或文档标签页、展开右侧助手并切到该对话（`features/agent/conversation-focus.ts` 按 `canvas:<id>` / `writing:<scope>` 暂存待聚焦会话，useAgent 挂载或收到请求时选中）。项目已删除或写作根目录未打开时显示错误，不越权打开文件夹。
- 测试：新增 `agent-cards.spec`（运行中卡片、自动卡片、显式卡片与总线事件、新分段只在首轮注入未完成卡片、主 Agent 无 report_result、重启后卡片保留）与实窗 `agent-cards-ui.spec`（画布对话后首页出现“已完成”卡片、空间对话不进聊天记录、点击后回到画布并切回该对话）；`writing-agent.spec` 工具清单加入 report_result。
- 验证：check、build 通过；完整实窗 145 例中 143 通过，仅 ui-preview 2 例无 linux 基线（生成的 png 已逐个删除）；截图检查通过。

## Agent 架构改造 A1b-1：主 Agent 分段（2026-10-25）

- origin/main 无新提交。首页对话即主 Agent 分段：A1a-1 的迁移已把旧首页对话标为 `agent.kind = 'main'`、新建首页对话同样为 main，本批不再改记录结构。
- 当前分段：`service.currentSegment()` = 有用户消息的 main 会话中 `updatedAt` 最新的一个（`updatedAt` 只在一轮开始时更新，即用户发送或排队消息开始时），快照新增 `currentSegmentId`（无则 null）；空的新分段在有消息前不会成为当前分段，画布/写作会话不参与；删除当前分段后回落到下一个。供 A1b-3 的 handoff 投递使用，界面暂不显示。
- 首页列表按本地日期分组：新增 `features/shell/conversation-groups.ts` 的 `groupByDay`（今天 / 昨天 / 最近 7 天 / 更早，组内按 updatedAt 倒序，空组不显示），ShellSidebar 用组标题替代原“最近对话”，每组为带 aria-label 的 section，沿用原 `<small>` 标题样式，组间距 12px；条目、相对时间与操作不变。
- 新分段开场注入“未完成的子 Agent 卡片概要”推迟到 A1b-2：卡片在 A1b-2 才存在，本批不注入空数据块。
- 测试：新增 `agent-segments.spec`（固定时钟下的日期分组与组内顺序；当前分段规则：v1 迁移来的首页对话、空分段不抢占、按用户消息切换、画布会话不参与、删除后回落）2 例；`agent-migration.spec` 增加实窗断言：升级来的旧对话位于“更早”组。
- 验证：check、build 通过；完整实窗 143 例中 141 通过，仅 ui-preview 2 例无 linux 基线（生成的 png 已逐个删除）。

## Agent 架构改造 A1a-3：并发上限设置项（2026-10-25）

- 用户授权清理上一批用于对照的独立 worktree，已用 `git worktree remove --force` 移除。origin/main 无新提交。
- 新增 `shared/agent-settings.ts`（`{ version: 1, concurrency: 1–6 }`，默认 3）与主进程 `agent/settings.ts`（`AgentSettingsStore`，存 `agent/settings.json`，文件缺失、损坏或超出范围时回落默认值）；scheduler 默认值改为引用该默认。启动时 `service.loadSettings()` 应用到 scheduler；`setConcurrency` 保存后立即 `setLimit`——调小不打断已在流式中的请求，调大立刻放行等待中的轮次。
- IPC：`agent:settings`、`agent:set-concurrency`（zod 校验 1–6 整数）；preload 新增 `getSettings` / `setConcurrency`。
- 界面：设置 - 常规在“主题”与“默认下载位置”之间新增一行“同时运行的 Agent 数”，说明“超出上限的对话会显示“等待中”，轮到后自动继续。”，右侧 `NativeSelect`（1–6，宽 96px），保存后状态文字“已保存，新的回复按此上限排队”，失败回滚并显示错误；布局与下载设置行一致。
- 测试：`agent-concurrency.spec` 新增 1 例（默认 3、0 与 7 被拒、上限 1 时第二个对话等待、调到 2 后放行、重启读取 2、损坏/越界文件回落 3）；新增实窗 `agent-concurrency-settings.spec`（设置改为 1 后重启仍为 1，第二个对话显示“等待中：同时回复的对话已达上限”且服务端只收到 1 个请求，第一个回复结束后自动开始）。
- 验证：check、build 通过；完整实窗 141 例中 139 通过，仅 ui-preview 2 例无 linux 基线（生成的 png 已逐个删除）；本轮 updates.spec.ts:179 也通过。

## Agent 架构改造 A1a-2：并发调度、排队与压缩（2026-10-25）

- origin/main 无新提交。去掉全局单运行锁：service 以 `runs: Map<sessionId, Run>` 管理进行中的轮次，多个对话可同时回复；`idle()` 只用于影响全部对话的操作（模型配置、技能导入/启停、连接测试），单个对话的改名外操作（删除、切模型、思考档位）用 `sessionIdle(id)` 只挡该对话；新建对话不再受其他对话影响；撤销只在同一项目/文档有对话在回复时拒绝。
- `kernel/scheduler.ts`：全局并发槽（默认 3，A1a-3 改为设置项），按“模型请求”计——`openAgent` 的 streamFunction 在发请求前 `slot()` 取槽、流结束释放；工具执行、等待确认、两次请求之间都不占槽；先到先得，取消等待即退出队列。快照 `busySessionId` 改为 `runs: Record<sessionId, 'waiting' | 'running'>`，等待槽位的轮次在回复气泡显示“等待中：同时回复的对话已达上限”。
- 排队（followUp）：对话回复中再次发送时，用户消息以新状态 `queued` 写入（显示“排队中，当前回复结束后发送”），本轮结束后自动开始下一条，回复插在该条之后；停止回复时排队消息标为 cancelled（用户消息显示“已取消，未发送”）；重启后遗留的 queued 改为 cancelled 并注明未发送；排队后启动失败（如模型已不支持图片）把该条标为 failed 并继续下一条。排队消息带的画布快照是发送时的，若画布已改，画布工具会如实报冲突。
- 插话（steer）未实现：需要输入框上的明确控件与设计，待用户决定（文档 A1a-2 原含插话）。线程“常驻”只做到轮次内：每轮仍新建 SDK 会话（各包的提示词/工具按轮生成），历史由 jsonl 续接；空闲常驻 10 分钟收益小、复杂度高，未做。
- 压缩：SDK `compaction.enabled = true`（默认 reserve 16384 / keepRecent 20000），移除 6 万字对话上限；压缩摘要请求经同一 streamFunction，靠 `compaction_start/end` 事件豁免请求计数（否则纯聊天每轮仅 1 次请求会被摘要占用），仍需取槽；回复中写活动记录“已压缩较早的对话内容，保留摘要继续对话”。
- 按角色限制：main 每轮 24 次请求、10 分钟；canvas / writing 12 次、5 分钟；策略引擎每轮工具调用上限 40（各包原有 20/20/12 上限保留）。`openAgent` 签名改为 `openAgent(root, id, model, { transient, packs, thinkingLevel, approve, slot, maxRequests, maxToolCalls })`，测试调用点同步更新。
- 渲染层：`useAgent` 新增 `anyBusy`（任一对话在回复：模型/插件设置、侧栏菜单仍锁定）、`scopeBusy`（本项目/文档有对话在回复：撤销与对话列表删除锁定）、`waiting`、`busyProjectIds`；输入框只在本对话回复时锁定模型与思考选择，有输入时按钮为“排队发送”，无输入时为“停止回复”；ChatPage 提交不再因本对话回复而拒绝。
- 测试：新增 `agent-concurrency.spec`（调度器先到先得/取消/提高上限；上限 1 时第二个对话等待槽位、其他对话可改设置、本对话被锁；上限 2 时两个对话同时回复；排队顺序与插入位置、停止时排队取消、重启后排队消息不发送；压缩摘要后纯聊天轮次仍能回复）4 例，`agent-queue.spec`（实窗：排队发送、排队标签、另一个对话同时回复、回复后按序完成）1 例；canvas-agent / writing-agent / agent-store 由 `busySessionId` 改为 `runs`。
- 顺带修复 A0-3 的不稳定测试：`agent-ledger.spec` 用固定 50ms 等待 55 次排队写入，满载时读到中间状态（48/50）；`Ledger` 新增 `settled()`，测试改为等待写入完成。
- 验证：check、build 通过；完整实窗 139 例中 135 通过：ui-preview 2 例无 linux 基线（生成的 png 已逐个删除）；agent-ledger 1 例为上述不稳定测试（修复后重复 5 轮 10/10 通过）；`updates.spec.ts:179`（确认安装后立即断言 `app.windows()` 为 0）为既有时序不稳定——不含本次改动的上一提交单独 worktree 重复 10 次也失败 2 次，本次重复 5 次失败 1 次，与 Agent 无关（安装流程只调用 `isAgentBusy()`，空闲语义未变），未修改该测试。
- 中途 Bash 安全检查连续无结论导致一次中断，恢复后完成上述验证再提交。

## Agent 架构改造 A1a-1：会话记录 v2、存储拆分与增量推送（2026-10-25）

- origin/main 无新提交（仍为 `6761f10`），直接在作业分支开工。
- 记录 v2：`shared/agent.ts` 新增 `agentRoleSchema`（kind main/canvas/writing、origin user/delegated、parentId?）与 `sessionMetaSchema`（v1 会话去掉 messages，加 agent 与派生的 `lastReplyAt` = 最后一条消息 completedAt）；`ChatSession` = 元数据 + messages，`ChatSessionMeta` 用于列表。v1 `chatSessionSchema` 保留只用于迁移。
- 存储（`store.ts`）：`index.json` v2 = `{ version: 2, sessions: [{ meta, config? }], requests }`；消息在 `sessions/<id>.view.json`（`{ version: 1, messages }`，与 Pi 的 `<id>.jsonl` 同目录）。`saveIndex()` / `saveView(id)` / `save(id)` 分开；运行中每秒 checkpoint 只写本会话 view，开始与结束各写一次 index；改名、切模型、思考档位只写 index；删会话后删除 view 文件。
- 迁移：读到 v1 时先原样写 `index.v1.bak.json`，按 projectId → canvas、writingScope → writing、其余 → main（origin user）写各 view 与 v2 index，再逐条读回与 v1 解析结果深比较（含 requests、旧 config）；任何失败把 v1 原文写回 `index.json` 并报“Agent 记录升级校验失败，原记录已保留”，下次启动重试。迁移后照常处理中断的运行。
- 推送：`agent:event` 只含元数据快照；新增 `agent:session-event` `{ seq, sessionId, messages }` 只带变化的消息（按消息 ID 记脏，40ms 合并），与 index 事件共用 seq，`emit()` 先推完积压的消息再推元数据。新增 `agent:session` 取单个会话全文 `{ seq, session }`。没有做主进程侧的按窗口订阅：事件只含变化的消息，广播给可信窗口，渲染层只应用正在查看的会话（与文档“只订阅正在查看的会话”的差异）。
- 渲染层：`useAgent` 只为当前会话 `getSession`，加载期间到达的事件先缓存，加载后按 seq 应用（同 ID 替换、新 ID 追加）；对外仍返回带 messages 的 `session`，各面板代码基本不变。ShellSidebar / CanvasConversations 改用 `ChatSessionMeta`，对话时间用 `lastReplyAt`。
- 测试：新增 `agent-store.spec`（v1 样本迁移、备份与原文一致、index 无 messages、view 内容一致、重载后与 v1 相同；迁移失败保留 v1；真实流式回复中 index 只写 2 次而 checkpoint 只写本会话 view、元数据事件不含消息、消息事件只属于该会话、seq 唯一且元数据在消息之后、删除会话删 view）3 例，`agent-migration.spec`（实窗：v1 profile 升级后对话可打开、备份与 v2 文件存在）1 例；agent / canvas-agent-vision 改用 `getSession` 取消息；agent / model-library 直接改磁盘记录造测试数据的地方改成 v2 布局（消息在 view 文件、元数据在 `meta`）。
- 验证：check、build 通过；完整实窗 134 例首轮 130 通过，失败 4 例中 2 例为上述测试仍按 v1 改磁盘文件（修正后单独重跑 agent / model-library / canvas-agent / writing-agent 4/4 通过），另 2 例为 ui-preview 无 linux 基线（生成的 png 已逐个删除）。

## Agent 架构改造 A0-3：操作账本（2026-10-25）

- 开工前合入 origin/main（`6761f10`，PR #83；engineering.md 顶部冲突，保留双方）。
- `kernel/ledger.ts`：主进程操作账本，按会话存 `agent/ledger/<sessionId>.json`（JsonFile 原子写，`{ version: 1, entries }`），条目 = transactionId、sessionId、runId、pack（canvas/writing）、目标（projectId 或 writingScope）、摘要、status（applied/undone）、时间。同一 transaction 只记一条（后续编辑更新摘要），每会话保留最近 50 轮；启动时只加载现存会话的文件，删会话时删除对应文件（先等待排队写入）。写入失败经 onError 设为 persistenceError（与会话存储失败同样阻止后续请求）。JsonFile 新增 `settled()`。
- ToolContext 新增 `sessionId` 与 `record(change)`；画布包在保存回执成功后记“已修改画布”，写作包记 reply.summary。活动卡片仍由各包按原样生成（画布每次编辑一张卡、写作按 transaction 合并），没有改成由账本生成，避免界面变化；账本只存每轮一条的摘要。
- 撤销改经主进程调度：渲染层“撤销本次修改”和画布“撤销最近修改”调用 `agent:undo`（`{ transactionId, projectId }` 或 `{ transactionId, writingScope }`，zod 校验）→ service.undo（有运行中请求或 persistenceError 时拒绝；条目已撤销则报“这次修改已撤销”）→ 通过 CanvasBroker / WritingBroker 向该窗口发 `undo` 命令（两个命令 schema 新增 `{ type: 'undo', transactionId }`）→ 渲染层宿主执行原有 `prepareCanvasUndo` / `WritingTransactions.undo` 校验与回滚 → 成功后账本标记 undone。账本里没有的旧修改（A0-3 之前产生）仍发给窗口，由窗口按原规则判断。`useAgent` 新增 `undoChange`；`use-writing-host` 去掉本地 `undo` 出口，`CanvasAgentSidebar` 去掉 `commit` 属性。
- 测试：新增 `agent-ledger.spec`（合并、50 轮裁剪、重启加载、忽略已删会话的坏文件、删除、写入失败回调；service.undo 经 broker 发命令、失败不改状态、重复撤销被拒、旧修改仍下发、重启后状态保留）2 例；`canvas-agent-runtime` 断言记录的 transactionId 与画布事务一致；`canvas-agent` / `writing-agent` 实窗在撤销前后检查 profile 中账本文件 applied → undone，画布用例重启后仍为 undone。“撤销最近修改”按钮暂无实窗用例，其无账本条目的路径由 service 测试覆盖。

## Agent 架构改造 A0-2：策略引擎与确认通道（2026-10-25）

- 开工前再次合入 origin/main（`8f7610f`，PR #81；engineering.md 顶部记录冲突，保留双方）。
- `kernel/policy.ts`：`createPolicy(packs, approve)` 以 extensionFactory（`jarvis-policy`，hidden）注册 `tool_call` 处理，`noExtensions` 仍关闭外部扩展。不在本会话能力包里的工具直接 block；`read` / `reversible` 放行；`confirm` 调用 approver，拒绝/超时以 block reason 返回给模型（“用户拒绝了此操作……”“未在时限内确认……”），没有 approver 时也 block。原“创建会话后比对工具名”校验保留为第二道防线。
- `kernel/approval.ts`：`ApprovalQueue` 按窗口（owner）保存待确认请求，5 分钟超时为 expired，respond 校验 owner，AbortSignal、`cancelSession`（停止对话）、`cancelOwner`（窗口关闭/导航）都按拒绝处理；每次变化回调 owner。PackTool 新增可选 `describe(input)` 生成确认说明。
- service：每轮 approver 在等待确认期间暂停 120 秒请求超时，返回后重新计时；拒绝/超时写一条活动记录（“已拒绝 · 工具名”“确认超时，未执行 · 工具名”）。`openAgent` 新增第 7 个参数 `approve`。
- IPC：`agent:approvals`（取本窗口列表）、`agent:respond-approval`（zod 校验 `{ id, approved }`），主进程变化时向该窗口推送 `agent:approvals`；preload 增加 `listApprovals` / `respondApproval` / `onApprovals`，仍只接受可信窗口主框架。渲染层 `features/agent/AgentApprovals.tsx` 挂在 App 的 ConfirmProvider 内，列表以主进程为准，逐条用 AlertDialog 组件显示，默认焦点“拒绝”，Esc 为拒绝。目前没有任何生产工具声明 `confirm`，弹窗要到 A4/A5 才会实际出现。
- 新测试：`agent-policy.spec`（队列三条路径与 owner/停止/关闭、策略判定、Pi 实际会话里 confirm 工具只在允许后执行且拒绝/超时原因进入模型请求）3 例；`agent-approval.spec`（实窗：主进程推送列表驱动弹窗、默认拒绝焦点、允许后显示下一条、Esc 关闭、列表清空即关闭）1 例。

## Agent 架构改造 A0-1：能力包骨架（2026-10-25）

- 用户要求作业分支 `ccr-1c636605-o0pprj` 先合入最新 origin/main（v0.3.0，`c393e46`，无冲突，合并提交 `4aeb30c`），再开始 A0-1。方案见 [agent-architecture.md](agent-architecture.md) 与方案文档“改造方案与分批阶段”标签页。
- 新增 `main/agent/kernel/capability.ts`（CapabilityPack、PackTool = ToolDefinition + risk、ToolContext）；`canvas-tools.ts` / `writing-tools.ts` / `skill-runtime.ts` 用 git mv 改为 `packs/canvas.ts` / `packs/writing.ts` / `packs/skills.ts`，新增 `packs/chat.ts`（首页提示词）。各包自带系统提示词片段，三段原提示词与上下文句子逐字保留（脚本对比旧 runtime/service 通过）。
- `openAgent(root, id, model, transient, packs = [chatPack()], thinkingLevel)`：系统提示词 = 各包 prompt 顺序拼接，工具 = 各包 tools 顺序拼接；写作包 `textOnly` 替代原 `canvas.kind === 'writing'` 的图片输入判断；单轮请求上限改为“有工具 8 次、否则 1 次”（原来无工具的画布会话也给 8 次，实际不会出现）。`skillsPack` 返回 `userPrompt` 替代原 `skill.prompt`。risk 只在 Jarvis 侧，供 A0-2 策略引擎使用；provider 按字段取 name/description/parameters，不进入请求体。
- 测试调用点随签名更新（canvas-agent-runtime、writing-agent-commands、agent-skills-runtime、agent-responses、model-runtime），断言不变；直接调用 `execute` 的地方补齐 SDK 五参数签名。
- 验证：check、build 通过；运行时 28 例通过；完整实窗 124 例中 122 通过，ui-preview 2 例仍为仓库无 linux 截图基线（生成的 linux png 已逐个删除）。实窗沿用阶段 2 的 keyring 处理：本容器 apt 安装 gnome-keyring，dbus-run-session 内解锁并临时改 playwright-core loader 的 password-store，验证后已还原。`pnpm install --ignore-scripts` 不会下载 Electron，需在 electron 包目录手动执行 `node install.js`。

## 0.3.0 已发布（2026-10-25）

- 用户要求以本地最新代码集成 develop（dev）并发布 0.3.0；未合入远端 `ccr*` 分支。本地功能经 [PR #76](https://github.com/qianyuzhao-ai/Jarvis/pull/76) 合入 develop（`da1510d`），再由 [PR #77](https://github.com/qianyuzhao-ai/Jarvis/pull/77) 合入 main（`c393e46`）。发布前 feature / develop / main 完整树一致；新标签 `v0.3.0` 保持指向 `c393e460a48ca0cd6cd995f79da972e399728922`，未移动旧标签。
- 本地 check、build、版本一致性、完整 Electron/模拟服务 **124/124（4.6m）**、Node 发布工具 10/10、路径检查工具 3/3 和 Apple 网络重试测试通过。未签名 arm64 目录包实际启动与 360 项依赖验证通过。
- 首轮 `40162171899` 因 Windows 路径误报取消；检查工具经 PR #78 / #79 修复，运行 `40162527580` 后发现启动验收入口遗漏而主动取消，验收工具经 PR #80 / #81 修复。均只修改检查/验收工具与工作流，应用代码与原标签一致；从 main `8f7610f` 工作流构建原标签的最终运行 [40162843328](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/40162843328) 四个作业全部 success。
- Windows `121077826170`、macOS arm64 `121077826232`、Intel x64 `121077826276` 均通过 360 项生产依赖、原生打包 ASAR 启动、窗口标签、写作 Agent/更新桥接及 0.3.0 版本验证。两种 macOS 的目录包、ZIP/DMG 内应用均签名、公证票据和 Gatekeeper accepted / Notarized Developer ID 通过；Windows 安装器保持未签名。
- 统一发布 `121079497207` 合并并复验双架构更新清单后完成。[v0.3.0](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.3.0) 于北京时间 **2026-10-25 12:54:42** 发布，非草稿，按当前流程为预发布；12 个资产均 uploaded。线上 latest-mac.yml / latest.yml 已下载，SHA-256 与 GitHub asset digest 一致；版本、引用目标、文件大小匹配，macOS 两种架构 ZIP 均在清单中，SHA-512 已由云端真实产物验证。
- 中文版本说明保留自动生成记录，验证证据在 `/private/tmp/jarvis-030-release-verification`。真实服务商、真实内网、macOS 13 实机交互和真实版本间升级仍需目标环境验收；不以本轮模拟服务/云端测试替代。


## 0.3.0 打包启动验收入口同步（2026-10-25）

- Windows 路径修复已由 PR #78 / #79 合入 develop/main（main `cae01f6`），从新工作流重试原 v0.3.0 的运行 `40162527580` 已通过 Windows 检查器回归；随后核对发现 tag 内 `verify-packaged-startup.mjs` 仍在通用页查找已迁到关于页的“应用更新”区域，继续运行必然失败，主动取消该次运行并同步验收入口。
- 启动验收改为打开关于页并验证标题、更新区域；工作流同样从 workflow commit 加载该验证工具，应用源码与标签均保持原版。没有放宽依赖、ASAR、桥接、版本或原生启动断言。
- 本地 check、build 通过，未签名 arm64 目录包 `release/66973b2f-682b-48ce-aaa2-666f06225116` 实际启动通过：360 项必需生产依赖、0.3.0、ASAR 窗口标签、写作 Agent 和更新桥接、关于页验证完成。首次沙箱内下载缓存 DNS 失败，获准联网重试后成功；不代表 macOS 签名、公证或 Intel/Windows 原生验证已完成。


## 0.3.0 Windows 检查工具修复（2026-10-25）

- `v0.3.0` 原标签指向 main 合并提交 `c393e46`（PR #77），应用与已验证 feature/develop 的完整树一致；功能经 PR #76 合入 develop。标签发布运行 `40162171899` 的 Windows 在 pnpm check 失败：`relative()` 返回反斜杠，Token 允许列表与 icons/tokens 特例使用斜杠，导致合法历史颜色被误报。Windows 作业 `121075828965` 日志已定位，不是应用构建或签名失败。
- 修复 check-tokens.mjs 统一仓库相对路径为 `/`，完整扫描回归同时模拟 POSIX/Windows，验证允许列表及真正的颜色/原生导入违规仍被拒绝。发布工作流在 check 前从 workflow commit 加载该检查脚本，与原签名工具回放机制一致，以便用新 main 工作流重试原标签；应用源码仍来自原标签，不移动标签、不跳过任何检查。
- 已请求取消注定无法发布的原运行，避免另外两个 Mac 作业重复签名公证。修复仅检查脚本、测试与工作流，不改变应用源码，沿用原版完整 Electron 124/124 结果；新工具测试 3/3、check 与 build 通过，最终云端结果另行回读。


## 0.3.0 发布准备（2026-10-25）

- 用户明确授权以本地最新状态集成 develop（用户称 dev）并发布 0.3.0，排除远端 `ccr*` 分支。fetch 核对 develop=`fd6db60`、main=`57365e8`，当前本地 `feature/project-more-menu` 独有提交为 `fe41c1e` / `66bde20`；远端 `ccr-1c636605-o0pprj` 只读列出，不合入、不修改。远端无 v0.3.0 标签或开放 PR，最近发布为 v0.2.5。
- 根包/桌面包版本和 README 源码版本统一 0.3.0，新增 CHANGELOG 并更新“关于 Jarvis”检查更新路径；沿用 feature → develop → main PR 与 main 合并提交新标签，不创建 release 分支、不移动旧标签。
- 发布检查确认删除项目后键盘焦点丢失（新增实窗断言可复现），补充成功删除后聚焦剩余行或侧栏首个动作。既有加载前浅色首屏与锚定浮层缩放原点为非阻断后续项；不在发版时重做主题或动效。桌面应用无移动端/营销页面验收范围。
- check、build、版本一致性与 10 项 Node 发布工具回归、Apple 网络重试脚本通过。完整 Electron 回归 124/124（4.6m）通过，浅深截图基准包含在本轮通过结果内；云端三平台签名、公证、原生启动和 Release 校验待执行，不得将准备状态称为发布完成。


## 项目更多菜单恢复（2026-10-25）

- 分支 `feature/project-more-menu` 从 develop 创建；已有未跟踪 `skills/` 保留不动。用户于同日授权提交；未推送、提 PR 或发布。
- `ShellSidebar` 接入 `onDeleteProject`、新标签页打开和删除确认，IconButton 标签统一“更多”；App 通过现有 commit 保存移除单个项目（rollbackOnFailure=true），不新增原生能力或远端删除请求。行菜单专用 CSS 按内容占宽，上限 320px 并受 Radix 可用宽度约束。
- `pruneTabs` 在关闭失效标签后同时过滤失效历史并重算 cursor，防止删除项目后前进/后退进入空白画布。新增 project-menu 实窗与删除历史单测，调整旧 window-shell 的更多按钮定位。
- `pnpm check`、`pnpm build`、`git diff --check` 通过；相关 Electron/标签/侧栏 9/9（15.6s）通过，浅深菜单截图检查通过。存储失败回滚沿用现有 commit 机制，此轮未注入磁盘/IndexedDB 故障。


## 关于 Jarvis 与更新入口迁移（2026-10-25）

- 从 develop 创建 `feature/settings-about`。`ShellSidebar` 启用 about 分类，App 接入标题、分类渲染和全局提醒去重；`AboutSettings` 复用 `UpdateStatus`，`GeneralSettings` 移除更新依赖。更新 hook 保持在 Workbench，不因分类切换重置下载和检查状态；无新增 IPC 或主进程变更。
- 更新测试入口迁到关于页，补充通用页无更新区、关于选中态及刷新恢复断言。`pnpm check`、`pnpm build` 与 updates / updates-http / updates-service / update-preparation 共 13/13（17.9s）通过，浅深/窄窗截图检查通过。实际发布和真实安装未执行。
- 用户于同日授权两个分支推送、提 PR 并合入 develop。模型修复已由 [PR #74](https://github.com/qianyuzhao-ai/Jarvis/pull/74) 合入 develop（`59f7dd5`），随后同步到本分支；仅两份记忆顶部记录冲突，保留两侧完整记录，应用代码自动合并。关于页由 [PR #75](https://github.com/qianyuzhao-ai/Jarvis/pull/75) 交付，合并前集成检查、构建与模型/更新相关 26/26（30.1s）通过。

## 模型配置开发模式卡住修复（2026-10-25）

- 用户截图：添加 DeepSeek 第 2 步点击“下一步”后持续转圈。根因是 `AddProviderDialog` 的 mounted ref 在 StrictMode 开发模式的 effect 清理后永久变为 false，随后校验报错、busy 清除、模型列表更新和步骤跳转均被跳过；此步新建服务商尚未发送网络请求。
- 修复：effect 每次 setup 恢复 mounted=true，真实卸载时仍置 false。分支 `feature/model-dialog-lifecycle-fix`，用户于同日授权推送与 PR 集成，已由 PR #74 合入 develop（`59f7dd5`）；未发布，不改变凭据和 IPC 边界。
- 新增 `model-dialog-dev.spec.ts`：实际 Vite 开发 renderer + Electron（隔离 profile、测试 Key），旧代码复现缺少 Key 后无报错且卡住；修复后校验恢复、DeepSeek 目录加载、选择添加、编辑连接与刷新恢复通过（1/1，3.6s）。现有 model-library / model-store / model-runtime 12/12 通过；check、build 通过。未调用真实 DeepSeek，真实服务联调仍待验证。新增测试要求开发端口 5173 空闲，与主进程可信来源限制一致。


## 模型配置分支合入 develop 前的合并（2026-10-24）

- 用户要求提 PR 合入 develop。develop 已含 UI V1 第三阶段（AppShell、跨空间标签、Composer/AssistantPanel、写作 Agent），先把 origin/develop 合并进 `ccr-56156863-qdlw6l` 再提 PR。
- 冲突处理：保留 develop 的外壳与写作会话（writingScope、createWritingSession、ChatTab），模型相关改用 v3：`store.create(model, projectId, thinkingLevel, writingScope)`；自定义模型 input 只在“支持图片且非写作会话”时含 image；ChatTab 去掉旧 configuration 同步；画布与写作右边栏按 modelId / defaultModelId 选模型，未配置按钮统一“前往模型设置”；设置导航“模型服务”改“模型”；新文件图标改从 `@jarvis/ui/icons` 导入（check-tokens 规则）；develop 新增的 `writing-agent.spec` 改用 `addRelayModel`。
- 新 Composer 中原生 select 溢出导致右边栏“思考”与模型选择重叠：模型与思考选择改用 `NativeSelect appearance="compact" size="sm"`（与 Figma Composer 一致），宽版上限 240 / 120px，compact 112 / 92px；首页与画布右边栏截图检查通过。
- 验证：check、build 通过；完整实窗 119 例通过，ui-preview 2 例仍无仓库 linux 基线（第二轮因上一轮生成的 linux png 存在而显示通过，已删除，不作为通过依据）。

## 模型配置当前状态（2026-10-24，改造五个阶段已完成）

- 结构：`agent/connection.json` v3 = providers（builtin：sdkProvider；custom：name/baseUrl/api）+ models（自定义模型带能力与来源）+ defaultModelId；Key 由 safeStorage 加密，渲染层只见 hasKey。v2/v1 首次启动自动迁移并备份 `connection.v2.bak.json`。
- 主进程：`catalog.ts`（pi-ai 内置目录、分组与排除名单、模型 ID 匹配）、`model-store.ts`、`key-cipher.ts`、`probe-image.ts`、`runtime.ts`（内置走 SDK provider，自定义注册 jarvis-custom；输出上限“自动”去掉参数）；IPC `models:*` 与 `agent:thinking`，旧 `agent:configuration` 等已删除。
- 界面：设置“模型”页（服务商卡片、添加服务商三步、模型能力对话框）；Composer 的模型选择器按服务商分组并在带图时禁用仅文字 / 未确认模型，旁边是思考程度选择（首页与画布右边栏，写作 Agent 接入时复用）。
- 与方案文档的差异（未做，待需要时再定）：服务商卡片只显示“需要重新填写 Key”，未做“已连接 / 未测试”状态；带图时未确认模型直接禁用，不支持在选择器内点击检测（需到模型能力对话框检测）；无模型时选择器显示“先添加模型”，跳转由页面上的“前往模型设置”按钮承担。
- 未验证：真实服务商与真实中转站联调（含思考参数格式、输出上限省略）、macOS/Windows 实机钥匙串。Linux 容器下的实窗测试需要 keyring 与 loader 本地处理（见阶段 2）。

## 模型配置改造阶段 5：收尾（2026-10-24）

- 更新 AGENTS.md 当前范围、本文件当前状态、design.md 与 UI 计划书中的“模型服务”入口名；旧“我的模型 / RelaySettings / DeepSeek 4096”记录标注已被取代，保留为历史。
- 回归（模拟服务）：check、build 通过；完整实窗 106 例中 104 通过，2 例 ui-preview 失败原因为仓库只有 darwin 截图基线、Linux 下“snapshot doesn't exist”，属环境限制，非本次改动；生成的 linux png 已逐个删除。真实服务商联调另行记录。

## 模型配置改造阶段 4：输入框思考程度与图片限制（2026-10-24）

- `ModelPicker.tsx` 新增 `ThinkingPicker`（“思考：高”样式原生选择，aria-label 思考程度），首页 Composer 与画布右边栏共用；只列模型支持的档位，模型思考档位少于 2 个（不调节或只有关闭）时隐藏。显示值：会话用自身 thinkingLevel；新对话草稿用用户所选或该模型上次档位（`shared/models.ts` 的 `thinkingFor`）。`useAgent` 增加 `draftThinking` / `thinking()`：已有会话直接调 `setThinkingLevel`；草稿在首次发送建会话、切模型后按最近档位提交。
- 模型选择器图片限制：对话已有图片或画布有待发送图片时，图片能力非“支持”的模型禁用并标注“· 仅文字”或“· 未确认 · 先检测”（与服务端 assertVision 一致）。
- 样式：`.thinking-trigger` 最大 120px，画布右边栏模型 120px、思考 84px；400px 右边栏截图检查放得下。
- 测试：model-library 覆盖 DeepSeek 档位数量、会话内切到“高”后请求带思考、自定义模型隐藏选择、新对话沿用上次档位并在草稿改为关闭后发出 disabled；canvas-agent-vision 覆盖带图时仅文字 / 未确认模型禁用、右边栏草稿选“中”后请求 reasoning_effort=medium。model-library 重启后需重新安装 DeepSeek fetch 重定向（否则请求发往真实 api.deepseek.com 得 401）。验证：check、build 通过；完整实窗 104 通过，ui-preview 2 例仍因无 linux 基线失败。

## 模型配置改造阶段 3：设置页重写（2026-10-24）

- 设置页“我的模型”改为“模型”：`features/settings/ModelSettings.tsx`（默认模型下拉按服务商分组、服务商卡片列表、空状态）；新增 `features/settings/models/`：`ProviderCard`（服务商菜单 编辑连接 / 管理模型 / 删除；模型行徽标 默认 / 已下线 / 图片能力 / 可思考 / 上下文，菜单 设为默认 / 模型能力…（仅自定义）/ 移除）、`AddProviderDialog`（new 三步：选择 → 连接 → 勾选模型；edit 只改连接；models 只管理模型；自定义接口支持测试连接、/models 列表、仅支持图片筛选、手动添加 ID）、`ModelCapabilitiesDialog`（图片 自动/支持/不支持 + 检测、思考预设、上下文与输出上限留空为自动）、`model-format.ts`。
- 删除 `RelaySettings.tsx` 与 v3 旧适配层（`agent:configuration/save/remove-model/default-model/test/models` IPC、preload 旧方法、shared 中 RelayInput/RelayView/ConfiguredModel）；`relaySchema` 与 DeepSeek 常量仅保留给迁移。agent 快照带 `models`，`useAgent` 直接读 `snapshot.models`；`ModelPicker` 按服务商 optgroup 分组。思考选择器、选择器图片限制已在阶段 4 完成。
- 修复：连接步“下一步”在 busy 未清除时切到模型步，导致候选列表加载被 run 守卫跳过——改为 run 结束后再切步。默认模型下拉外层 NativeSelect 包装为 w-full，需放进 `w-70` 容器，否则标签被挤成竖排。
- 测试：新增 `tests/helpers/model-setup.ts`（经 models 桥添加中转模型）；agent / model-library 实窗测试改走新对话框，其余 Agent 用例改用 helper。验证：check、build 通过；完整实窗 104 通过，ui-preview 2 例因仓库无 linux 基线失败（环境限制，生成的 linux png 已逐个删除）。仍依赖阶段 2 记录的 keyring / loader 本地处理。

## 模型配置改造阶段 2：数据与运行时（2026-10-24）

- 用户确认设计稿后开始阶段 2（方案见 Google 文档“模型配置方案”，设计节点见 design.md 与 figma-sync-2026-10-21/model-settings-v1-state.json）。分支 ccr-56156863-qdlw6l（基于 develop）。
- 新增 `shared/models.ts`（思考档位、服务商/模型输入与视图、ModelsBridge）、`main/agent/catalog.ts`（懒加载 pi-ai 内置目录；第一期排除 Bedrock/Vertex/Azure/Cloudflare/Codex/Copilot/Radius/TypeSafe；按模型 ID 精确匹配并优先原厂数据）、`model-store.ts`（v3：providers + models + defaultModelId；v2/v1 自动迁移按“来源+地址+协议+Key 明文”合并，保留模型 id，备份 `connection.v2.bak.json`，密钥存储不可用时中止并保留原文件；能力优先级 手动 > 检测 > 中转站 > 目录）、`key-cipher.ts`（safeStorage 封装，store 可在纯 Node 测试）、`probe-image.ts`（随机 4 位数字 PNG）。删除 `configuration.ts`。
- runtime：内置服务商直接用目录模型（不再把 DeepSeek 输出上限改成 4096）；自定义模型按能力注册 input/reasoning/thinkingLevelMap；输出上限“自动”通过 onPayload 去掉上限参数（Anthropic 协议回退 8192）；思考档位由会话传入；运行时 Key 优先于环境变量；HTTP 状态改在 fetch 包装中记录（SDK 对错误响应不调用 onResponse）。
- service：去掉 DeepSeek Pro 特判，图片校验统一读模型能力（不支持 / 未确认分别提示）；会话记录 thinkingLevel，切模型降到最近档位，新会话沿用该模型上次档位；新增 saveProvider / setProviderModels / updateModel / removeProvider / testProvider / fetchProviderModels / probeVision / setThinkingLevel 与 `models:*`、`agent:thinking` IPC。旧 `agent:configuration/save/test/models` 等适配层已在阶段 3 删除。
- 环境记录：Linux 容器下 Playwright 的 Electron loader 固定追加 `--password-store=basic`，safeStorage 恒为 basic_text，凡保存 Key 的实窗测试在 Linux 必然失败（基线即如此，非代码问题）。本地验证方式：安装 gnome-keyring，在 dbus-run-session 内解锁 keyring、设置 XDG_CURRENT_DESKTOP=GNOME，并临时把 node_modules 中 playwright-core electron/loader.js 的该参数改为 gnome-libsecret（不入库，验证后还原）。

## UI V1 第三阶段完成（2026-10-24）

窗口外壳、跨空间标签、页面迁移、当前文档写作 Agent、节点与编辑栏更新已完成。最终 check/build、完整 Electron 模拟服务回归 110/110（4.3m）通过；本地 macOS arm64 目录包在外部 cwd、隔离 userData 下通过 360 项生产依赖及 ASAR 实窗启动，窗口标签、写作 Agent 与更新桥接均验证。版本仍为 0.2.5，无新依赖；保留 Agent 节点生成修复 a1ec3a3。分支 feature/ui-v1-shell，提交/推送与 36 张截图索引见 [实施与验收](ui-v1-implementation.md) 第三阶段。真实内网与其他目标系统仍待联调。


## Agent 节点生成 ID 兼容修复（2026-10-24）

- 根因：画布 Agent 创建允许 1–100 字符的节点 ID（如 `agent-image`），但生成提交、参考素材上传、任务回读及请求账本只接受 UUID；手动节点使用 UUID 因此未受影响。UUID 限制早于任务接口迁移，属于两个本地协议之间的衔接缺陷。
- 新增共享 `canvas-node-id.ts`，画布操作与生成/上传/任务/账本统一使用相同的有界字符串规则。节点 ID 只用于本地关联，不参与文件路径或远端任务 URL；requestId、projectId 继续要求 UUID。保留现有节点 ID、连线和撤销记录，无需迁移或重建节点。
- 保持 Agent 的创建/编辑权限边界：用户点击生成后正常发送请求，本次未新增 Agent 自动执行生成工具。
- 验证：`pnpm check`、`pnpm build`、`git diff --check` 通过；生成与画布 Agent 相关 10 项回归同轮通过（47.0s）。新增用例使用真实 Agent 创建/连线函数产生非 UUID 节点并存入 IndexedDB，在 Electron 窗口上传参考图、点击生成图像/视频、检查图像 URL 沿连线进入视频请求，重启后恢复结果并回读任务账本，确认没有重复提交；同时验证 ID 长度限制及 projectId/requestId 的 UUID 校验仍生效。最初沙箱监听 EPERM，放行后正常运行；新增测试首次因未填充模拟视频而预览失败，复用原视频夹具后通过。本次使用本地模拟服务，不代表真实内网联调完成。
- 修复已提交为 `a1ec3a3`（`feature/agent-node-generation`）。用户随后要求从最新 develop 新开分支并合入：当前分支 `feature/agent-generation-fix`，合并提交 `1c76472`，无冲突；检查及构建通过，未推送或发布。

## UI V1 第二批浮层与反馈（2026-10-24）

E–H 已完成并提交推送 feature/ui-v1-overlays。@jarvis/ui 增加第二批十个家族（含 CandidateList）、异步 ConfirmProvider 和最多三条的 Toast；页面接入不新增原生接口、不改数据格式。最终检查、构建、完整实窗 95/95（3.4m），浮层复验 8/8（25.5s）通过。phase-h 36 张浅深截图与所有阶段 SHA、取舍、失败修复记录见 [UI V1 实施与验收](ui-v1-implementation.md) 第二批章节。MediaEditor 外壳、ContextUsage 混合提示按评估保留；macOS 13/26 和 Windows 仍待实机验收。

## UI V1 阶段 D 设置试装（2026-10-23）

通用、模型、内网、下载、插件/技能控件迁到 @jarvis/ui；保留保存/取消/校验/Key/登录边界。清理过时设置 CSS，混合文件旧颜色原值保留为兼容变量。设置浅深与窄窗截图、组件集成补充及最终门禁见 [UI V1 验收报告](ui-v1-implementation.md)。ModelPicker 无设置调用点，聊天选择器保持原实现。


## UI V1 阶段 C 基础控件（2026-10-23）

实现 12 个组件家族、开发专用预览页和浅深 screenshot 基准；Figma 各评审节点、API、视觉差异与验证证据见 [UI V1 实施记录](ui-v1-implementation.md)。本轮按用户实施文档实现初稿，未改 Figma。


## UI V1 阶段 B 原生外观（2026-10-23）

接入只读系统强调色 bridge、macOS sidebar vibrancy 与 html 窗口焦点状态；Windows / 降低透明度使用不透明侧栏。当前主机 macOS 27.0.1，13/26 与 Windows 材质及真实系统设置切换仍待实机验收。API 来源与回归结果见 [UI V1 实施记录](ui-v1-implementation.md)。


## UI V1 阶段 A 基建（2026-10-23）

建立 @jarvis/ui 工作区、变量约束检查和稳定测试定位；目录打包、360 项生产依赖闭包及真实包启动通过。阶段实窗回归结果与截图证据集中于 [UI V1 实施记录](ui-v1-implementation.md)。


## 0.2.5 发布（2026-10-23）

- 最终成功：修复 73a049a 经 PR #64 合入 develop、PR #65 合入 main（57365e88e2029c0b693a835d72450b4c2f4933a0）。从该工作流执行原 v0.2.5 标签的运行 https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39936714410 四个作业全部 success；标签仍指向 3e58d1bb18b170c93dc4483be923373316a9a231，未移动或覆盖旧资产。
- https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.5 已于北京时间 2026-10-23 18:21:02 发布，非草稿、预发布；12 个资产均 uploaded（4 个 macOS DMG/ZIP、Windows EXE、5 个 blockmap、2 个更新清单）。
- arm64 作业 120357929200、Intel x64 作业 120357929538 和 Windows 作业 120357929515 均通过 360 项依赖、各自原生打包应用启动、ASAR 页面、设置/更新桥接及版本 0.2.5 验证。两种 macOS 的目录包、ZIP/DMG 内应用全部通过签名、公证票据、Gatekeeper accepted / Notarized Developer ID，以及最低系统 13.0 断言。
- 统一发布作业 120363396414 合并并复验双架构清单成功。线上 latest-mac.yml / latest.yml 已下载，SHA-256 与 GitHub asset digest 一致；版本、引用文件名、大小与线上资产一致，两种 macOS ZIP 均存在。中文发布说明保留自动生成记录并回读一致。
- 修复后 pnpm check 与 10 项 Node 发布工具测试通过。完整业务回归沿用发布源码 84/84；工作流修复未改应用源码。macOS 13 实机安装/登录/媒体/自动更新和真实内网仍待用户验收；Intel 原生启动已由本次 CI 结果替代此前 Rosetta 限制。
- 验证日志、Release API 与线上清单保存在 /private/tmp/jarvis-025-release-verification；UI 设计笔记 memory/design.md 未纳入本次提交。


- 首次运行 39934957130 的 Windows 已成功；复查发现 electron-builder 在 --mac 未指定目标时仍展开配置里的双架构，使每个 macOS 任务重复构建。主动取消原运行，改为 --mac dmg zip --<arch>；新增 release-targets.test.mjs 用实际 builder 解析函数复现旧行为并证明新命令只构建目标架构。仅修复工作流，原 v0.2.5 标签和应用源码不变；随后从修复后的 main 手动触发原标签。

- 实现提交 755baf0 经 PR #62 合入 develop（1761e32），PR #63 合入 main（3e58d1bb18b170c93dc4483be923373316a9a231），两次合并树与已验证源码一致。新标签 v0.2.5 已推送，唯一发布运行 https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39934957130 已启动，后续修复重试成功，见本节最终结果。

- 发布前 pnpm check、构建、版本一致性及 diff 检查通过，完整 Electron/模拟服务回归 84/84（3.0m）、Node 发布工具回归 9/9 通过。

- 用户明确授权发布新版本，包含本轮提交、推送、PR 合并、版本标签与云端发布。版本统一为 0.2.5；不移动旧标签或覆盖旧资产。
- 远端查询确认 v0.2.4 已于 2026-10-22 16:36:22 UTC 发布（北京时间 2026-10-23 00:36:22），下方阻塞记录为历史快照。
- 本次纳入 Intel/macOS 13 支持及相关发布文档；memory/design.md 为另一任务的未提交笔记，保留且不纳入本次提交。

## Intel 与 macOS 13 支持（2026-10-23）

- 用户确认新增 macOS Intel x64，并把最低系统目标从 26.0 改为 13.0；本轮仅本地实现与验证，版本保持 0.2.4，不代表旧标签或已发布安装包已改变。
- 基础配置 minimumSystemVersion=13.0，发布配置为 arm64 / x64 的 DMG、ZIP；Electron 44.9.1 自身 Info.plist 的 LSMinimumSystemVersion 已读取为 13.0。
- 云端新增 macos-26-intel，保留 macos-26 ARM64 与 Windows x64；验证脚本按架构检查 Mach-O、最低系统、目录路径、依赖、运行进程及更新目标，签名公证门禁保留。
- 新增 assemble-release-assets.mjs：分开下载三份 Artifact，先校验来源文件，再合并同名 macOS 更新清单的 files（保留 x64 兼容 path/sha512），重验两种架构的大小与 SHA-512。禁止直接覆盖同名清单或缺少任一构建时发布。
- 验证：pnpm check、pnpm build、9 项 Node 发布工具测试、7 项 Apple 网络策略测试、工作流 YAML/Bash 语法及 git diff --check 通过；测试通过当前 electron-updater 的架构过滤验证稳定/预发布清单的两种 ZIP 选择、缺失架构、版本/哈希/目标错误和拒绝覆盖。
- 实际生成本地未签名双架构目录包：/private/tmp/jarvis-macos-dual-fb5e2a5d-3739-4ba0-9b01-6f11fb84a5c2。arm64 与 x86_64 架构、两个包的 13.0 声明均已读取确认；两包各 360 项必需依赖及实际窗口/ASAR/版本/设置/更新桥接通过。arm64 原生运行，x64 通过当前 Apple Silicon 机器 Rosetta 运行，不能描述为 Intel 实机验收。
- 待验证：Intel 原生 runner、macOS 13 实机安装/登录/媒体/更新，以及两架构正式签名、公证和发布。未运行与本次打包变更无关的完整业务回归。原有 memory/design.md 改动完整保留，本轮未改 UI 或 Figma。

## 0.2.4 发布阻塞（2026-10-22）

- 用户要求再试一次 macOS；原运行 attempt 3 的作业 119920231810 于北京时间 23:35:32 开始排队、23:50:33 零步骤结束。GitHub 明确再次报告 hosted runner 未获取成功及 macOS ARM64 容量不足，runner_name 为空；非编译、签名或公证失败。Windows 成功结果复用为 119920233965，统一发布 119928398787 skipped；运行于 23:50:34 以 failure 结束。v0.2.4 标签保持不变，Release 仍未发布，已连续三次因同一外部容量问题阻塞。

- 用户确认将署名更正、登录/上传修复、真实内网地址清理及版本准备一起提交并发布 0.2.4。地址清理前曾暂停，清理验证后已明确恢复发布授权。
- 提交 `9800c50`、`662de2b`、`9de1bff` 均署名 `QianYu <qianyuzhao.ai@gmail.com>`，无 Claude 联合署名。原功能分支通过精确旧 SHA 的 force-with-lease 同步；[PR #59](https://github.com/qianyuzhao-ai/Jarvis/pull/59) 合入 develop（31d46c4），[PR #60](https://github.com/qianyuzhao-ai/Jarvis/pull/60) 合入 main（8f0c883a5098a42ce8dde2618aa927560388b48b）。两次合并树均与已验证源码一致。
- 注释标签 v0.2.4 对象 `f0958df56400469ffa9fe55dd79955c7622279b2`，指向上述 main 提交。唯一标签运行 [39800805580](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39800805580) 共尝试三次，均未成功发布；没有移动标签或覆盖旧 Release。
- 最终源码 pnpm check、pnpm build、完整 Electron/本地模拟服务回归 **84/84（3.1m）**、发布工具回归 7/7、版本一致性与 diff 检查通过。真实服务仅由用户在目标设备联调；此前 Windows 媒体 readyState 问题在本轮 Mac 未复现，不表示 Windows 实机问题已解决。
- Windows 首轮作业 119900608771 成功：版本 0.2.4、360 项必需依赖、实际 win32 打包应用启动、ASAR 页面与更新桥接、更新清单版本/目标/大小/SHA-512 均通过；安装器保持未签名。第二次尝试复用此结果，显示作业 ID 119909799819，没有重新构建 Windows。
- macOS 首轮作业 119900608038 和单独重试作业 119909796126 均排队约 15 分钟后零步骤结束。两个 check-run 均明确报告 hosted runner 未获取成功及 macOS ARM64 容量约束；非代码、签名或公证失败。两轮统一发布均 skipped。第二次运行于北京时间 23:31:50 以 failure 结束，尚无 v0.2.4 GitHub Release，最新已发布版本仍为 v0.2.3。
- Windows Artifact `Jarvis-windows-x64-39800805580` 已回读未过期，ID 12435108418，210170288 字节，保留到 2027-01-20T15:00:52Z。后续容量恢复时可仅重试 macOS 失败作业，保留原标签与 Windows 产物；若产物已过期，需重新构建缺失平台。macOS 成功后仍需核对签名、公证、真实打包启动、统一 Release 资产和线上更新清单，不能把本轮源码验证称为发布完成。

- 移除真实任务 URL 常量、读取/保存/提交时自动迁移和登录域名真实占位提示；新配置全部留空，用户已保存配置原样保留，缺失任务地址时拒绝提交。跟踪文本与本轮构建入口扫描均无原真实服务域名；历史 Git 提交及旧构建产物未重写或删除。相关回归 14/14 及上述完整回归均通过。

## 0.2.3 发布（2026-10-22）

- 用户明确要求发布新版本，授权本次提交、推送、PR 合并、版本标签与云端发布，替代下方统一登录功能此前的仅本地开发边界。纳入统一登录功能和此前 Windows 自动更新实机验证文档。
- 当前 feature/generation-login 起点与最新 origin/develop 一致；远端最新版本为 0.2.2，无开放 PR。根包、桌面包、README 源码版本与变更记录统一为 0.2.3，继续 feature → develop → main PR 和新版本标签流程，不移动旧标签或覆盖旧资产。
- 发布前 pnpm check、构建、版本与 diff 检查通过，发布工具回归 7/7 通过；功能已通过完整回归 82/82 与最终相关复测 5/5。真实公司统一登录和生成服务由用户在内网设备联调。
- 实现提交 bb94bc7 经 [PR #56](https://github.com/qianyuzhao-ai/Jarvis/pull/56) 合入 develop（2e0f6b8），[PR #57](https://github.com/qianyuzhao-ai/Jarvis/pull/57) 合入 main（5ec8e0230bde4daa350458772c3aed2bc360259f），集成树与已验证实现一致。v0.2.3 标签对象 7337e7b7d33b50abed5f8d329896d849c217041f，剥离后指向该 main 提交。
- 唯一标签运行 [39774871216](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39774871216) 的 Windows、macOS 和统一发布三作业均 success；[v0.2.3 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.3) 于 2026-10-22 20:06:32（UTC+8）发布，非草稿、预发布，8 个资产均 uploaded。未重试构建、移动标签或覆盖旧资产。
- Windows 作业 119811171332、macOS 作业 119811171800 均通过 360 项必需依赖及实际打包应用启动、ASAR 页面和更新桥接检查，版本 0.2.3。macOS 目录包及 ZIP/DMG 内应用均通过签名、公证票据和 Gatekeeper（accepted / Notarized Developer ID）；Windows 安装器保持未签名。
- 两端云端校验更新文件名、版本、大小和 SHA-512；线上 latest.yml / latest-mac.yml 已下载，SHA-256 匹配 GitHub asset digest，清单目标及文件大小匹配已发布资产。中文发布说明与登录使用步骤已保留原自动生成记录并回读确认。真实公司统一登录及内网生成仍由用户在目标设备验收。

### 0.2.3 安装包资产回读

- macOS arm64 DMG：241027557 字节，SHA-256 `3755c4fa7fb7aeaf2d58b4e6460fe2af269c51f868475ec581ac8107dadb69f3`。
- macOS arm64 ZIP：239849602 字节，SHA-256 `739c745f977c9edf1398761a475545331b932242610ef22b9e5841f0d51af20d`。
- Windows x64 EXE：209922697 字节，SHA-256 `622485146f6ee9cb9b3af866c6aa61f9d5f42cd5ea59d1dd6d9891e435974ae0`。

## 统一登录实机失败排查（2026-10-22）

- 用户在 Windows 实机反馈登录后“验证连接”始终不通过。只读检查本机 userData：最新任务错误为“平台要求登录”（Session.fetch 手动重定向被取消的分支），说明接口仍被重定向到 SSO。
- 登录窗口 HTTP 缓存显示平台经企业统一登录跳到零信任网关回调。扫码成功后用 `<img>` 同步关联域 Cookie，再 `location.replace` 跳到网关回调。真实主机名已按用户要求从仓库移除。
- 专用会话只有认证与关联域 Cookie，缺少平台网关 Cookie，网关回调未完成。判断为网关主机未加入允许的统一登录域名，跳转被登录窗口拦截。实际认证与网关域名需由用户在设置中填写；待用户复测确认。
- 代码层另发现：`will-frame-navigate` / `will-redirect` 未区分主 frame，UUAP 如流认证使用的隐藏 iframe 跳到未登记域名时会直接关闭整个登录窗口；拦截报错在点击“验证连接”后被清空，用户难以看到被拦域名。
- 用户授权后在 `feature/login-window-frames`（从 develop b1df41e）修复：未登记域名的子 frame 导航只静默拦截，主 frame 才关闭窗口并报错；`GenerationSessions` 记住最近一次登录窗口失败原因，验证返回需登录时显示“上次登录未完成，<被拦域名>”，正常完成登录或退出后清除。登录测试的模拟 SSO 页增加指向未登记 loopback 源的隐藏 iframe，断言窗口不被关闭、该请求未发出，并断言验证后仍显示被拦域名。
- 验证（Windows，Node 22.23.4）：`pnpm check`、`pnpm build` 通过；登录与任务协议相关 Electron 回归 9/9 通过。Windows 上子 frame 被拦截后 `clearStorageData` 实测约 5 秒，退出登录断言等待放宽到 20 秒（仅测试等待，未改实现）。未运行完整回归；`pnpm format` 在 autocrlf=true 的检出上把全部文件改写为 LF，仅为换行差异，git 内容 diff 只有 4 个文件。未提交、未推送；真实 UUAP 链路待用户按域名配置复测。
- 用户 dev 实测反馈“允许的统一登录域名”只能填一个：textarea 被 `#loginDomains` 样式固定为 36px 高，看似单行输入框（解析本身已支持换行/逗号分隔）。改为最小 64px、可纵向拉伸、占位示例两行、说明注明每行一个或逗号分隔；登录测试改为填写两行域名并断言可见高度至少两行、保存后回读两行。check、build、登录测试 2/2 通过。
- 用户继续实测：设置不接受 `http://` 域名（只允许 HTTPS），但登录过程中主页面跳到平台的 HTTP 地址被拦截。新增 `secureLoginHop`：主 frame 跳到已允许主机的明文 HTTP（同主机、默认端口、无账号密码）时阻止原请求并改用 HTTPS 重新加载同一地址，不放宽 HTTP、不明文发送票据；其他 HTTP 仍按未配置域名拦截。纯函数用例覆盖升级、未登记主机、非默认端口、带账号、HTTPS 未登记。check、build、登录与任务协议回归 9/9 通过；真实 UUAP 链路待用户复测。
- 用户要求图像/视频/音频素材上传也走登录会话，其余上传方式不变。`upload()` 接受可注入的 `UploadFetch`（默认仍为原 undici 直连）；`GenerationSessions.upload(generateUrl)` 用生成任务地址对应的专用会话 Session.fetch 发送同样的 multipart（req_from + files），带 Cookie、拒绝重定向；401/403/HTML 返回明确“平台要求登录”。上传地址、类型/大小校验、账本与响应解析不变。用户明确要求测试不得向真实服务发送请求：全部验证仅使用本机模拟服务。check、build、登录（含上传带 Cookie 与过期拒绝）及导出回归 6/6 通过。canvas-assets 三类拖入与 generation 窗口用例在本机 Windows 卡在媒体 readyState（上传本身成功），改回直连路径同样失败，未在原始 HEAD 上单独复核，待确认是否为本机媒体环境问题。未提交。

## 生成平台统一登录（2026-10-22）

- 用户提供新平台请求记录并确认公司统一登录跳转，随后明确采用“登录生成平台”入口，并要求域名由自己在设置中填写。新请求携带平台/统一登录 Cookie；不复制 Cookie 值到代码、记忆、任务账本或导出。0.2.2 的无登录态任务调用不等于真实内网联调通过。
- `shared/generation-login.ts` 定义可选 loginUrl/loginDomains，兼容旧设置；输入域名默认 HTTPS，登录入口允许路径，跳转域名按明确 origin 匹配、多个用换行/逗号分隔，拒绝凭据、票据查询参数、通配符与非 HTTPS（仅 loopback 可 HTTP）。平台入口及任务接口 origin 自动允许。
- `main/generation/platform-session.ts` 按生成接口 origin 的 SHA-256 使用独立 persist:generation-* Chromium 会话；不读取用户 Chrome/Edge 或默认会话。生产任务提交、查询、额度改用同一 Session.fetch，保留既有 JSON/引用/上传协议，添加同源 Origin/Referer 并跳过缓存。持久 Cookie 按平台有效期在重启后复用，不把存在 Cookie 当作连接已验证。
- `login-window.ts` 创建无 preload 的 sandbox/contextIsolation 窗口，关闭 Node/WebView，拒绝权限和下载，仅允许设置中登记的登录导航、重定向与弹窗；远端页面不注册 Jarvis IPC。未允许的跳转只提示 origin，不显示带票据的完整 URL。主窗口关闭时关闭登录窗口及其子窗口。
- 新增四个受限 IPC：login-status / login-open / login-verify / login-logout，仍校验主窗口、主 frame 和 URL。连接验证只 GET 已知的 seedance 额度接口，不创建生成任务，也不表示所有模型额度/权限均已通过。退出仅清理本应用专用会话 Cookie、站点数据、HTTP 缓存与 HTTP 认证缓存。
- 401/403、HTML 登录页及重定向明确标记 authRequired。Electron 44.9.1 的 Session.fetch 手动重定向实际抛出 `Redirect was cancelled`，已专门处理并经真实 Electron 验证；不跟随任务 API 跳转或把请求 JSON 发往 SSO。无任务 ID 的不确定提交仍 unknown，不自动重发；有任务 ID 的运行任务暂停上游轮询，重新登录并验证后恢复 5 秒查询，包括暂停期间重启应用。
- 设置新增登录入口、域名列表、登录/验证/退出操作；未保存时不使用草稿登录配置。画布登录失效时提供一次可见提醒，重新登录后清除该提醒；任务详情显示等待重新登录。额度仍不常驻项目。
- 已通过检查、构建和新登录/鉴权相关测试；模拟平台覆盖 Cookie 带入任务请求、来源隔离、未许可跳转拦截、登录过期暂停、跨进程重启续查不重发、Cookie 重启复用、过期与退出后不使用缓存及浅深/紧凑设置界面。完整回归 **82/82（3.0m）** 通过；最终补充“HTML 网关错误不误判登录”后，登录与协议复测 **5/5（20.8s）** 通过，最终 pnpm check / pnpm build / git diff --check 通过。前轮定位并修正了 Chromium HTTP 缓存导致退出后读到旧验证结果的问题；既有侧栏动画中间帧用例曾偶发失败，本轮完整重跑通过，未修改侧栏实现或放宽断言。真实统一登录、公司设备策略与真实内网生成由用户在 Windows 设备联调；上述为开发阶段验证；现已随上方 0.2.3 发布。

## 0.2.2 发布（2026-10-22）

- 用户要求发布新版本，以便在另一台可访问内网的设备上测试，授权本次提交、推送、PR 合并、版本标签和云端发布。此次授权替代下方任务接口改造原先的仅本地实现边界。
- 远端核对最新版本为 v0.2.1，无开放 PR；feature/generation-tasks 起点与 origin/develop 一致。根包/桌面包、README 源码版本和变更记录更新为 0.2.2，按 feature → develop → main PR 集成，随后在 main 合并提交打新标签，不移动旧标签、不覆盖旧资产。
- 发布前版本、pnpm check、构建及 diff 检查通过，发布工具回归 7/7 通过；已有完整 Electron 回归 79/79 和最终相关复测 8/8。真实内网由用户在其他设备联调。
- 实现提交 c2e976e 经 [PR #53](https://github.com/qianyuzhao-ai/Jarvis/pull/53) 合入 develop（81db00f），[PR #54](https://github.com/qianyuzhao-ai/Jarvis/pull/54) 合入 main（8688f7626c952ddf0f8d8e11342d80ed10c8031f），集成树与已验证实现一致。v0.2.2 标签对象 2331d29e8bc95074a5c33037ebc5b3209877a86f，剥离后指向该 main 提交。
- 唯一标签运行 [39764722806](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39764722806) 的 macOS、Windows 和统一发布三个作业均 success；[v0.2.2 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.2) 于 2026-10-22 18:46:43（UTC+8）发布，非草稿、预发布，8 个资产均 uploaded。未重试构建、移动标签或覆盖旧资产。
- Windows 作业 119777222170、macOS 作业 119777221712 均通过 360 项必需依赖检查及实际打包应用启动、ASAR 页面/更新桥接验证，版本为 0.2.2。macOS 目录、ZIP/DMG 内应用均通过签名、公证票据及 Gatekeeper（accepted / Notarized Developer ID）；Windows 安装器仍未签名。
- 两端云端均验证更新目标、文件大小与 SHA-512。线上 latest.yml / latest-mac.yml 已下载，SHA-256 匹配 GitHub asset digest，版本及目标文件大小与实际资产一致；中文发布说明保留自动生成记录并已回读。真实内网生成和 macOS 实机自动升级仍待用户验收。
- 用户于 2026-10-22 反馈 Windows 实机“发现新版本 → 点击更新 → 重启安装”流程可用，已验证通过。此为用户实测结果，替代此前 Windows 自动升级待验收状态；不据此推断内网生成已通过。

### 0.2.2 安装包资产回读

- macOS arm64 DMG：241029304 字节，SHA-256 `b5fce6438467c8bcd3140cf02deb35dc8dd4f58128cf72ea63c117d836cc1e2c`。
- macOS arm64 ZIP：239844100 字节，SHA-256 `d65fb63c40f0c71bd155df2af6e71f8ca944b46ee0bc9feec2ea5157abbe96e6`。
- Windows x64 EXE：209919186 字节，SHA-256 `247ab36b19e66eab50923f38bdc49ba96d372f0b82e5ca360c9c373e0022a92d`。

## AIGC 新平台任务接口迁移（2026-10-22）

- 用户确认旧平台迁入新平台：全部图像/视频模型共用任务接口，模型参数、参考素材、上传与 Prompt 引用 `<<<image_1>>>` 等保持不变。查询周期最终明确为 **5 秒**，替代讨论中的 30 秒；真实内网联调由用户执行，本轮只做本机模拟服务与真实 Electron 窗口验证。
- 主进程 `generation/task-protocol.ts` 提交现有 JSON 到 `/api/mr/tasks`，保存返回 `task_id` 后每 5 秒 GET 同一路径下的任务。`pending/running` 对应本地 running，`success` 从 `response.result.content[0]` 取 HTTP(S) URL，`failed` 保留具体错误码和说明。校验任务 ID，查询异常不重发 POST；提交断线、5xx、408、无有效 task_id 均保持结果未知。
- `generation-jobs.json` 新增独立 remoteTaskId、remoteStatus、modelName 与完成额度查询状态；本地 UUID、幂等去重、原始请求 JSON 与统计保留。已取得远端 ID 的进行中任务重启后恢复查询；旧同步进行中记录和未取得 ID 的提交继续标为 unknown。先写入本地记录再提交、先保存远端 ID 再查询；任务地址固定为提交时的地址，不随当前设置改变。
- 0.2.2 曾预设真实任务服务，并将空地址或旧 `/aigc` 地址自动迁入。2026-10-22 用户要求移除真实地址，当前源码改为所有内网地址手动填写、读取及提交时保留已保存的地址，不再自动迁移。设置名称为“生成任务地址”，历史账本不改写旧端点。导出明细包含“平台任务 ID”。
- 已接单任务成功/失败后查询一次同级 `/model-quota?model_name=...`，使用真实 payload 模型家族（如 seedance、nano-banana）。生成结果先落盘并显示，额度查询独立结束；失败只提示到平台查看，不改变生成成败。额度不常驻项目；全局完成提醒按队列展示、可关闭，随文字长度自动消失，不重复提醒已处理结果。
- 验证完成：`pnpm check`、`pnpm build`、`git diff --check` 通过，完整 Electron/本机模拟服务回归 **79/79（2.7m）** 通过，最终代码清理及深色提醒补充后相关复测 **8/8（32.7s）** 通过。覆盖全部 7 模型的任务路由/原始 payload/额度模型家族、重启恢复、真实 5 秒间隔、查询断网和不确定提交不重发、旧地址迁移、图像/视频窗口、引用/连线、下载/复制和导出。浅深提醒截图已检查；最终截图在 `apps/desktop/test-results/c1a87f25-f4cc-40ad-8a6c-7a016d05d2e8/generation-Electron-upload-fac85--video-and-restores-results/`。未发送真实内网生成请求、未提交/推送/发布，版本保持 0.2.1。

## 0.2.1 热修复发布（2026-10-22）

- 用户明确授权发布及后续排错；最终运行 [39717656519](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39717656519) 的 Windows、macOS、统一发布三个作业均 success。[v0.2.1 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.1) 于 2026-10-22 11:44:54（UTC+8）发布，非草稿、预发布；Release API 已回读 8 个资产均 uploaded。
- 应用修复 ef9bdb8 经 [PR #45](https://github.com/qianyuzhao-ai/Jarvis/pull/45) 合入 main 995c42323379e738cccbac73b0d0e7d68e9fbf6f。v0.2.1 标签对象仍为 27b4ea20831f3a50f9b923a52d77024184c10a14，剥离后仍指向该 main 提交。后续仅修复执行工作流，没有移动标签、覆盖旧资产或改变标签应用源码。
- 直接同步 PR #46 遇到 README 历史说明冲突，改在同步分支保留两侧说明，经 [PR #47](https://github.com/qianyuzhao-ai/Jarvis/pull/47) 合入 develop fdeff75；GitHub 同时将 #46 标记已合并。
- 首轮 [39714945343](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39714945343) 的 Windows 真实启动已通过，但新增 macOS 启动门禁仍沿用 Intel runner，无法执行 arm64 应用。此为本轮配置遗漏，首轮主动取消；runner 修正 c2f8e3c 经 [PR #48](https://github.com/qianyuzhao-ai/Jarvis/pull/48) 合入 main 7462fc2，改为满足最低系统要求的 macos-26 ARM64，通过 [PR #49](https://github.com/qianyuzhao-ai/Jarvis/pull/49) 同步 develop。
- 第二轮 [39716096465](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39716096465) Windows 全部通过，macOS 在 set-key-partition-list 报 SecKeychainUnlock：app-builder-lib 26.15.3 创建随机密码钥匙串后错用 p12 密码配置访问权限。证书导入已成功，无需用户更换 Secrets；本轮没有发布。
- 钥匙串修复 886b95d 经 [PR #50](https://github.com/qianyuzhao-ai/Jarvis/pull/50) 合入 main d6924288e3218ee329309ff57306b1c00d61f683，通过 [PR #51](https://github.com/qianyuzhao-ai/Jarvis/pull/51) 同步 develop 60e59a7。从工作流提交加载独立签名准备脚本，区分证书密码和随机钥匙串密码，校验同团队 Developer ID Application，构建只使用 CSC_KEYCHAIN，保持全部签名、公证、原生启动门禁。两项准备脚本回归、pnpm check、工作流凭据作用域/步骤顺序和 diff 检查通过。
- 最终运行从 main d692428 的工作流构建原 v0.2.1 源码。Windows 作业 119623541003：360 项必需依赖、实际 win32 打包应用启动、ASAR 页面、设置/更新 IPC 和版本 0.2.1 通过；安装器保持未签名。macOS 作业 119623541301：钥匙串准备、Developer ID 签名、公证、目录/ZIP/DMG 内应用的票据及 Gatekeeper 均通过，三者均 accepted / Notarized Developer ID；360 项依赖和真实 darwin 打包启动同样通过。
- Apple 只读查询 [39718367184](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39718367184) 确认公证 1f0283f9-3765-40c2-9ed4-fa5bd627e9fa 为 Accepted。两端均实际通过更新清单版本、目标、大小、SHA-512 校验；已上传 DMG/ZIP/EXE、latest-mac.yml / latest.yml 和三个 blockmap。
- 本地修复源码完整回归 74/74；0.2.1 本地检查、构建、五项依赖/清单回归、360 项依赖及实际打包启动通过。原始 0.2.0 包被新增门禁拒绝。NSIS 完整安装、用户设备环境、真实第三方服务及两个可启动生产签名版本间的升级不在本次云端启动结论内；0.2.0 崩溃客户端需手动安装 0.2.1。
- 收尾时短暂遇到本机 GitHub TLS/EOF 中断，随后恢复。两份线上更新清单已下载，SHA-256 与 GitHub asset digest 一致，版本 0.2.1、所有目标文件名和大小匹配实际发布资产；补充发布说明已回读确认。已保存成功日志与 Release API 结果。

### 0.2.1 资产回读

- `Jarvis-0.2.1-macos-arm64.dmg`：241029225 字节，sha256:c1e2bc46016c2121089743fcf6e927d51bdc9a4eef26aab888dc876b0bf1d72b。
- `Jarvis-0.2.1-macos-arm64.zip`：239841796 字节，sha256:79eba9f486657cb12cad0f67a655a45c18d8ed8e9d477d654a0cbaf50f185e0c。
- `Jarvis-0.2.1-windows-x64-unsigned-setup.exe`：209917169 字节，sha256:8609177048aae9403625f76e7b38269f799ceef00891a5cc7f51d51897664cbb。

## 0.2.0 发布包启动依赖修复（2026-10-22）

- 用户报告 Windows 启动报 Cannot find module debug，堆栈为 builder-util-runtime → electron-updater → 主进程。先从 origin/develop 1e4cb47 的诊断分支完成验证，随后按线上修复规则保留所有修改迁移到 origin/main 5a191aa 起点的 hotfix/packaged-runtime-dependencies；临时诊断分支已删除，当前仅修复与验证，未授权或执行新版本发布、标签移动、旧产物覆盖。
- 实际下载 v0.2.0 macOS ZIP（SHA-256 b5df633841c6d01ee70e787a058563326bc99fb72e54b22f555d1a413d8dded3），用包内 Electron 读取 app.asar 复现相同 debug 缺失；依赖完整性门禁还拦住 pi-ai → anthropic SDK 缺失。原云端签名、公证、清单通过并不证明可启动，既有源码回归依赖工作区 node_modules 未覆盖漏包。
- pnpm 11 list 的去重子树使 app-builder-lib 26.15.3 pnpm 收集器漏依赖。pnpm patchedDependencies 固定一行补丁，选择 builder 已有的磁盘遍历收集器，锁文件仅新增 patch hash，未改运行时依赖或工具版本。必需依赖找不到时直接失败。
- 新增 verify-packaged-dependencies.cjs 检查 ASAR 中完整必需依赖闭包（识别内置模块与可选依赖，不得借用包外 node_modules），verify-packaged-startup.mjs 用实际打包程序、仓库外 cwd 和隔离 profile 验证页面及更新 IPC。双平台发布在上传前执行门禁；门禁回归 2/2 通过，原发布包确实被拒绝。
- 本地修复 macOS 目录包 release/71dfb77c-9e73-4b96-bb27-9c379a8cb875 已通过 360 项必需依赖与真实启动、ASAR 页面、设置/更新桥接验证；Windows x64 目录包 /tmp/jarvis-windows-runtime-fix-91b7e3cb 的 360 项依赖检查通过。Windows 原生启动尚待 Windows CI/实机验证，本地 Mac 启动包为未正式签名/公证的结构验证产物。
- 已崩溃的 0.2.0 无法通过应用内更新自救，修复版需手动安装。完整源码回归 74/74（2.1m）通过；pnpm check、构建和 diff 检查通过。修复仍未提交、推送或发布，源码版本保留 0.2.0。

## 0.2.0 集成与发布（2026-10-22）

- 用户新授权检查全部本地修改并提交、推送、合并、发布 0.2.0；本节替代此前仅本地开发/提交的授权状态。纳入 feature/ui-style 的 11 个提交和自动更新提交 21e0c80，保留历史分支及旧设计 stash。
- 根包、桌面包与变更记录统一 0.2.0。按 feature → develop → main PR 和 main 合并提交标签发布；本地集成及云端发布验证全部通过。
- 合并后使用 Node 22.23.3 验证：pnpm check、构建与完整 Electron 回归 74/74（2.2m）通过；更新清单 3/3 和 Apple 网络有限重试 7/7 通过，git diff --check 通过。真实 DeepSeek 服务及两个签名版本间的生产自动升级仍未验证。
- [PR #42](https://github.com/qianyuzhao-ai/Jarvis/pull/42) 合入 develop（6286015）；[PR #43](https://github.com/qianyuzhao-ai/Jarvis/pull/43) 合入 main（5a191aa507e9e27a7d455c171c439c21c12d32b6），两者与已验证集成树一致。注释标签 v0.2.0 指向该 main 提交，标签对象 9d7fd3f84de5a2ec5f745ae24002abf137510e0b；唯一标签运行 [39709911615](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39709911615) 已触发，未修改旧标签。发布运行 macOS、Windows、统一发布三个作业均 success；[v0.2.0 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.0) 于 2026-10-22 10:28:00（UTC+8）发布，非草稿、预发布，8 个资产均 uploaded。

- Windows 云端作业 119598514824 已完成：安装器为 x64、版本 0.2.0、应用及安装器符合未签名预期；2026-10-22T02:14:46Z 日志确认更新清单的版本、目标、大小、SHA-512 校验成功，产物上传完成。

- Apple 只读查询 [39711114877](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39711114877) 确认本次公证 288cecf8-f672-46de-bbe7-4d5b58f9a5ce 为 Accepted；正式打包及目录/ZIP/DMG 内应用的签名、票据、Gatekeeper 均通过，三者均 accepted / Notarized Developer ID。本次无需重试发布。
- 发布资产包含 macOS arm64 DMG/ZIP、Windows x64 未签名 EXE、latest-mac.yml / latest.yml、三个 blockmap。两端云端校验更新目标、版本、大小及 SHA-512；线上清单已下载回读，其 SHA-256 与 GitHub digest 相同，所有目标名称/大小匹配实际发布资产，未发布 builder 调试文件。
- 0.1.8 没有更新器，需手动安装一次 0.2.0；后续生产签名版本之间的真实升级仍需更高版本验证。真实 DeepSeek 服务和 Windows 实机功能不在本次云端签名/清单验证结论内。

### 0.2.0 安装包资产回读

- `Jarvis-0.2.0-macos-arm64.dmg`：236625024 字节，sha256:401ea40a52fba70cc0dcf770fd423bcfe06c0e1d509397de030359668ddbbad7。
- `Jarvis-0.2.0-macos-arm64.zip`：235378407 字节，sha256:b5df633841c6d01ee70e787a058563326bc99fb72e54b22f555d1a413d8dded3。
- `Jarvis-0.2.0-windows-x64-unsigned-setup.exe`：207043282 字节，sha256:44030c5f90a3633001865a17665cc4f3a2d8c412cc0a4b3d34089125e5c8ed96。

## 我的模型与 DeepSeek 官方接入（2026-10-22，已被 2026-10-24 模型配置改造取代，仅作历史）

- 用户明确模型服务采用可持久化的“我的模型”列表，支持 DeepSeek 官方与多个自定义中转模型共存、Chat/画布按会话切换。实现留在当前 `feature/ui-style`；用户随后授权本地提交代码、测试及项目记忆，不推送或合并。
- 已实际检查安装的 `@earendil-works/pi-ai` / `pi-coding-agent` 1.3.0：通过 `getBuiltinModels`（`@earendil-works/pi-ai/providers/all`）和 `ModelRuntime.getModel('deepseek', id)` 核对内置 DeepSeek。根包没有旧 `getModels` 命名导出，不沿用旧 API。官方文档 https://api-docs.deepseek.com/ 与 https://api-docs.deepseek.com/api/list-models/ 本轮读取确认 `deepseek-flash` / `deepseek-v4-pro` 和官方地址；思考/工具兼容规则见 https://api-docs.deepseek.com/guides/thinking_mode/ 。
- `RelayConfig.provider` 可选 `relay` / `deepseek`，缺少字段的旧记录按 relay 处理。官方配置校验固定 `https://api.deepseek.com` 和 `openai-completions`，仅接受当前版本内置模型；Runtime 使用原生 deepseek provider，保留内置兼容与输入能力。上下文默认采用 SDK 的 1,000,000 保护值，输出仍沿用应用原有 4096 默认与 32768 配置上限；不宣称这些应用选值是官方完整上限。思考仍 off。
- `agent/connection.json` 升为 `{version:2,defaultModelId,models:[{id,config,encryptedKey}]}`，最多 100 条。初始化将旧 `{config,encryptedKey}` 原子迁移为一条 UUID 模型记录，保留密文。`view()` 仅返回 `{config,hasKey,defaultModelId,models:[{id,config,hasKey}]}`，不包含 Key 或密文；返回配置用结构化副本，避免会话切换修改模型库。
- `saveConfiguration` 输入兼容旧负载；新增 `create:true` 为追加，`modelId` 为编辑，二者互斥；均省略时保持编辑默认模型的旧语义。测试连接/获取模型可带相同目标信息以解析对应 Key；切换来源/地址不得暗中沿用其他模型的 Key。官方来源必须提供 Key，继续使用 safeStorage 加密。
- 新增受限 IPC `agent:remove-model(UUID)` / `agent:default-model(UUID)`；从 preload 暴露对应方法。模型删除只更新配置数组，保留会话与 SDK 历史；删除默认模型改为第一条剩余记录，空库默认 null。读写仍由主进程串行处理，运行/测试期间禁止配置写入。
- `ChatSession.modelId` 为可选 UUID，新会话绑定默认记录；既有 `setModel({sessionId,model})` 中 `model` 现在指已保存记录 UUID，不再接收任意自由输入 ID。切换更新会话连接、模型、上下文及 Key 解析目标；发送按该 UUID 解析，不依赖全局默认来源。旧会话无 UUID 时保留原展示和原连接检查，可重新选择模型升级绑定。模型删除后发送明确失败，不偷偷回退到别的凭据。
- 原生模型选择框同时用于首页和画布，保留历史。DeepSeek Pro 的当前附件/历史图片在 renderer 和主进程边界阻止，避免 SDK 忽略不支持的图像；Flash 继续支持已授权的图片与视频代表帧。SDK 资源加载和工具限制不扩展。
- SDK fetch 包装统一构造 `Request`，保留 SDK 请求头/请求体并拒绝重定向；无鉴权中转仍移除 Authorization。DeepSeek 测试使用固定官方地址和原生 provider，通过测试内 fetch 转发到本地 SSE 模拟服务，不放宽生产地址校验或读取真实 Key。
- 检查、构建和 diff 通过；最终相关回归 8/8（17.1s）通过。整组 60/61（1.7m），唯一剩余为已有侧栏动画退出中间帧取样不稳定，独立复测通过；鼠标连线两项也独立及后续整组通过。没有为了全绿修改这些断言。真实 DeepSeek 服务、真实 Key 和费用未验证。本轮未发布或提交。

## 应用内自动更新（2026-10-22）

- 持久目录迁移后，修复了 14 个自动生成的 pnpm 启动脚本中的旧绝对路径。登录 shell 的 Node 22.17.0 在 Playwright 加载 ExcelJS 时出现内部模块错误，未跳过回归；改用项目固定 Node 22.23.3 后，持久目录最终检查/构建和完整 **70/70（1.8m）**、3 项清单测试均通过。隔离 Node 位于 `/Users/hugo/Developer/my-jarvis-worktrees/node-v22.23.3-darwin-arm64/bin/node`，官方分发 SHA-256 已核验，未改全局 Node。运行测试时临时将该 bin 加入 PATH；未关闭供应链或 TLS 检查、未删除缓存。
- 本地 ASAR 已检查，包含 electron-updater 6.8.9 及全部直接运行时依赖。最终文案区分“本次检查未完成”和“当前已是最新版本”，时间标为上次成功检查，已有成功记录不能掩盖后续网络失败。

- **最终验证**：`pnpm check`、构建及完整 Electron 回归 **70/70（1.8m）** 通过；3 项 Node 清单回归、实际 ZIP 更新源/清单哈希、工作流 YAML/Bash、发布 schema 和 debug 排除检查通过。追加原生交接失败后恢复窗口的回归已纳入同一轮。浅色进度和 900×640 深色下载完成截图均已查看；截图位于 `apps/desktop/test-results/de12538f-b51d-472e-b664-f76c87b1000f/updates-automatic-and-manu-3f630-ation-work-in-a-real-window/`。

- 用户要求自动/手动检查、下载进度、确认后重启安装，并明确选择包含 GitHub 预发布版本。从刷新后的 origin/develop `004beb3` 创建 `feature/in-app-updates`，位于 `/Users/hugo/Developer/my-jarvis-worktrees/in-app-updates`；原 `feature/ui-style` 工作区及未提交修改未触碰。本轮仅实现，未提交、推送或发布，版本号保持 0.1.8。
- 运行时依赖 `electron-updater 6.8.9`，开发依赖 `yaml 2.9.0`，均固定版本。npm 查询临时失败后从 pnpm 缓存成功安装，锁文件同步。更新逻辑只在主进程，preload 仅提供状态、检查、下载、安装和保存回执接口，没有任意 URL/文件/Shell 能力；sandbox/contextIsolation/CSP 保持。
- 正式 macOS/Windows 包且存在资源 app-update.yml 才启用。启动 15 秒后及每 4 小时自动检查，包含预发布、拒绝降级、不自动下载、不在普通退出时安装。检查/下载/安装防重复，状态带 revision 防止旧 IPC 回包覆盖新进度；后台无新版本或检查失败不弹窗。
- 主进程确认框默认稍后。重启前拒绝活跃 Agent、生成、上传、下载、导出和写作操作；renderer 以一次性 ID 确认保存，项目 IndexedDB 写入完成、写作文档 flush、无未保存设置后才交接。回执核对 owner/mainFrame/URL/ID，超时 15 秒不安装；窗口关闭等待上限 5 秒，收到 closed 后才 quitAndInstall。取消恢复焦点，交接失败恢复窗口/错误状态，普通退出不安装。
- 正式发布配置覆盖基础 publish:null，GitHub provider 固定公开 qianyuzhao-ai/Jarvis；未向客户端打包 token。CI 校验更新清单版本、通道/平台文件名、目标 ZIP/EXE、真实大小与 SHA-512，上传清单和 blockmap，排除 builder 调试清单。保留签名公证及有限重试、双平台全成功后统一预发布的流程。
- 已通过更新状态/确认单测、3 项清单回归及真实 Electron 更新交互；真实 electron-updater 通过本地 HTTP 下载到独立测试缓存，坏 SHA-512 被拒绝后重试成功。原生交接测试验证写作文件先保存、窗口先关闭、再调用模拟安装器；未运行真实替换安装。
- 已生成本地独立目录未签名 ZIP：`release/updates-validation-2d0e73d8-d75a-4841-b4af-c0345a753b98/`，验证应用资源内 GitHub app-update.yml（无 token）及实际 latest-mac.yml 的版本/大小/SHA-512。发现并排除 builder-debug.yml；此包不发布、不作为签名升级验收。完整回归与截图结果见本节最终验证。
- 已发布 0.1.8 仍无更新器。首次含更新器的新版本须手动安装一次；真实 A→B 签名升级、云端新清单发布及 Windows 更新实机验收尚未完成，不能据此宣称已发布或已验证跨版本升级。发布操作见 apps/desktop/RELEASING.md。

## Apple 票据校验网络错误有限重试（2026-10-21）

- 用户授权修复 Apple 网络校验重试、按 Gitflow 提交/推送/合并、重试发布 0.1.8 并验证。原工作区 `feature/ui-style` 的 UI、测试及设计记忆未提交改动保留；修复从最新 origin/develop 的 `efbce12` 在 `/private/tmp/jarvis-apple-network-retry` 独立 worktree 开展。
- 原运行 `39613181833` 实际于北京时间 22:47:25 报告 notarization successful；目录包与 ZIP 内应用的票据和 Gatekeeper 均通过（Notarized Developer ID）。DMG 内应用 codesign 通过，但 stapler validate 访问 Apple CloudKit 时 NSURLErrorDomain -1005，退出 68，导致 macOS 作业失败和统一发布跳过；此前“仍待公证”记录为当时快照，已由本次真实日志替代。
- `apple-network-retry.sh` 仅对明确 NSURLErrorDomain/CFNetwork 临时网络代码最多 3 次，间隔 5/10 秒；拒绝/撤销/签名错误、无网络代码的 Error 68 不重试，最后失败保留原退出码。应用于 stapler validate 和 spctl，codesign 与所有签名/票据检查保留。
- 手动重试仍检出 v0.1.8 应用源码及原打包配置，但 macOS 验证工具从 github.sha 对应的工作流提交独立稀疏检出；避免移动保护标签，也避免直接重跑旧工作流仍调用旧脚本。工具不打包进应用，原 Tag SHA 与来源须在重试后回读核对。
- 7 项本地 Bash 回归已通过：首次成功、网络后恢复、3 次耗尽、无网络标识的票据失败、拒绝伴随网络日志、签名错误、未知错误。`pnpm check`、`pnpm build`、工作流 YAML/所有 Bash 步骤语法及源码/工具来源隔离检查、`git diff --check` 通过。应用运行代码未改，沿用 v0.1.8 已通过的 57 项窗口回归；云端运行同一重试回归后校验真实产物，最终发布结果待回读。
- `f3f2015` 经 PR #39 → develop `35813f7`、PR #40 → main `10490dc`，从 main 手动 dispatch 原 v0.1.8，运行 [39621901772](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39621901772)。应用源码仍来自原标签 `caa4256`，校验工具来自触发提交 `10490dc`；远端标签对象和剥离后提交均回读未变。原工作区 UI 改动未触碰。
- 本次云端公证再次成功，独立检出校验工具与 7 项重试回归通过。目录包、ZIP 解压应用、DMG 内应用各实际遇到一次 Apple -1005/退出 68，均在等待 5 秒后的第 2 次校验成功，随后 Gatekeeper 全部 accepted、source=Notarized Developer ID；codesign、版本/架构/团队及归档完整性校验保留并通过。三次真实恢复证明修复生效，没有绕过签名或公证门槛。
- **最终结果**：手动重试运行 `39621901772` 的 macOS、Windows、统一发布三个作业全绿；[v0.1.8 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.8) 于北京时间 23:21:18 发布，非草稿预发布。三个 uploaded 资产：DMG `247445636` 字节、ZIP `246139146` 字节、Windows EXE `217792676` 字节。日志核对源码 checkout 为 `caa4256`、校验工具 checkout 为 `10490dc`；受保护标签保持原值。本轮只有一次发布重试，没有移动标签、覆盖旧 Release 或触碰原 UI 工作。
- 当前 0.1.8 已验证正式签名、公证、票据和 Gatekeeper，以及三次真实网络重试恢复；替代前述等待/失败快照。未执行新签名安装包的实机启动或跨版本自动升级；自动更新器未接入，Windows 仍未签名。发布说明与 README 已同步真实结果。

## 0.1.8 首次云端运行与早期查询（历史，2026-10-21）

以下为首次运行及等待过程的快照；公证成功、网络校验失败、修复后的最终发布结果见顶部“Apple 票据校验网络错误有限重试”。

- 发布前 `pnpm check`、构建、完整 Electron + 本地模拟服务 **57/57（1.7m）** 通过，版本一致性、electron-builder 合并配置/schema、工作流 shell、Secrets 作用域、entitlements plist 和 diff 检查通过。
- 实现由 PR #34 → develop、PR #35 → main；标签 v0.1.8 指向 main 合并提交 `caa4256`。唯一发布运行 [39613181833](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39613181833) 的 Windows 作业已全绿（4m44s）；macOS 实时日志确认选用 Developer ID Application 签名，尚未返回公证结果。
- 只读诊断经 PR #36/#37 集成，[运行 39615732424](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39615732424) 成功使用三项 Apple 凭据读取公证历史：`Jarvis.zip` 于北京时间 22:09:14 提交，ID `71055590-e096-4ee7-974c-6e75244c9610`，查询状态 `In Progress`。这证明签名及公证上传阶段已完成、凭据认证可用；不代表 Apple 已接受公证或 Gatekeeper 已通过。实际 Release、票据和包内校验结果待完成。
- 使用 Chrome 已登录会话读取 GitHub 实时日志；`gh run view --log` 在作业结束前不可用，IAB 未登录不能查看日志。没有读取本地私钥或 GitHub Secret 明文，也未重复构建或重新提交公证。
- 第二次只读诊断 [39616937355](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39616937355) 的查询作业成功返回同一提交 `In Progress`，没有 Invalid。发布运行仍等待 Apple，尚未通过公证票据/Gatekeeper 校验或创建 Release；这是外部队列等待，不能宣称 0.1.8 发布成功。原作业上限 60 分钟；后续先读取运行结果及同一提交状态，保留受保护标签。

## macOS Developer ID 签名与公证（2026-10-21）

- 0.1.8 首次云端运行 `39613181833` 的 Windows 已构建校验成功，macOS 在选用 Developer ID 身份后长时间无新日志。为区分签名阶段和 Apple 队列，新增独立手动 `notarization-status.yml`，仅运行 `notarytool history` 读取团队公证历史，不构建应用、不上传、不重提公证。按 feature → develop → main 集成后手动查询，不移动 v0.1.8 标签或重复打包。
- 后续用户授权提交、推送、Gitflow 合并并发布 0.1.8；已核验远端五项 Secrets 名称齐全及新标签不存在。版本统一 0.1.8；发布前 `pnpm check`、构建、完整 Electron + 模拟服务 **57/57（1.7m）** 通过；版本校验、合并配置 schema、Secrets 作用域、工作流 Bash 语法、plist 和 diff 检查通过。云端结果待回读，不将配置通过等同公证成功。
- 用户报告已创建并导入带私钥的 Developer ID Application 证书、导出加密 `.p12`，配置了 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` 五项 GitHub Repository secrets；本轮不读取秘密值，也没有验证凭据有效性。
- `feature/macos-signing-notarization` 从刷新后的 `origin/develop` 创建。基础配置移除 `identity: null`，本地 `scripts/package.mjs` 显式关闭正式签名、公证及 Hardened Runtime；发布配置使用 distribution、macOS 专属 forceCodeSigning、Hardened Runtime、公证，以及应用/Helper 共用的最小 JIT 与可执行内存 entitlements。Windows 继续未签名，不注入 Apple 凭据。
- macOS 打包步骤检查五项 Secrets 非空及 Team ID 格式，覆盖全局 `CSC_IDENTITY_AUTO_DISCOVERY=false`。`verify-macos-release.sh` 验证目录包、ZIP 解压包、DMG 只读挂载包的 arm64、版本、Bundle ID、Developer ID 身份、Team ID、runtime 标志、codesign 完整性、公证票据与 Gatekeeper；校验失败不进入统一发布。macOS 文件移除 unsigned 后缀，Windows 保留；Release 仍为预发布。
- 已验证：electron-builder 26.15.3 的实际合并配置和 schema、entitlements plist、工作流 YAML/Secrets 作用域、Bash 语法、`pnpm check`、`pnpm build`。应用运行代码未修改，本轮不重复窗口测试。
- 初始配置阶段未提交、推送或触发 CI；后续用户已授权 0.1.8 发布，提交、合并、标签和真实凭据验证已完成，详见顶部本版云端记录。Apple 公证、签名包启动及升级结果仍须分别验证；0.1.7 及旧 Release 保持未签名。自动更新器及更新元数据未接入，`publish: null` 保留。后续操作见 `apps/desktop/RELEASING.md`。

## 0.1.7 发布验证（2026-10-21）

- 用户授权将全部最新改动发布为 0.1.7；根包、桌面包、README 和 CHANGELOG 已统一版本。包含 Chat V2、画布 Agent/视觉资产、Skills、生成详情和原子 Prompt 引用 5 个功能提交。
- 本轮重新执行 pnpm check、pnpm test:smoke（包含构建），完整 **57/57** 在 1.7m 通过；版本校验脚本 v0.1.7 和 git diff --check 通过。受限沙箱不能启动 Electron/模拟端口，切换原生权限后同一完整回归通过，没有更改实现或放宽断言。
- 真实服务联调和 Windows 功能验收边界不变；v0.1.7 标签指向 main 合并提交 2f7ef56（功能 PR #31 → develop 69756c5，发布 PR #32 → main）。唯一云端运行 [39605956426](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39605956426) 的 macOS、Windows 和统一发布作业全部成功；[Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.7) 已回读为非草稿预发布。三个 uploaded 文件为 DMG 246747514 字节、ZIP 246019823 字节、Windows EXE 217792667 字节，名称均含 0.1.7 与 unsigned。未移动旧标签、未重复运行构建；Release 说明包含本版功能及验证边界。

## Prompt 引用原子编辑与光标菜单（2026-10-21）

- 用户要求 @ 候选随当前输入位置弹出，带缩略图及上下/Enter选择，引用作为整体删除。PromptEditor 从textarea叠层迁到项目已用的 CodeMirror state/view/commands，复用依赖；MediaEditor焦点引用改HTMLElement，放大态焦点循环包含contenteditable。旧textarea值断言随新控件改为文档文本断言，并显式校验多行/剪贴板内容。
- prompt-editor-state 使用 replace Widget + atomicRanges、选区/事务过滤器扩大部分引用编辑范围，阻止光标落入tag内部；isolateHistory 将tag插入/删除/替换隔离为完整撤销步骤，避免快删合并掉插入历史。纯文本格式和原生成解析器不变。Widget只用textContent，粘贴走纯文本，不执行HTML。
- 原生selection坐标使用view.coordsAtPos(@起点)，requestMeasure分离测量与写入，处理文本/滚动/窗口变化；靠边时避让。Portal位于theme-root直属层，保留主题并避开编辑面板overflow；ARIA候选索引随键盘选中同步，候选保持输入焦点。ReferenceMedia导出供候选复用，Blob URL撤销、URL走现有mediaUrl桥接、视频静音、失败图标回退；没有新增网络/文件/原生能力。
- IME期间不执行选项快捷键，捕获 composing/229 按键仅停止传播到编辑器keymap，不阻止原生默认确认；compositionend恢复候选。测试曾发现合成确认被下一层keymap误当普通Enter，导致额外换行；已修复并通过合成事件回归，未宣称穷尽物理输入法/Windows实机。
- 最终 pnpm check、pnpm build、git diff --check、完整 **57/57**（1.7m）通过。新增状态事务单测及完整窗口用例，覆盖部分选区/双向删除、原子撤销、真实系统剪切粘贴、普通/放大与浅深菜单、mini媒体预览和菜单光标坐标，现有生成/引用协议与持久化用例继续通过。官方CodeMirror网页本轮403，API依据实际已装6.43.15类型/源码核对；没有为此新增包。
- Figma 更新旧菜单/tag主组件与4个内容槽，新增候选/内容族和7页示例，节点、截图、校验见design.md与figma-sync-2026-10-21/prompt-reference-tags-state.json。分支feature/prompt-reference-tags基于074890f继续；用户随后授权本地 commit，包含代码、测试及 Figma 同步记录，不推送、不合并、不发布。

## 生成节点折叠详情与 URL 复制（2026-10-21）

- 根据用户截图调整图像/视频共用 MediaEditor，新增 GenerationDetails 原生 details/summary 默认关闭，显示进度、错误、警告、未知状态，以及当前成功任务匹配 requestId 的 result.url；不展示失败/重跑时旧任务 URL。引用校验提示继续及时显示。长 URL 换行、详情限高180px滚动；放大面板焦点循环包含摘要及URL。
- 新增最小 generation:copy-result-url / desktop.generation.copyResultUrl(requestId)。主进程 UUID 校验，从 GenerationJobs 取 succeeded + resultUrl，再按 httpUrl 校验并写 clipboard；继承可信窗口校验，不接受 renderer 文本/URL，不暴露读剪贴板或通用剪贴板写入接口。前端复制锁避免重复，显示已复制/错误反馈。
- pnpm check、pnpm build、完整 Playwright **55/55**（1.6m）和 git diff --check 通过。增强现有生成用例验证图像与视频默认收起、键盘Enter展开、显示真实结果URL、系统剪贴板读回相同URL、收起和非法请求ID拒绝；原连接/失败可见性用例按新默认折叠更新操作，仍验证实际生成调用。未新增依赖，未修改协议或宣称修复截图中的上游HTTP402。
- Figma 更新4个原面板主组件和6状态共用详情，新增7页可编辑示例；设计校验与ID见 design.md 和 figma-sync-2026-10-21/generation-details-state.json。分支 `feature/node-generation-details` 基于已提交 `5ae71ae` 继续，用户随后授权本地 commit；不推送、不合并、不发布。

## Agent Skills 与 / 输入（2026-10-21）

- 用户要求输入框用 `/` 主动选择技能，也由 Agent 按技能规则主动调用；明确选择“Jarvis 独立管理，手动导入技能包”。已在 `feature/agent-skills` 实现，依赖上一轮 `e74a460` 画布 Agent；用户随后授权本地 commit，提交范围包含本轮代码、测试和设计记录；不推送、不合并、不发布。
- `SkillStore` 从原生文件夹选择器导入根目录含 SKILL.md 的包，复用 Pi 1.3.0 的 parseFrontmatter；校验 name/description/非空正文和 disable-model-invocation 布尔标记。将正文和包内文件字节复制到 userData/agent/skills.json，更新同名包保留 ID/启停，写成功后再发布元数据。最多100技能、每包100文件/2MB、单文件256KB，正文128k字符；拒绝符号链接，忽略隐藏目录和 node_modules，不递归扫描用户其他 Agent/Pi 目录。
- 新桥接只有 listSkills/importSkill/setSkillEnabled；文件夹路径来自主进程原生选择，不接受 renderer 提供任意路径，沿用 senderFrame/URL 校验。snapshot 仅给名称/描述/启停等元数据，不把包文件字节发送给 renderer。修改时要求无运行中请求。
- `skillRuntime` 向模型提供已启用且可自动调用技能的名称/触发描述，再通过 `load_skill` 加载正文；显式 `/skill:name 参数` 或 `/name 参数` 由服务端解析并注入完整说明。手动专用技能不进自动目录，模型直接调用也拒绝。`read_skill_resource` 仅允许本轮已加载技能包清单中的 UTF-8 文本（64k字符），拒绝路径穿越/外部文件/二进制，不运行脚本。每轮快照冻结，记录实际主动选择/自动匹配与参考读取活动。停用不擦除已有历史中的技能正文。
- Pi 的默认资源扫描仍 noSkills/noExtensions/noContextFiles；Jarvis 自管导入与指令注入，避免引入内置 read/bash 权限。openAgent 合并明确的技能工具和当前画布工具并核对 allowlist；有技能时允许8次模型请求与最多12次技能读取，首页无技能仍保持原来单请求/零工具行为。canvas 操作和视觉输入边界不变，skills allowed-tools 不扩权。
- 首页和画布共用 ChatComposer：开头输入 `/` 按名称/描述筛选启用技能，方向键循环，Enter/Tab 补全为 `/skill:name `，不立即发送；Esc/点击外部关闭，IME 确认与 Shift+Enter 保留。输入框下方书本图标打开原生 dialog 技能管理，支持导入/更新、启停和错误状态；保存前复选框即时反馈、失败恢复，弹窗内 Enter 不发送底层草稿。输入框继续固定底部。
- **最终验证**：pnpm check、pnpm build、git diff --check；完整 Electron + 本地模拟服务 **55/55**（1.6分钟）通过。新增导入存储2项、权限/真实Pi工具循环2项、真实窗口完整流程1项。覆盖手动专用拒绝自动读取、未加载参考/路径穿越拒绝、实际模型请求含完整技能/参考、未知/停用命令、同名更新、重启恢复、首页/画布与浅深色、弹窗防误发。没有新增依赖，真实中转站未验证。Figma 12状态页与组件、最后视觉检查见 design.md 及 agent-skills-state.json。
- 核对 [Agent Skills 格式](https://agentskills.io/specification) 和 [渐进加载规范](https://agentskills.io/client-implementation/adding-skills-support)，并读取仓库实际 Pi 1.3.0 的 skills.d.ts、frontmatter 和命令展开代码；实现采用独立导入快照与专用工具，不声称脚本执行/全文件访问已支持。

## 画布 Agent V1、项目会话与视觉输入（2026-10-21）

- 用户授权代码 + Figma 同步及本地 commit，追加会话新建/历史/重命名/删除，多选图片和视频抽帧。`feature/canvas-agent` 从已完成 Chat V2 `d60eece` 继续（依赖该提交，未直接改 main/develop），保留原工作；本轮不推送/合并/打标签/发布。
- `shared/canvas-agent.ts` 定义严格快照/操作/回执；快照不含 Blob/资源 URL。主进程只注册 get_canvas_summary/get_node_details/edit_canvas/focus_nodes 四项工具，无内置文件/Shell/扩展/Skills/MCP。先读概况与目标详情再编辑，每轮最多 20 次工具调用、8 次模型请求。首页仍无工具、仅文字输入，不读取个人 Pi 目录。
- `CanvasBroker` 按窗口 owner、项目、run 和一次性 claim 关联命令；15 秒回执超时。`use-canvas-host` 常驻当前 Canvas，与侧栏显隐解耦；校验项目/版本/过期/并发对象，严格批量验证后保存 IndexedDB，再回传成功。保存失败可恢复 UI；已 claim 的保存完成后停止，不把已保存变更假装回滚。回执超时后的已保存修改仍可通过画布最近修改记录撤销。
- `canvas-commands` 复用真实模型预设、连接类型/循环/数量限制和生成忙碌保护；仅创建图像/视频节点，编辑允许的提示词/参数/名称、移动、连接/断开、定位。没有节点删除、结果覆盖、自动生成。`canvas-transactions` 按 run 合并最多 20 轮撤销历史；只撤销最后且图未变化的一轮，冲突明确报错。变更详情来自真实前后图比较。
- `useAgent(projectId)` 隔离首页和项目历史，按项目记住会话选择；首次发送创建会话，新建空对话不立即写入。会话重命名复用现有端点；删除新增明确 UUID 端点，主进程先重命名该会话的一个 SDK JSONL、原子移除索引，失败恢复；完成后只 unlink 一个明确临时文件，不触及画布资产。沿用可信 senderFrame/URL 校验，不暴露通用文件/IPC。
- `canvas-vision` 通过已有媒体协议加载所选资产，匿名跨源图片/视频 Canvas 取像素；媒体协议启用 CORS 并返回允许头。图片编码 JPEG（长边 1536px）及128px历史预览；视频在10%/50%/90%取三帧并附来源/时间。失败/未知时长不发送，音频不支持。每次最多6资产/12图块/16000000 base64字符，每会话最多60图块。发送前核对节点仍存在且资源URL未变化；主进程核对附件与本次选中快照一致、格式头及总量。无任意文件读接口。
- Pi canvas runtime 声明 text+image，SDK prompt receives `{type:'image',data,mimeType}` 与 JSON 来源清单；会话索引只保存预览/来源，原图片由 SDK history 保存。请求幂等 hash 包含画布与图像内容，避免同 requestId 改附件。模型视觉能力需配置支持的中转模型，不能从模型名称自动保证。
- **验证通过**：`pnpm check`、`pnpm build`、`git diff --check`；完整 Playwright **50/50**（1.6分钟）。新增 pure commands/broker 3 项、Pi 工具运行 1 项、完整窗口画布交互 1 项、视觉窗口 1 项，Responses 原用例增加 image body 验证。图片/视频 fixture 为两个小文件，无新增依赖或运行时 ffmpeg。窗口覆盖读写/原子拒绝/撤销/冲突/停止/收起继续/项目隔离/重启、重命名/取消删除/实际删除单个 SDK JSONL、两图三帧实际请求/失败移除/历史预览。真实中转站、Windows 与打包运行未新增验证。
- 首次整套测试被沙箱 localhost listen EPERM / Electron 启动限制阻止，已在获准的沙箱外同命令重跑全通过，不是待修代码错误。截图证据：`apps/desktop/test-results/0e8c7409-f125-4c19-a466-b816b0576c7f/`。Figma 组件/23页面/原型与浅深截图验证详见 design.md 和 `figma-sync-2026-10-21/canvas-agent-v1-state.json`。

## Chat V2 对话与 Composer 实现（2026-10-21）

- 用户随后授权本地 commit，范围为本轮 Chat UI、受限复制接口、回归测试及同轮 Figma 设计记录；不推送、不合并、不发布。验证沿用本轮已通过的检查、构建和 44/44 回归，提交前再次检查 diff。
- 用户在 Figma 确认后授权改代码。fetch origin/develop 后确认本地 develop 无差异，创建 `feature/chat-ui-v2`，保留已有未提交设计记录；未提交、推送、打标签或发布。
- 展示拆为 ChatMessageItem、ChatActivity、ChatComposer、ContextUsage、ModelPicker；新聊天与历史对话共用底部固定 dock。消息无姓名，用户气泡 Hug/限宽，Agent 正文无气泡，底部复制/完成时间/Logo，运行时 1.2 秒透明度呼吸，减少动画时静止。
- Composer 14px/24px，默认一行，最多 384px（16 行），同时受 45vh 限制；ResizeObserver 处理宽度变化，文本内部滚动。移除底部提示，欢迎/建议在消息区。上下文仅真实聚合值，模型显示真实配置；附件/Auto 保留禁用语义，不接未授权工具。
- ChatMessage 增加可选 completedAt 与 activities（工具标签、文件路径/动作/增删数/统一 diff）。已完成回复在 finally 记录时间；旧消息无时间仍兼容。activities 为展示契约，当前 SDK 仍 tools: []，没有生产工具事件写入，也不会在普通 Chat 显示示例活动。Diff 按文本渲染、可折叠、滚动并解析 hunk 行号；不会读取文件或执行 HTML。
- 新增明确最小原生接口 `agent:copy-reply` / `desktop.agent.copyReply`。仅接受严格校验的会话/消息 UUID，主进程从现有记录复制非运行中 Assistant 正文；无通用写入文本/读取剪贴板接口，沿用 senderFrame 与 URL 信任校验。首次真实测试定位旧 navigator.clipboard 权限拒绝，未放宽 Electron permission handler，而是用上述接口修复。
- 验证：`pnpm check`、`pnpm build`、完整 Playwright **44/44**（约 1.4 分钟）和 `git diff --check` 通过。增强现有 Chat 用例覆盖底部位置、16 行与缩回单行、Shift+Enter/IME、真实剪贴板与拒绝复制用户消息、106.6k/1M/11% 格式、Esc、完成时间、历史持久化、活动记录 fixture/HTML 不执行/diff 行号、上滚时 SSE 不抢滚动、停止与 reduced-motion。未安装新依赖。
- 最终真实窗口截图：`apps/desktop/test-results/8e7f4cfb-0a2d-43af-9dd5-c7d7bb8d0201/agent-homepage-Chat-relay--0b3e4-secrets-theme-and-isolation/`，new-chat-bottom、composer-max-lines、chat-dark、chat-compact、chat-diff-dark 等已生成；新聊天、深色/紧凑及最终带行号 diff 已查看。没有打新安装包，未验证 Windows 实机或真实中转站。

## 0.1.6 双平台预发布完成（2026-10-21）

- 集成已通过 [PR #28](https://github.com/qianyuzhao-ai/Jarvis/pull/28) 合入 develop（`5c6b840`），再通过 [PR #29](https://github.com/qianyuzhao-ai/Jarvis/pull/29) 合入 main（`9526901`）。`v0.1.6` peeled SHA 已核对为 `9526901bf61c1af0f201f455aa4517fb26e2f0d3`，包含 Agent `83e053e` 和图标 `95e132f`。唯一标签运行 [39560464413](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39560464413) 的 macOS、Windows 和统一发布三个作业全部成功，未重试、重复触发或移动旧标签。
- 已回读 [v0.1.6 预发布](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.6)：非草稿、prerelease=true，发布时间 2026-10-21 07:20:13 UTC，三个安装文件均 uploaded。发布说明补入 Agent、图标和能力边界，保留 GitHub 自动生成的提交记录。
- GitHub API 资产摘要：macOS DMG 246202412 字节，SHA-256 `16688fcff07c2a84593a34e226e3a47ddef140727f69de4baa6eace22803895d`；macOS ZIP 245462424 字节，`62ebfa5845b7bbd7acec39128c8a448a8f5da2f62ecf982f754b29322fc33438`；Windows EXE 217234741 字节，`b51ed6f9b31d3be73055795162e18bac163c0aac4c891ea96805f91affbcd8c4`。未重复下载大文件；云端执行版本、架构、DMG/ZIP 完整性及 Windows 未签名校验，不代表 Windows 功能实机验收。
- GitHub 连接器创建 PR 返回 403，CLI 核对没有重复 PR 后完成创建和合并。发布结果在独立 `feature/release-0.1.6-notes` 文档分支记录，不改已发布代码、不重打标签或重新构建。

- 用户授权打包发布 0.1.6，明确包含 Agent、App Icon 和其余待发布改动；授权本次版本准备、提交/推送、PR 合并、版本标签和发布。起点为干净的 `feature/pi-agent-chat` `83e053e`，包含独立图标提交 `95e132f`；已 fetch 核对远端，v0.1.6 标签与 Release 不存在，没有开放 PR。
- 根包、桌面包及 README 统一为 0.1.6，CHANGELOG 汇总 Pi Chat/中转配置、密钥保护、图标及设计/测试记录。沿用 develop → main PR → main 合并提交标签的发布规则，不移动旧标签，不删除历史分支；目标是唯一标签工作流双平台全部成功后统一未签名预发布。
- Agent 功能代码在本次版本准备前已通过完整44项回归及打包版 Chat 1/1；版本准备另验版本一致性、检查、构建和 diff。真实中转站、Windows 实机及签名/公证仍不作为已验证结果。

## Pi Chat 本地提交（2026-10-21）

- 用户授权 `commit`，范围为本轮 Agent 代码、测试、依赖和相关设计/工程记忆，不推送、不发布。核对图标已单独提交 `95e132f` 后，将原 `feature/pi-agent-chat` 从 develop 基线快进到该已完成提交并切回，保持图标提交和分支不变，再独立记录 Agent 变更。
- 代码验证沿用上一轮检查/构建、44项完整回归和最终包 Chat 1/1；提交前重新核对暂存内容与 diff。后续状态以该分支 Git 提交记录为准。

## Pi 首页 Chat V1 基础实现（2026-10-21）

- 用户明确“开始 coding”，按已确认范围实现首页文字 Chat 与中转站模型配置，不接写作/创作空间 Agent、官方登录、文件/Shell/生成工具。使用 `@earendil-works/pi-coding-agent` / `pi-ai` **1.3.0**，按实际安装导出使用 ModelRuntime、InMemoryCredentialStore、SessionManager；并非旧示例 AuthStorage 导出。
- 开始时 fetch 核对 develop 与 origin/develop 无差异，从 `c7aed14a96a1432ced8d42936f39727475e9fc7b` 创建 `feature/pi-agent-chat`，保留此前未提交设计记忆。开发期间共享 checkout 被图标任务切到 `feature/app-icon`，并出现 resources、electron-builder 和主进程图标改动；未回切、重置或覆盖，本轮 Agent 改动未提交/推送/发布。后续 Git 操作先重新检查共享状态。
- 主进程 `main/agent/` 包含配置、原子串行 JSON 存储、SDK 运行、会话/运行和固定 IPC；共享契约 `shared/agent.ts`，preload 仅暴露 `desktop.agent`。校验可信窗口主 frame、输入 schema、UUID 会话和去重 ID，不开放通用 IPC/文件/Shell。SDK 使用独立 userData/agent 目录、内存认证；禁用扩展/Skill/模板/上下文扫描，显式空工具且校验活动工具为空。仅使用配置的中转模型，单轮只进行一个模型请求，禁用重试/自动压缩。
- 支持中转站 Chat Completions / Responses SSE；当前只传文字。Key 通过系统 safeStorage 加密到 `agent/connection.json`，读取接口只返回 hasKey；拒绝不可用/弱降级存储。更换地址须重新输入 Key 或显式清除；HTTP 重定向拒绝，空 Key 不发送 Authorization。上游错误先在流边界脱敏再交 SDK 保存，验证恶意错误回显 Key 不进入 SDK JSONL。
- `agent/index.json` 保存会话投影、配置快照和请求账本；`agent/sessions/<UUID>.jsonl` 保存 SDK 完整历史，workspace 仅是独立运行目录。一个应用最多一个回复；发送先持久化意图，requestId 去重。停止、120 秒超时、断流保留部分输出；运行中每秒检查点，正常关闭取消并等待写盘；遗留运行重启标中断，不重发。连接测试用临时会话，与保存分离；无模型列表时手动填写。
- 默认打开 Chat。完整 Composer 保留附件/权限/思考/语音视觉，未实现项禁用或明确提示；可选模型 ID，未知容量/未返回用量显示未知。上下文数值仅采用上次成功上游 usage，不将 SDK 估算当实测。支持左右气泡、回到最新、接近底部时跟随、复制、手动重发、重命名与历史切换；IME 组词确认不发送。设置表单有脏值离开确认；画布/写作仍沿用现有入口和保存链路。
- 为默认首页变化，旧回归显式进入创作空间（包括刷新后）；未修改原功能行为来适应测试。新增 5 项测试覆盖两协议正常/缺结束帧、中文/emoji 分块、取消、无工具、重定向、错误脱敏、运行恢复，以及真实窗口配置→测试→保存→聊天→停止→重命名→重启继续上下文与加密文件检查。
- **验证**：`pnpm check`、`pnpm build`、`git diff --check` 通过；完整 **44/44** 同轮通过（约 1.4 分钟）。此前一次 43/44 的旧设置确认框超时，目标复测通过后完整重跑通过，未作为环境常驻限制。最后仅将 hook 文件改为 kebab-case 与隐藏模型页无关画布保存提示，检查/构建及最终目录包 Chat **1/1** 再通过（约 9 秒）。
- 最终本地包：`release/a94f56ae-c028-4531-9a9b-85caad4b52b6/mac-arm64/Jarvis.app`，另保留前一验证包 `release/89c4fa52-c7b0-40fe-a7e3-efdda0485fa9/`。最终包含共享图标工作区内容；仍为未签名/未公证目录包，无 Release。electron-builder 对未使用 SDK 服务商依赖给出收集警告，当前中转站完整流程已在包内验证，不据此声称所有 Pi 服务商均可用。
- 最终打包窗口截图位于 `apps/desktop/test-results/b8ae053c-50fa-4745-971c-53cd30f2859b/agent-homepage-Chat-relay--0b3e4-secrets-theme-and-isolation/`；开发完整回归的浅深配置/聊天截图在 `33ab1f00-9297-4d7f-aaf9-e27c913dbb15` 对应目录，已查看深色与紧凑/设置截图。
- **限制**：真实中转站/真实 Key 未提供，网络验证使用本地 mock；Windows 未运行本轮实机测试。回复按纯文本呈现；长对话超过 60,000 字符本地保护上限须新建，不自动摘要/裁剪，不提供删除接口。API 协议、模型与容量需按实际服务配置；macOS 未签名包的钥匙串跨版本体验未验证。
- 已将当前实现、验证与限制同步原 [Agent方案](https://docs.google.com/document/d/1vhqRZOgR2JJ22RINUgMvDaAqsQEkbBxa2FvaJt3K1yc)，保留研究与设计内容；四段状态修订和新增实现摘要均已回读比对。

## 应用图标接入（2026-10-21）

- 挂载图标验证追加：基础配置显式指定 `dmg.icon: resources/icon.icns`，沿用已有透明 ICNS；用户明确 `.dmg` 文件保持系统默认图标，没有加入文件图标后处理。使用前轮未签名目录包创建 `/tmp/jarvis-dmg-icon-check/Jarvis-0.1.8-arm64.dmg`，只读挂载 `Jarvis Icon Check` 后确认 `.VolumeIcon.icns` 与源码字节一致，并已卸载测试卷；本轮首试因沙箱 hdiutil 设备权限失败，沙箱外通过。用户随后授权本地提交；不涉及正式签名、公证、推送或发布。
- **透明背景修复（同日追加）**：按用户截图移除旧图标的方形灰白外底。新增原 Figma `192:12530` 导出的 `resources/icon.svg`，保留圆角形状与紫蓝图案；通过 Electron Chromium 透明渲染并转换为 `icon.png`、`icon.ico`、`icon.icns`。PNG 1024px、ICO 16/24/32/48/64/128/256px 和 ICNS 全部表示的四角 alpha=0；现有 mac/win/运行时配置继续引用同名资源。`pnpm check`、构建与 diff 检查通过；用户随后授权本轮本地提交，不推送或发布，Windows 实机未验证。
- 透明背景修复的 macOS arm64 未签名目录包验证通过：`release/0f51fe49-d1d3-42bb-bbf6-5cdc6de91f4f/mac-arm64/Jarvis.app`，Info.plist 引用 `icon.icns`，包内 PNG/ICNS 与源码字节相同。首轮因沙箱 DNS 无法下载 Electron 失败，联网重试成功；没有签名、公证或发布，不代表 Windows 或系统 Dock/桌面显示已验收。
- 首次接入历史：从用户指定 Figma `192:12530` 导出 1024 × 1024 PNG，资源位于 `apps/desktop/resources/icon.png` / `icon.icns` / `icon.ico`；ICNS 与 ICO 使用 Pillow 从原图转换，运行和构建不增加依赖。
- `electron-builder.yml` 配置 mac/win 图标及 PNG extraResources，发布配置继承基础配置。主进程窗口使用开发资源或 `process.resourcesPath/icon.png`，开发 macOS Dock 单独设置，正式 macOS bundle 使用 ICNS。
- 从 develop 建立 `feature/app-icon`，保留原有 Agent 未提交改动；用户授权本轮仅提交图标相关改动；未推送或发布。`pnpm check`、构建与本地 macOS arm64 目录打包通过。产物 `release/218937ad-9c02-4af8-b96a-9e165f38dd9a/mac-arm64/Jarvis.app` 的 Info.plist 图标引用和两份图标资源字节验证通过，仍为未签名包。
- 首次沙箱打包因下载 Electron DNS 受限失败，沙箱外重试成功；窗口测试沙箱内无法启动，沙箱外首轮超时，独立重跑窗口导航与隔离回归 1/1 通过（1.4 秒）。打包发现既有 Agent 依赖收集警告，未扩展到依赖修复，不声称完成打包后 Agent 验收。

## Composer 组件纠正与深色侧栏（2026-10-21）

- 按用户截图统一回完整 `Jarvis / Agent Composer` `121:4438`，13 处实例替换，移除简化组件集 `177:7986`；附件/权限/思考强度/语音保留视觉，不等于授权接入这些能力。
- 修复侧栏原生默认/选中行与现有历史标题的固定黑色填充，绑定主题文字并恢复正常混合模式；深色和 900×640 稿截图验证通过。详情、ID 和用户最新要求见 design.md 顶部；无应用源码、依赖、构建或测试变更。

## Pi V1 范围确认与设计完成（2026-10-21）

- 用户最新明确先完善设计，首期仅首页文字 Chat、左右气泡和 SSE；只接中转站 API，官方 API、写作/创作空间 Agent 暂不处理。此前跨空间建议不再作为首期任务。
- Figma 首页/气泡/流式状态与中转站模型设置已完善，含浅深、等待/停止/中断、未配置、测试/保存、模型与协议菜单及紧凑窗口；当前 IDs、截图验证和边界见 design.md 顶部与 `memory/figma-sync-2026-10-21/agent-v1-state.json`。
- [Agent方案](https://docs.google.com/document/d/1vhqRZOgR2JJ22RINUgMvDaAqsQEkbBxa2FvaJt3K1yc) 已原位修订范围并全文匹配回读：后续写作/画布仅作参考，不进入 V1 代码改点/验收；保留 SDK 受限嵌入建议。SSE 在上游消费，经受限 preload 事件传 UI；Figma 不发送真实请求。
- 本轮只更新 Figma、方案和仓库记忆/设计脚本，未修改应用源码、安装依赖、提交或发布，未运行应用检查/构建。真实 SDK、SSE、目标中转站和模型兼容性仍需实现阶段验证。

## Pi Agent 接入研究方案（2026-10-21，待审阅）

- 用户仅授权查本地记忆、研究 Pi，并将方案写入指定 [Agent方案](https://docs.google.com/document/d/1vhqRZOgR2JJ22RINUgMvDaAqsQEkbBxa2FvaJt3K1yc)，要求 check 后再实现。本轮未改应用实现、安装依赖、提交或发布。
- 已核对当前 Jarvis 0.1.5：无 Pi 依赖、Agent 路由/会话与模型服务配置；写作助手仍占位。现有内网上传/生成协议不是聊天模型服务，不可混用；真实内网联调仍未确认。
- 旧全局记忆只记录 AIGC-FLOW 的只读助手规划；本轮检查其当前源码发现已有 pi-coding-agent/pi-ai 1.3.0、会话、运行恢复、画布读写/生成及 Skill 管理。该结论仅来自静态读取，未运行验证，不代表 Jarvis 已实现。
- 当前建议（未确认）：受限嵌入 Pi Coding Agent SDK，由主进程管理模型/密钥/会话，显式关闭默认工具和自动资源扫描；preload 固定接口。先首页对话和会话恢复，再写作/画布只读助手；写操作、生成、MCP、Skill、语音另行评审。完整 SDK 与 core 自建会话的取舍、首期范围、会话粒度和目标模型保留待审阅。
- Google 文档保留原有内容并追加 12 节方案，已逐段回读比对全文和标题结构。官方资料已读取；npm 版本、SDK/Electron 打包、认证注入与真实模型兼容性尚未实测。方案不等于实施验收。

## 0.1.5 发布集成（2026-10-21）

- 用户明确授权 0.1.5 并要求所有改动纳入本版，覆盖写作空间、此前独立的三项画布修复、设计/工程记忆及 Figma 续传脚本；对话参考图片保留本地并加入 .gitignore，不作为应用源码发布。
- 写作空间提交 `9d8f8c8`；本轮已将 `feature/reference-preview-fix` 的 65c33e2 / ed13812 / 8814a0e 非快进合入当前功能分支。合并仅在设计/工程记忆冲突，保留已包含修复记录及较新 Figma 状态的完整文件；代码无冲突。
- 根包、桌面包和 README 升至 0.1.5，CHANGELOG 汇总实际功能与未签名/基础编辑边界。版本校验、检查、构建、git diff --check 与最终集成 39/39 项真实 Electron 回归同轮通过，约 1.2 分钟。
- 已经 [PR #25](https://github.com/qianyuzhao-ai/Jarvis/pull/25) 合入 develop (`7506c2b`)、[PR #26](https://github.com/qianyuzhao-ai/Jarvis/pull/26) 合入 main (`1f3be23`)；`v0.1.5` 已创建并核对远端 peeled SHA 为 `1f3be230fd2c147868d9501ca763d3c1d006b9af`。未移动旧标签。
- 唯一发布运行：[39548892511](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39548892511)，由标签 push 触发。macOS、Windows 和统一发布三个作业均成功，未重试或重建；已回读 [v0.1.5 预发布](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.5)，非草稿、prerelease=true，三个文件状态均 uploaded。GitHub 连接器创建 PR 返回 403，先用 CLI 核对无同名 PR 后改用已登录的 CLI 完成；没有重复创建或重复触发构建。
- Release 三个文件：DMG 229488251 字节（SHA-256 02ff0bd5264cdb2efbead064eafd3ed983179819c342692b59b440e57c0b0f1e）、ZIP 229535150 字节（209a7c70dbc3d0de9f74507ddcf9144d7e1e7cccf6f8650f37480f8b42612dd2）、Windows EXE 205496351 字节（4a0bbc836932416710e85f71dba988cbe282cc87b278c7126631399275352f4f）。摘要来自 GitHub Release API，未重复下载大文件。仍为未签名/未公证包；Windows 运行功能由用户验收。
- 已核对发布标签包含此前独立修复分支的全部提交，发布代码与 develop 无差异。本地 main/develop 均已快进到对应远端；发布结果记录另走文档 PR 更新 develop，不改已发布标签或重复发包。

## 写作空间基础版（2026-10-21）

- 用户授权先将实现方案写入指定 Google 文档，再开始基础功能开发。方案与基础版完成记录均已通过 Google Docs 连接器原位写入并回读确认：[写作空间实现方案](https://docs.google.com/document/d/1w5ipoZlR4-9uYy8kAjLkDB46kuU_2VJYmbIfefZ-FS4)。
- 当前功能分支 `feature/writing-space` 从本地 `develop` 的 `342dde0` 建立，尚未提交、推送或合并。原 `feature/reference-preview-fix` 的三个提交（65c33e2 / ed13812 / 8814a0e）保留在原分支，不声称已合入本功能分支。切换前将三份未提交设计/工程记忆备份并 stash，切换后完整恢复；`stash@{0}` 的 `preserve design notes before writing-space branch` 仍保留为安全副本。用户附件与既有 canvas-ui-scripts.json 未清理。
- 新增主进程 `src/main/writing/files.ts` / `bridge.ts`、共享 `src/shared/writing.ts`、受限 preload `desktop.writing`。支持选择/记住目录、按层列目录、文件名搜索、Markdown 读取/保存、新建文件/文件夹；不暴露通用文件/Shell/IPC。主进程验证可信窗口、已登记 root ID、相对路径与符号链接，拒绝越界与非 Markdown 读写。同名新建使用 wx，不覆盖；无递归或批量删除接口。
- 每份文档按路径串行保存，使用 SHA-256 磁盘版本基线、写临时文件后再校验/替换；保留 UTF-8 BOM 和 CRLF，拒绝大于 4 MiB 的编辑文档，检查原文件可写。冲突返回 CONFLICT，前端保留本地缓冲区并提供重新读取/另存副本；未保存内容不能直接关标签、切换目录或离开写作空间。版本检查不是与外部编辑器共享的事务锁，不宣称完全消除其他软件并发写入的最后时间窗口。
- 新增 renderer `features/writing`，复用现有主题/Lucide/IconButton；App 增加 writing 路由并懒加载 CodeMirror。左侧目录下拉、文件树、搜索按需展开、新建对话框、刷新文件列表；中间多文档标签/源码模式/基础实时预览；右侧语法树大纲与定位、写作助手占位。左右栏独立收起/展开、宽度拖动/键盘调整和焦点恢复，左侧隐藏后为 macOS 原生窗口控制预留顶部空间。
- 编辑器使用 CodeMirror state/view/commands/language/lang-markdown 与 Lezer 类型。标题、强调、引用和代码样式通过 Decoration 呈现，当前编辑行露出语法；未将 Markdown 转存为 HTML。每份打开文档保留 EditorState、撤销与滚动状态，切换标签不重置。最近目录由 userData/writing-roots.json 管理；布局与打开标签在独立 jarvis:writing-* localStorage 键中保存，不改创作画布数据库。
- 基础外部变更检测：当前打开文档 2.5 秒轮询 + 窗口 focus；有本地更改时提示冲突，无本地更改时重读。保存仍单独校验磁盘基线，不依赖轮询。目录树通过更多菜单手动刷新。未安装 Chokidar，系统级监听留待下一阶段。
- 验证：`pnpm check`、`pnpm build`、`git diff --check` 通过；完整真实 Electron 回归 **38/38** 同轮通过（约 1.1 分钟），包含 4 项新增写作回归。最后仅精简选中背景过渡和窗口拖动区后，再跑检查/构建及写作 **4/4** 通过。新增回归验证真实读写、新建/搜索、重启标签恢复、撤销切换、越界/未授权/符号链接/同名拒绝、BOM/CRLF、自动保存、外部刷新、冲突另存副本、侧栏/主题/最小窗口。沙箱内 Electron 无法启动，随后经审批在沙箱外成功验证；不保留为当前阻塞。
- 最终浅深截图在 `apps/desktop/test-results/9aec6d76-8533-415f-b24a-6484cb47c1e7/` 的写作测试目录中，已检查。验证使用独立测试目录和用户 profile，未替用户选定实际笔记目录。测试在 macOS 执行，不宣称 Windows 已运行验证；输入中文文本已覆盖，不等于真实输入法候选组词过程已人工验收。
- 边界：AI 仍占位；完整图片/表格/任务框渲染、全文搜索、OS 文件监听、崩溃恢复草稿、跨重启撤销历史和高级冲突合并均未实现。基础实时预览不是完整 Obsidian 替代；本轮未扩展首页 Agent 或全局用户名等其他设计方案。

## 本轮 UI 同步 Figma 完成（2026-10-21）

- 用户授权把本轮对话涉及的 UI 样式同步到现有 Jarvis 文件；只更新 Figma 与项目记忆，应用代码及 Git 提交不变，未推送。
- 原位更新媒体/上传资源主组件和六种编辑面板，新增本地标签、候选菜单、名称编辑、引用预览、多选工具栏组件；更新既有浅深画布，新增浅深完整状态稿。组件/页面 ID 与截图验证见 `memory/design.md` 顶部，执行结果见现有同步状态文件的 `canvasUiSync`。
- 本轮 Figma 连接正常，所有写入返回明确 ID。首轮视觉校验发现并修复容器裁切、菜单层级和选中底色层级问题；最终截图通过，浅深完整状态稿均为 Noto Sans SC 可编辑文字/矢量/组件，无整页截图填充。未重跑应用检查/构建/窗口测试，因为应用源码无变更；记忆 JSON、保存脚本语法和 `git diff --check` 单独校验。

## 多选下载按钮精简（2026-10-21）

- 在 `feature/reference-preview-fix` 的 `ed13812` 后继续用户截图要求：下载按钮内容缩为图标 + 可下载数量，保留完整 aria-label/title、禁用与忙碌状态，不改变批量下载流程。
- 检查、构建、`git diff --check` 通过；相关真实 Electron 回归 1/1 通过，验证可见内容仅数字、一个图标、悬停提示和实际批量下载。截图检查通过，未运行全量套件；用户随后授权本轮本地提交，未推送，未修改 Figma。

## 生成占位与默认名称（2026-10-21）

- 在 `feature/reference-preview-fix` 的 `65c33e2` 后继续用户新要求；用户随后授权本轮改动本地提交，未推送；保留既有 Figma 文档和状态改动。
- `MediaPlaceholder` 使用现有 `generationBusy`，上传/提交/运行阶段以中心加载图标和“正在生成…”替换空态/旧预览，并暂时隐藏旧结果的单节点下载入口；成功不显示角标，失败/未知保留异常反馈。名称全程显示，端口与选中框不变。
- `createMedia` 保存“图像生成”/“视频生成”默认名；`mediaName` 为历史缺失名提供相同默认值，组件、引用候选、单个与批量下载统一调用，不改自定义名。旧数据仍由可选 `name` schema 兼容，未扩大原生接口。
- 生成窗口回归的扩展用例曾因重叠节点中心被遮挡而超时；执行轨迹定位后，测试改点可见区域，完整生成流程通过，不修改应用来绕过测试。浅深占位截图与减少动态效果检查通过，默认名称/旧项目下载和改名回归通过；检查、构建及 `git diff --check` 通过，完整真实 Electron 回归 35/35 同轮通过。

## 节点名称编辑与选中边界增强（2026-10-21）

- 在现有 `feature/reference-preview-fix` 继续完成用户后续画布要求，保留上一轮及既有 Figma 状态修改；用户随后授权将两轮画布改动本地提交到当前分支，未推送。
- `NodeName.tsx` 与最小 `NodeRenameContext` 将上传资源和生成节点的改名写回现有项目更新路径，不把回调存进持久化节点数据。生成节点 schema 新增可选 `name`，兼容旧项目；上传/生成状态更新沿用数据展开，保留新名称。
- 单个与批量下载传入当前节点名；主进程仅解码从 URL 获取的默认名，用户名称中的 `%20` 不解码；只移除已知媒体后缀，保留 `.v2` 等名称内容，最终扩展名仍以响应媒体类型为准。引用候选与缩略图名称同步更新，实际请求账本保持原始快照。
- 选中媒体框由 2px 增强至 3px 外描边、画布底色隔离环与完整节点底色；不改节点实际尺寸、端口或连线高亮范围。
- `pnpm check`、`pnpm build`、`git diff --check` 和完整真实 Electron 回归 35/35 同轮通过；增强已有下载与批量下载测试，验证改名/取消/空值、编辑键盘不误删、重新打开项目恢复名称、四类节点真实下载命名及字节。浅深截图通过，Figma 未修改。

## 编辑面板引用预览修复（2026-10-21）

- 从 develop 创建 `feature/reference-preview-fix`，保留任务开始前已有的设计/Figma 状态修改；用户随后授权与节点改名及选中边界改动一起本地提交，未推送。
- 候选编号原会被长文件名挤压换行，现禁止编号压缩，文件名 `min-width: 0` 并单行省略。`PromptMention` 补充媒体类型和 Blob/URL，普通面板预览与候选共享引用顺序、去重和直接上游资源来源；取消普通面板上传按钮，保留放大面板原有素材管理。
- 连线 URL 缩略图使用已有最小 `generation.mediaUrl` 桥接映射至 `jarvis-media`，不修改 CSP、sandbox 或 contextIsolation。媒体映射异步响应在卸载时取消更新，Blob 预览释放 Object URL。
- `pnpm check`、`pnpm build`、`git diff --check` 通过；完整 Electron 回归 35/35 同轮通过，包含新增长文件名与连线缩略图验证。沙箱内 Electron 无法启动后，获准在沙箱外验证成功；浅深截图检查通过。未修改 Figma。

## v0.1.4 双平台预发布完成（2026-10-21）

- 用户授权发布且确认包含画布三项修复。PR #17→develop、#18→main 完成集成，受保护标签 `v0.1.4` 始终指向 `2aed851`；后续仅工作流与记录修复经 PR #19/#20、#21/#22 集成，没有移动标签或修改该版本应用源码。
- 首轮 `39526365544` 因 Windows CRLF 检出失败，随后取消剩余作业；首次重试 `39526651851` 的 Windows NSIS 已生成，但版本字符串比较失败。第二次重试 [39527698231](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39527698231) 的两个打包作业、架构/版本/签名状态校验及 Artifact 上传全部成功，唯一发布作业因 Artifact 子目录路径错误失败。以上为新增流程适配问题，不归因于用户功能代码。
- 下载同次成功构建的两个 Artifact，核对真实版本子目录，额外运行 DMG 与 ZIP 完整性检查，通过后使用原始三个文件创建 [v0.1.4 GitHub 预发布](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.4)。已回读确认非草稿、预发布、三个文件状态均 uploaded：DMG 228342295 字节、ZIP 228388327 字节、Windows EXE 204859637 字节。Windows EXE SHA-256：`f72e94e9677b3af768081cad3ecad232eeadebc3f7f1497342c2d9a6663ab50d`。
- 全部为未签名测试包，Mac 未公证；Windows 功能仍由用户验收。完整本地窗口回归 34/34 通过。后续自动发布路径修复在 PR #23，不能把本次手动完成上传称为自动发布作业成功。

## v0.1.4 发布产物路径修复（2026-10-21）

- 第二次重试 `39527698231` 的 macOS arm64、Windows x64 两个作业全部成功，包括产物校验和上传；统一发布作业因预期产物在顶层而失败。实际 Artifact 保留 `github-0.1.4/` 子目录，已下载并核对。
- 工作流发布文件路径改为 `release-assets/github-${version}/...`。本轮直接使用同次成功构建的三个 Artifact 完成 v0.1.4 预发布，不再次构建，不移动标签；最终结果见顶部完成记录。

## v0.1.4 Windows 版本校验修复（2026-10-21）

- 第一次重试 `39526651851` 的 Windows 检查、构建与 NSIS 打包成功，但后续版本校验将 FileVersion 与固定的四段 `$version.0` 比较而失败。当前 electron-builder 的 fileVersion 使用 appInfo.buildVersion（本项目为三段 0.1.4），不是固定四段字符串。
- 校验改用 FileMajorPart/FileMinorPart/FileBuildPart 比较 0.1.4，同时输出 FileVersion/ProductVersion 诊断；保留 x64 架构及未签名检查。仅调整工作流，不修改应用源码或 v0.1.4 标签。修正后继续手动重试原标签。

## v0.1.4 Windows 检出换行修复（2026-10-21）

- PR #17 合入 develop（`8b3106d`），PR #18 合入 main（`2aed851`），`v0.1.4` 指向 main 合并提交。唯一标签运行 `39526365544` 的 Windows 作业在 Biome 检查失败：Windows Git 默认将 LF 检出为 CRLF，产生 68 个格式错误，尚未构建安装包。
- 修复在 Windows checkout 前设置 `core.autocrlf=false`，按仓库存储的 LF 检出；不改应用源码、不移动标签。流程修正进入 main 后通过 workflow_dispatch 输入原 v0.1.4 重试。

## v0.1.4 发布准备（2026-10-21）

- 用户授权提交当前改动、PR 合入 develop 并发布 v0.1.4，随后明确包含全部 3 个画布修复。Windows 打包提交 `da696b1` 与画布分支通过 `f2c625e` 集成，PR #17 指向 develop。根包、桌面包、README 和版本记录统一为 0.1.4。
- 发布源码 `pnpm check`、构建、版本校验、`git diff --check` 通过；完整真实 Electron 窗口回归 34/34 同轮通过。云端双平台打包和 Release 结果待标签触发后核验，Windows 功能由用户验收。

## 双平台未签名标签打包（2026-10-21）

- 用户授权增加 Windows x64 安装包，与 macOS 一起通过版本标签构建并发布同一 Release；Windows 功能由用户自行验收。本轮从干净 develop 创建 `feature/windows-release`；用户确认 v0.1.4 一起包含画布修复，已将 `feature/node-marquee-selection` 的三个提交合入此分支。
- `electron-builder.release.yml` 新增 Windows x64 NSIS 目标，禁用签名但保留版本等资源编辑；安装器按当前用户安装、可选目录，文件名 `Jarvis-${version}-windows-x64-unsigned-setup.exe`。原 Mac arm64 DMG/ZIP 保留。
- 保留 `.github/workflows/release-macos.yml` 文件路径，名称更新为 Package macOS and Windows；matrix 使用 macos-15-intel 与 windows-2022，各自检查/构建/打包，fail-fast=false。Windows 校验 PE x64、版本与未签名状态；平台 Artifact 汇总到依赖全部构建成功的唯一 publish 作业，三个文件齐全才创建同一预发布 Release。构建作业仅 contents:read，发布作业 contents:write。
- 标签及已有标签手动重试继续可用；同 run 重跑允许替换本次 Artifact，已有 Release 不覆盖。首次双平台发版需使用包含新配置的新标签，不能用旧标签凭空补出 Windows 配置。
- 本地 `pnpm check`、`pnpm build`、electron-builder 配置 schema、工作流 YAML/触发条件/依赖/唯一发布校验及 Bash 语法检查通过。用模拟 gh 执行实际发布脚本，验证缺少产物阻止发布、已有 Release 阻止覆盖、三个产物齐全时只调用一次预发布。本机为 macOS，未执行 Windows 打包或 PowerShell 校验，GitHub 双平台流程尚未运行；用户随后授权提交并通过 develop→main PR 发布 v0.1.4，发布结果待后续记录。

## 高亮限定直接上下游（2026-10-21）

- 用户明确不包含下游的下游；`relatedWorkflow` 改为仅匹配当前节点为 source 或 target 的边，不再递归追踪上游或下游。保留只高亮连线、实际选中节点描边的行为。
- `pnpm check`、`pnpm build` 和 `git diff --check` 通过；直接邻接逻辑测试与真实 Electron 连线测试 2 项同轮通过。用户随后授权提交到当前分支，未推送。

## 上下游仅连线高亮（2026-10-21）

- 在 `feature/node-marquee-selection` 继续调整：移除 Canvas 的关联节点 class 和对应 CSS 描边，保留连线高亮以及真实选中节点的 2px 描边。
- `pnpm check`、`pnpm build`、`git diff --check` 通过；3 项相关 Electron 窗口回归同轮通过，覆盖关联节点不描边、连线蚂蚁动画、节点选中样式和半面积框选。用户随后授权将此后续改动提交到当前分支，未推送。

## 节点半面积框选修复（2026-10-21）

- 从干净 develop 创建 `feature/node-marquee-selection`。`Canvas.tsx` 订阅 React Flow 的框选矩形，转换为画布坐标后，以节点实测面积覆盖率至少 50% 判定选中；框选期间忽略库默认的节点/边选择变化，避免关联连线选择清空节点。库会先原地修改候选节点的 selected，因此每次矩形更新都重应用受控选择，即使命中 ID 不变。
- 保留普通点击、Shift/Cmd/Ctrl 加选、单独选线删除、批量连线及下载。新窗口回归覆盖 49% 不选、50%/100% 选中、正反向、有连线节点和只框线；测试先将画布平移离开边缘，避免自动平移使固定测试坐标失效。
- `pnpm check`、`pnpm build`、`git diff --check` 通过；`connections.spec.ts` 相关 10 项回归同轮通过。首次沙箱内 Electron 无法启动，获准在沙箱外运行后验证成功。本轮未运行全量窗口套件；用户随后授权在该修复分支本地提交，未推送。

## v0.1.3 未签名 Apple Silicon 预发布完成（2026-10-21）

- `v0.1.3` 保持指向 main 合并提交 `9c575c0`，没有修改受保护标签。用户授权的后续流程修正通过 PR #11→develop、#12→main，将云端作业聚焦检查/构建/打包；第一次手动重试 [39482146051](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39482146051) 因 GitHub macOS arm64 runner 容量不足零步骤失败。再经 PR #13→develop、#14→main 将宿主改为 `macos-15-intel`，仍显式构建 arm64。
- 第二次手动重试 [39484879567](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39484879567) 全部步骤成功：版本和 main 祖先校验、`pnpm check`、一次 `pnpm build`、未签名 arm64 DMG/ZIP、`lipo` 架构、Info.plist 版本、`hdiutil verify`、`unzip -tqq`、Artifact 上传和 GitHub Release 创建均通过。
- [GitHub v0.1.3 预发布](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.3) 已回读确认非草稿、预发布，包含 `Jarvis-0.1.3-macos-arm64-unsigned.dmg`（228341137 字节）和 `.zip`（228387966 字节）。这是未签名/未公证包；尚未在 M 芯片机器上对**从 GitHub 下载的交叉构建产物**完成安装启动、Gatekeeper 或跨版本升级验证，不宣称生产可用。下方各节的“无 Release”仅代表当时试验状态，由本节当前结果取代。

## Intel macOS runner 构建 arm64 产物（2026-10-21）

- `v0.1.3` 在 main 更新后的手动重试 [39482146051](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39482146051) 排队约 15 分钟后未获 runner，零步骤执行即失败；check-run 注释明确为 “The job was not acquired by Runner of type hosted even after multiple attempts”，并提示 macOS arm64 runner 容量约束。没有 DMG/ZIP 或 GitHub Release，不能将失败归因于代码。
- 为保留用户要求的 M 芯片专用产物，本轮将唯一标签作业的宿主改为 GitHub `macos-15-intel`，electron-builder 仍显式 `--arm64`，并在上传前核对 `lipo` arm64、Info.plist 版本、DMG 校验和 ZIP 完整性。官方说明跨架构可行但原生同架构更可靠；此方案需以实际远端运行和 Apple Silicon 本机验收为准。`v0.1.3` 标签不移动，改动经 develop→main 后再手动输入原标签重试。

## 标签打包与窗口测试分离（2026-10-21）

- `v0.1.3` 唯一云端运行 [39480138082](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39480138082) 在窗口测试阶段失败，31/33 通过，打包与 GitHub Release 未执行。已下载并读取失败现场 Artifact：连线测试固定点超出 runner 视口，改成另一固定点后又被已打开的编辑面板拦截；侧栏测试在动画中强制点移动中的按钮，未实际触发展开。两者是测试交互对宿主环境的错误假设，尚无证据表明对应产品行为失败。
- 本轮修正连线测试为通过 `elementFromPoint` 寻找实际可见画布空白点，侧栏测试通过已聚焦按钮的 Enter 反向操作；两项真实 Electron 测试同轮通过。为完成用户要求的单次云端打包，标签工作流只执行检查、一次构建、arm64 打包与产物校验/预发布；33 项真实 Electron 窗口回归继续作为本地发版前检查。受保护的 `v0.1.3` 标签不移动；新工作流进入 main 后，通过现有标签的手动重试入口检出原标签并跑同一打包流程。

## 0.1.2 云端试验与 0.1.3 修复（2026-10-21）

- 用户授权按新流程完成 0.1.2：PR #6 合入 develop（`6cb8695`）；develop→main PR #7 因 0.1.1 版本记录冲突，经仅含文档的 PR #8 回合 main 历史后合入 main（`07c426c`）；受保护标签 `v0.1.2` 指向该提交。标签只触发一条 macOS arm64 云端运行 [39478238838](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39478238838)，没有 PR/分支重复构建。
- 云端 `pnpm check`、构建通过，但窗口回归为 31/33：连线交互超过 30 秒单项时限；放大面板断言固定 600px，而 runner 较小视口按 CSS 正确得到 564px。工作流在打包前停止，没有 DMG/ZIP 或 GitHub Release；不能称 0.1.2 已发布。标签受保护，不移动。
- 下一补丁版本使用 0.1.3：测试按实际视口计算面板尺寸，CI 单项超时设为 90 秒；窗口测试失败时上传现场文件。根包、桌面包、README 和版本记录同步为 0.1.3。`pnpm check`、工作流结构/版本校验通过；本地完整窗口回归 33/33 同轮通过。远端 0.1.3 尚未发布。

## 单次标签构建流程（2026-10-21）

- 用户指定改动后用 `0.1.2` 试验；根包与桌面包版本已同步为 0.1.2，版本记录加入本轮触发条件和未签名边界。`pnpm check`、版本校验和工作流 YAML 结构检查通过；本地 `pnpm test:smoke` 日志显示 33/33 同轮通过。标签仅在流程改动经 develop PR、再经 develop→main PR 进入主线后创建，目前仍未发版。
- 用户最新确定：功能分支只 PR 到 develop；发版时在 develop 定版本后直接 PR 到 main，合并后给 main 合并提交打标签；GitHub 仅为版本标签做一次云端 macOS arm64 构建。旧 PR/main/develop CI 工作流已从本轮功能分支移除，标签工作流保留手动输入已有标签的重试入口。
- 0.1.1 的 main 合并提交为 `c425462`，`v0.1.1` 已存在；旧标签打包与所有相关 CI 任务经用户要求取消，没有 GitHub Release。新流程合入默认分支后可手动输入 `v0.1.1` 试跑；在此之前不声称远端打包已验证。

## GitHub Apple Silicon 打包流程（2026-10-21）

- 用户随后指定当前变更为 `0.1.1` 并要求试跑。根包与桌面包版本均已改为 0.1.1，版本记录已补；release 输出目录按版本区分，避免覆盖旧产物。本地重新运行 `pnpm test:smoke`，33 项同轮通过；真实打包得到 0.1.1 arm64 未签名 DMG/ZIP，主程序架构、应用 Info.plist 版本、DMG 校验和、ZIP 完整性均通过。`pnpm check` 通过。`pnpm install --frozen-lockfile` 在现有本地模块目录上遇到无 TTY 删除确认而中止；版本修改不涉及依赖，没有绕过项目的批量删除限制，GitHub 全新 runner 将正常安装。
- 远端功能分支已推送并创建 [PR #3](https://github.com/qianyuzhao-ai/Jarvis/pull/3) 指向 develop。PR 的 Apple Silicon CI 已被 GitHub 接收，但截至本轮检查仍显示 queued、没有步骤日志。工作流尚未进入默认分支 main，手动触发返回 404；GitHub 文档要求 workflow_dispatch 的工作流先存在于默认分支，故远端手动打包与标签发布尚未实测。
- 新增 PR/主线 CI 和 macOS arm64 打包工作流。CI 在 `macos-15` Apple Silicon runner 上执行 `pnpm check`、真实 Electron 窗口测试；打包工作流支持 Actions 手动触发（仅上传运行 Artifact）及 `v*` 标签触发（先校验标签版本与 main 祖先关系，再创建 GitHub 预发布）。仅产出 DMG/ZIP，不生成 Intel 或 universal 版本。
- 按用户最新要求，签名和公证留待后续；当前 release 配置显式关闭签名、公证和 Hardened Runtime，文件名包含 `unsigned`，标签发布标记为预发布。未配置正式图标，也未实现自动更新；现有 `mac.minimumSystemVersion` 仍为 26.0。
- 本地已执行与工作流相同的 arm64 electron-builder 打包命令，得到 `Jarvis-0.1.0-macos-arm64-unsigned.dmg` 和 `.zip`；`lipo` 确认主程序 arm64，`hdiutil verify` 与 `unzip -t` 通过，`pnpm check` 与构建通过。第一次沙箱运行因无法解析 github.com 失败，允许联网后下载 Electron 并成功打包。GitHub Actions 尚未在远端实际运行，不能将本地结果称为远端 CI/发布通过。

## Prompt 素材引用（2026-10-21）

- 上轮画布多选已按用户要求单独提交为 `f44b5e2`。本轮在同一画布功能分支增加 Prompt `@` 候选和高亮标签，候选来自面板参考素材及连线素材。按图片、视频、音频各自的数组顺序编号；生成前将 `@kind_N` 转为 `<<<kind_N>>>`，缺少对应素材时明确失败，不发送生成请求。面板参考素材变化时按素材 ID 重算已有标签位置，移除素材的标签同步移除。
- 沿用现有图像节点只接受图片、视频节点可接受图片/视频/音频的规则。没有改变服务端协议、上传顺序或连线规则；Figma 未同步。
- 验证：`pnpm check`、`pnpm build`、完整 33 项 Electron 窗口回归同轮通过；真实请求断言覆盖图片与视频占位符，窗口截图核对标签显示。

## 画布多选、批量连线与下载（2026-10-21）

- 工作分支 `feature/canvas-multi-select` 从干净的 `develop` 创建。本轮实现框选多节点、Shift/Cmd/Ctrl 加选、框选不弹编辑面板，多选操作栏支持选择目标节点批量连线和批量下载；普通单节点编辑保留。批量连线先按现有规则验证全部来源，再一次写入，任一来源不合法则整组不写入。下载依次调用现有受限 IPC，支持图片、视频和音频；无可用 URL 的节点跳过，取消保存时停止后续文件并汇总数量。
- 编辑面板用 Motion 淡入 180ms，遵守减少动态效果。音频下载增加协议类型、文件扩展名与原生保存框文案；没有扩展生成服务能力。
- 验证：`pnpm check`、`pnpm build`、`git diff --check` 及真实 Electron 窗口 32 项完整回归同轮通过。新增测试覆盖框选不弹面板、三张图片批量连线、混合图片/音频/视频连线与下载、批量连接失败时不留部分连线。调试中完整回归曾暴露旧键盘选边被取消选中事件覆盖，已修复；面板淡入不改变尺寸。

## PyCharm TypeScript 模块解析修复（2026-10-21）

- 用户提供 `electron.vite.config.ts` 的导入红线截图。实际打开文件和 Problems 面板复现 10 项诊断：3 个 TS2307 明确指出当前 moduleResolution 无法解析已有类型，另有 emptyOutDir 连带错误和隐式 any；此前 IDE MCP 返回空 errors 未涵盖这些现场诊断，不能作为编辑器无错误的证据。
- 根因是桌面包仅有 `tsconfig.node.json`、`tsconfig.web.json`、`tsconfig.test.json`，没有供 TypeScript 服务发现的默认入口。新增 `apps/desktop/tsconfig.json`，使用空 files 和 references 引用三个现有配置，让编辑器读取既有 Bundler 模块解析；没有修改导入或关闭类型检查。类型检查命令继续分别执行三个配置。
- 验证：PyCharm 实际 Problems 面板从 10 项降到 1 项，TS2307、连带 TS2769 和隐式 any 提示消失；剩余“未使用的默认导出”为 IDE 对工具配置入口的检查提示，未通过注释屏蔽。`pnpm check`、默认入口 `tsc -p apps/desktop/tsconfig.json` 和 `git diff --check` 通过。

## PyCharm 格式工具对齐（2026-10-21）

- 用户反馈编辑器中出现大量格式提示。当前 `pnpm check` 通过，IDE MCP 检查 `apps/desktop/electron.vite.config.ts` 和 `apps/desktop/src/renderer/src/features/creation/Canvas.tsx` 均返回空 errors；尚未取得用户所指文件和提示原文，不能据此断言全部提示已消失。
- 检查发现本地 PyCharm 仍保留 Prettier 自动模式，Biome 自动配置和保存格式化已开，但 LSP 格式化未开。已在当前项目设置中禁用 ESLint/Prettier、启用 Biome LSP 格式化、保留保存格式化并关闭保存时导入排序（与仓库 assist 关闭保持一致）。应用设置后 IDE 显示 Biome server restarted，回读 `.idea/biome.xml`、`.idea/prettier.xml` 确认设置写入。
- `.idea/` 被 Git 忽略，本次 IDE 设置仅影响本机。未关闭 TypeScript 或其他内置代码检查，具体剩余诊断需依据用户提供的提示定位。

## 统一使用 Biome（2026-10-21）

- 用户进一步确认只保留 Biome。已移除 Prettier 依赖、锁文件条目、`.prettierrc.json` 和 `.prettierignore`，后两者按明确路径逐个删除；ESLint 的配置与依赖已在上一轮移除。下方首次迁移记录中的“保留 Prettier”仅代表当时状态，由本节替代。
- `pnpm check` 使用 Biome 同时检查代码与格式，再运行 TypeScript；`pnpm lint` 单独检查代码；`pnpm format` / `pnpm format:check` 使用 Biome。README 和 AGENTS.md 的当前工具链同步更新。
- Biome 覆盖 JS/TS、JSON/JSONC、CSS（启用 Tailwind 指令解析）；延续 2 空格、100 列、JS/CSS 单引号与分号习惯。Markdown/YAML/HTML 不纳入当前 Biome 格式检查，不为这些文件保留额外格式工具。保留既有 renderer 边界和 Hooks 规则；assist 继续关闭。
- 验证：`pnpm check`、`pnpm format:check`、构建及 `git diff --check` 通过；两个测试文件仅有 Biome 自动换行/缩进差异。配置、包清单和锁文件已无 ESLint/Prettier 引用，历史工程记录保留迁移说明。

## 协作说明合并（2026-10-21）

- 用户要求将 `CLAUDE.md` 合入 `AGENTS.md` 并删除前者。已将当前范围、常用命令、目录结构、技术栈和进程安全约束合入 `AGENTS.md`，去除重复的阅读入口；项目协作说明统一维护在 `AGENTS.md`。
- 验证：核对原有内容均已迁移或由现有规则覆盖；确认 `CLAUDE.md` 已删除，`git diff --check` 通过。

## Biome 代码检查迁移（2026-10-21）

- 用户要求 ESLint 改用 Biome。当前使用 `@biomejs/biome@2.5.15`，根目录 `biome.json` 管理规则；`pnpm lint` 直接检查整个工作区，桌面包的 lint 也使用 Biome。保留 Prettier 负责格式化（包括 Markdown/YAML），Biome formatter 与 assist 关闭。
- 已移除 ESLint 配置、直接依赖、锁文件依赖和 TypeScript ESLint 的安装年龄例外；README/CLAUDE 工程约定同步更新。没有改动业务源码。
- 使用官方 `biome migrate eslint --include-inspired --write` 迁移后整理重复覆盖；显式补回 renderer 的 `electron`、`fs`、`path`、`child_process` 及 `node:*` 禁止导入规则。保留 Hook 顶层调用、依赖检查及 React Refresh 导出检查，警告仍使 lint 失败。
- 规则差异：迁移工具报告原 109 条规则中 22 条尚无实现，包含 React Compiler 相关 Hooks 规则（purity、refs、set-state-in-effect/render 等），不能宣称与旧 ESLint 完全等价。Biome 的 noEmptyBlockStatements 也禁止空函数回调，noShadowRestrictedNames 也禁止 Map 等普通全局名称遮蔽；为保持原有代码行为关闭这两条。useErrorCause 不强制无参数 catch 添加参数；Hook 依赖检查不报告额外依赖，允许已有 retry 触发重跑。
- 验证：`pnpm check`、`pnpm build`、桌面包独立 lint、`git diff --check` 通过。单个临时 TSX 反例验证 renderer 的 Node/Electron 导入、条件 Hook、遗漏依赖均触发对应诊断，随后逐文件删除该反例。仅工具链变更，未运行 Electron 窗口回归。
- 本轮工作分支 `feature/biome-lint`；用户随后授权本地提交本轮迁移，未授权推送或合并。

## 0.1.0 源码版本准备（2026-10-21）

- 用户要求以当前修改确立 0.1 版本并按 Gitflow 推送。使用 `0.1.0`，桌面包版本保持原有 `0.1.0`，工作区根包同步为 `0.1.0`；内部配置包独立版本保持不变。
- 功能完成点 `95d46ed`，已合入 develop 并创建 `release/0.1.0`；版本功能与已知边界见根目录 `CHANGELOG.md`。本轮发布源码引用，不生成或上传安装包。
- 发布检查：`pnpm check` 和构建通过；两轮完整回归均为 28/29 通过，分别在侧栏拖动（期望 320px、实际 250px）、临时连线元素出现断言失败。两项分别带 trace 单独复测通过，第二轮侧栏也通过，首轮连线通过；全部 29 项均有通过结果，但不能声称整套一次全绿。没有仅为通过测试而更改实现或放宽断言，鼠标交互测试稳定性仍待跟进。

## 下载入口与开发进程不同步排查（2026-10-21）

- 后续实际复现并修复的根因：开发 URL `http://127.0.0.1:5173` 未带末尾 `/`，WebContents 实际地址带 `/`，`assertSender` 字符串比较拒绝合法 IPC，页面显示“请求来源不可信”，目录按钮被禁用。`trustGenerationWindow` 改为用 `new URL(url).href` 保存规范地址，继续保留窗口 ID、主 frame 身份和完整 URL 的精确校验，不放宽来源权限。此前热更新修复仅是相关缺陷，并未解决此根因。
- 当前验证：已启动 `pnpm dev`，在真实开发窗口复现上述错误；修复后按钮启用、原生目录窗口打开且“打开”可用，取消后显示“已取消选择”。未替用户设置默认目录。下载及生成相关 7 项回归同轮通过，包括生成完成后下载原始图像/视频、目录设置重启恢复及异常重试；`pnpm check` 通过。审批服务恢复，旧 HTTP 403 已不再阻塞本轮验证。
- 用户反馈生成结果下载入口不明、下载设置的文件夹按钮无法点击。检查代码确认生成图像/视频在 `result.url` 存在时已有右上角下载按钮，构建产物也包含该入口。
- 已定位可导致目录按钮一直禁用的路径：原 `pnpm dev` 未传 `--watch`，electron-vite 6 默认不监听主进程/preload；界面热更新后可能仍运行旧 IPC。`DownloadSettings` 原来直接调用读取方法，缺失方法会同步抛错且不显示反馈。尚未直接检查用户当前进程，不能断言该路径是现场唯一原因。
- 开发命令改为 `electron-vite dev --watch`；下载设置捕获同步/异步读取失败，接口缺失或未注册时明确提示完全退出并重新运行 `pnpm dev`，保留重试入口。当前已启动的旧开发进程需要重启一次。
- 在现有生成联调测试中增加完成生成后点击图像/视频下载并比较原始字节；新增 IPC 不可用时提示及恢复重试回归。检查和构建通过；沙箱内 1 项协议校验通过，其余 6 项因本地监听 EPERM / Electron 无法启动而未完成。沙箱外验证申请被自动审批服务 HTTP 403 阻断，非测试断言失败；本轮未取得端到端通过结果。窗口检查同样被审批 403 阻断。

## 范围与结构

- 用户要求先搭建基础项目，明确暂不引入 Pi Agent 相关工具。
- 沿用系统架构方案的 pnpm workspace、Turborepo、Electron、electron-vite、React、TypeScript 和 Tailwind v4。
- 目前仅有 `apps/desktop` 与 `packages/config`；未预建空的 Agent、存储或工具包。
- Node 22.23.3 由 pnpm 的 devEngines.runtime 下载管理，不修改全局 Node；pnpm 11.24.0。
- Electron 44.9.1、electron-vite 6.0.0、React 19.3.1、Vite 8.3.4、Tailwind 4.3.3、TypeScript 5.9.3。具体版本以 package.json 和 lockfile 为准。
- 主进程为 ESM，沙箱 preload 为 CommonJS；renderer 禁止直接引入 Electron/Node。
- 开启 sandbox、contextIsolation，关闭 nodeIntegration；preload 暴露运行时版本信息及受限的上传、生成任务、URL 媒体预览、媒体下载和项目 Excel 导出接口，没有通用 Node/文件/Shell 权限。拒绝权限请求、新窗口和外部导航。
- UI 已进入创作空间阶段：项目列表和 React Flow 画布可操作，侧栏可收起并支持 230–320px 拖拽调宽、宽度保存和 Motion 动画，默认 230px。新对话仍待接入。
- 使用 @xyflow/react 和浏览器内置 IndexedDB 保存项目；不包含 Pi Agent、模型 SDK、MCP 或 Skill 执行。已接入内网服务的上传与生成协议；生成接口仍由用户填写的地址提供，不内置模型服务。

## 使用与维护

- Git 管理采用用户指定的 Gitflow，详见 `memory/git-workflow.md`；原图的 master 对应本仓库 main，开发集成分支使用 develop。
- `pnpm dev` 开发启动；`pnpm check` 检查；`pnpm test:smoke` 启动真实窗口测试；`pnpm package:dir` 本地打包。
- `pnpm install --frozen-lockfile` 安装已有依赖；修改依赖后运行 `pnpm install` 更新锁文件。
- 显式允许 electron/esbuild 构建脚本，拒绝当前不用的 electron-winstaller 脚本。
- `verifyDepsBeforeRun: false` 避免运行命令时触发自动重装；electron-vite 不自动清空 out。
- 测试和打包每次使用新的输出目录，避免批量清理旧产物。积累的文件由用户按需手动清理。
- 2026-10-20 用户已授权初始化本地 Gitflow 分支并提交基础工程，明确禁止本次推送；初始化记录见 `memory/git-workflow.md`。

## 验证

- 已通过 Lint、TypeScript、Prettier 检查和主进程/preload/renderer 构建；`pnpm dev` 已实际启动。
- Electron 冒烟测试已通过：启动页、版本桥接、renderer 不暴露 require/process、侧栏展开收起、新窗口阻止。
- 已生成 macOS arm64 未签名应用，并实际启动确认页面加载；使用默认图标。没有完成生产签名、公证、升级测试或 Windows 验证。

## 创作空间实现验证（2026-10-20）

- 功能分支 `feature/aigc-workspace`；2026-10-20 用户授权提交本轮实现，暂不合并或推送。
- React Flow 12.12.0，项目与参考素材使用 IndexedDB；新建项目、节点添加/删除、编辑面板、主题、缩略图、点阵和网格吸附已接通。
- Lint、类型检查、构建及 Electron 集成测试通过；画布参数和参考素材重新加载后恢复，900 × 640 窗口中编辑面板可见，浅深截图已检查。
- 初始交付仅有界面与本地交互；当前代码已接入上传及生成，协议与端到端链路通过本地模拟服务验证，不能据此声称真实内网服务已联调。

## 画布资源导入与 URL 渲染（2026-10-20）

- 用户要求从桌面拖入图片、视频和音频后立即上传，图片/视频走 `imageUploadUrl`（upload），音频走 `audioUploadUrl`（upload-media）。复用现有 multipart `files` + `req_from` 协议及设置；导入无需填写 aigc 地址。
- `types.ts` 新增 `asset` 节点，与原 `media` 生成节点组成联合类型；兼容旧 version 1 数据。资源保存名称、类型、位置、上传状态及成功返回的 HTTP(S) URL，不把 File/Blob/字节或临时预览地址存入资源节点。
- `useAssetUpload` 在工作台层维持异步上传，切换项目后仍更新原项目，已删除节点不会复活。加载时把中断的 uploading 状态转为明确失败；重新拖入才重新上传，不自动重传。
- `UrlMedia` 统一渲染导入资源及生成结果的实际 URL。主进程验证 HTTP(S) 后注册不透明的 `jarvis-media://url/<id>` 媒体地址，保留 CSP 与上下文隔离，转发 Range 和媒体响应头。主进程重启后由节点 URL 重新注册，无需依赖临时映射持久化。
- 上传及 URL 预览不依赖生成任务记录可读；生成开始/查询继续保留任务记录错误保护。原 result 协议路由保留兼容。
- 上传大小沿用图片 32 MiB、视频 200 MiB、音频 64 MiB，并集中为共享常量。桌面文件缺失 MIME 时按常见扩展名补全；文件空、类型不支持、地址未配置或超限时直接提示。
- 验证：`pnpm check`、构建通过；新增 5 项资源测试覆盖 IPC URL 校验与 Range、类型/大小校验、三类实际 multipart 上传与播放、应用关闭后重新启动恢复且不重传、缩放落点、跨项目上传、URL 失效重载、上传失败/中断及删除。使用本地模拟 HTTP 服务及 Electron DataTransfer 拖放，没有进行 Finder 手动拖放或真实内网联调。
- 完整回归先通过 15/16 项；旧 smoke 用例仍按旧默认模型选择 4K，现已明确先选 Seedance 2.0，再验证切换到 2.5 时回落 1080P。该用例复测有一次提示词意外多出空格，再启用 trace 重跑通过，未更改提示词实现；16 项均已有通过结果，不声称同一轮全部通过。

## 项目请求账本与 Excel 导出（2026-10-20）

- 用户要求导出画布项目全部请求的 JSON、返回 URL，以及按模型统计图像次数和视频秒数；随后明确：删除画布节点不能删除统计。生成与素材上传均记录，上传不计生成消耗。
- 请求账本独立于 IndexedDB 中的画布节点。`generation-jobs.json` 保留每次生成任务，新增实际发送的 JSON 字符串、端点、模型、协议规范化后的视频时长和完成时间；`upload-history.json` 保存各次上传状态、文件元数据和返回 URL。删除节点不调用账本删除，同一节点多次生成不会覆盖旧任务。
- 两条记录链路都先持久化请求快照再发网络请求；无法写入初始记录时不发送。生成使用已存 JSON 字符串作为实际 POST body。上传走 multipart，记录可读 JSON 元数据，不保存二进制。主进程重启后记录仍在，进行中任务转为结果未知。
- 旧生成日志仍可读取，但没有保存的模型、JSON、时长必须标为未记录，不能从当前节点参数反推。此次功能上线之前的素材上传没有独立账本，无法补造已丢失的历史请求。
- `generation:export-project` IPC 只接受项目 ID 和名称，由可信窗口调用原生保存对话框，主进程从账本按项目读取记录并写入 `.xlsx`；renderer 不提供任意文件路径或伪造请求列表。账本读取异常时停止导出，避免静默遗漏。
- 使用 ExcelJS 4.4.0 的流式工作簿写入器，依赖及锁文件已更新。两张工作表为“消耗统计”“请求明细”；支持模型分组、状态分列、冻结表头、筛选、长 JSON/地址分段列，以及关联明细的 COUNTIFS/SUMIFS 公式和导出时缓存值。
- 视频秒数按成功请求的配置时长合计；自动时长（-1）或旧日志未记录的成功视频另计未知次数，不推测真实媒体时长或费用。失败、进行中及结果未知不计成功产出。
- 验证：`pnpm check`、构建及完整 20 项测试在同一轮通过。新增 4 项导出测试覆盖 XLSX 回读、分模型统计与状态、跨项目隔离、空表和旧日志、请求 body 精确对应、重复生成/重启、删除全部节点后导出、取消/写入失败和占位按钮。超长中文/emoji JSON 在普通写入器中出现字符损坏，改为流式写入后逐字回读通过。
- 900 × 640 浅深色工具栏截图检查通过。保存对话框在 Electron 测试中被替换为测试路径，未完成原生 Excel 应用中的手动打开及公式重算验收；本次未进行真实内网联调。

## 画布连线与上游引用（2026-10-21）

- 用户要求从左向右连接：图像节点接受上传图像和生成图像；视频节点接受上传图像/音频/视频及生成图像/视频。默认灰线，点击节点后高亮上下游并显示蚂蚁线，连线层级始终低于所有节点。
- `types.ts` 给项目新增 `edges`（id/source/target），缺失时默认空数组，兼容旧 version 1 数据。`NodePorts.tsx` 为生成节点提供左输入/右输出，上传资源仅有右输出；支持鼠标拖拽、点击及 Enter/Space 激活端口。
- `connections.ts` 集中校验目标类型、重复、自连、循环和参考数量；面板素材与连入节点共同计入图片 9、视频 3、音频 3 的限制。允许先连接尚无结果的节点，但点击生成时必须有可用 HTTP(S) URL；上游仍在生成/上传时阻止下游请求。
- `useGeneration` 读取点击生成时的直接上游 URL 快照，按类型加入 imageList/videoList/audioList；保留手动素材顺序，再按连线保存顺序追加上游，追加时跳过已有相同 URL。不会再次上传这些 URL，不自动执行上游节点。
- `Canvas.tsx` 保存连接、支持单独选线并按 Delete/Backspace 删除、删除节点时同时清理关联边。两种节点删除入口均覆盖；请求账本不受节点/连线删除影响。
- 高亮分别遍历完整祖先与后代链路，不扩散到同一上游的兄弟分支；高亮状态不持久化。节点、边选中状态分开管理，键盘选线会取消节点选择，避免误删节点。
- 使用手动 z-index：节点 10，已存在边和拖拽中的临时连线 0，关闭自动抬升；节点底层使用画布色，避免线条穿透透明或留白区域。仅相关边启用 0.9s linear 蚂蚁线；减少动态效果时停动画并保留高亮，不逐帧更新 React 状态。
- 验证：`pnpm check`、构建、完整 25 项测试同轮通过。新增 5 项覆盖类型矩阵、自连/重复/循环/数量、旧数据、祖先后代与兄弟分支、直接上游 URL、鼠标/键盘连线与删除、持久化、节点删除清理、静态与临时线层级、减少动态效果和生成请求实际携带三类 URL。
- 浅深色截图检查通过；生成链路使用本地模拟 HTTP 服务，未进行真实内网联调。本轮未修改 Figma。

## 图像/视频节点下载（2026-10-21）

- 用户要求图像和视频节点可点击下载。上传完成的图像/视频资源及已有结果 URL 的生成节点均提供右上角下载按钮；空节点没有下载按钮。`NodeDownload.tsx` 统一处理防重复点击、处理中、完成、取消和失败反馈。
- `generation:download-media` 接受 HTTP(S) URL、图像/视频类型及可选文件名，由可信窗口打开原生保存对话框；renderer 不能指定任意本地写入路径。该接口不依赖生成任务账本可读，不记录新的生成消耗。
- 主进程 `download-media.ts` 使用 `net.fetch` 和流式管道保存原始响应字节，不转码、不把整个视频缓冲到 renderer。根据响应 Content-Type 建议扩展名，清理建议文件名中的路径/非法字符。拒绝 HTTP 错误、类型不匹配和空内容；请求有 10 分钟超时，取消后终止读取。
- 选定保存位置后，先写入同目录独立 UUID `.part` 文件，完整接收后再 rename 到目标。传输失败时只删除这一次明确创建的单个临时文件，保留已有目标文件，不进行批量清理。
- 点击按钮不触发节点编辑或拖动。生成任务状态移到节点左上角，下载入口保持右上角，避免遮挡；忙碌指示在减少动态效果时保持静态。
- 验证：`pnpm check`、构建及完整 27 项测试同轮通过。新增 2 项测试覆盖 IPC URL/类型校验，四类节点的点击下载、响应原始字节、真实 MIME 文件名、取消、HTTP 404/错误类型、空响应和中断保护，确认已有文件不被覆盖且没有遗留 `.part`。浅深截图检查通过。
- Electron 测试使用本地 HTTP 服务与替换后的保存对话框路径，未进行真实内网下载联调或原生保存对话框手动验收。本轮未修改 Figma。

## 默认下载目录与提醒偏好（2026-10-21）

- 用户要求在设置中选择并保存默认目录，并通过“不再提醒”控制是否跳过保存位置选择框。沿用现有“通用”分类，新增“下载”区块；目录选择和开关即时保存。
- 未设置目录时开关禁用；已设置目录但未勾选时，每次下载仍弹出保存框，默认定位到所选目录。只有目录有效且 `dontAskAgain=true` 时才直接保存；取消勾选后恢复每次询问。
- 下载偏好独立保存到 userData 下 `download-preferences.json`，由 `DownloadPreferencesStore` 原子写入并串行处理更新，重启恢复。renderer 只能读取偏好、打开原生目录选择和提交布尔开关，不能传入任意目录路径让主进程写入。
- 直接下载检查目录存在且可写；目录失效时提示到设置重新选择，不静默改目录。直接下载同名文件使用 `COPYFILE_EXCL` 加编号，包含并发下载保护，不覆盖已有文件；保留原有单个临时文件清理规则。
- `DownloadSettings.tsx` 显示目录、选择/更改按钮、开关及保存状态；开关即时反馈，保存失败时回滚。目录长路径可换行，浅深截图检查通过。
- 验证：`pnpm check`、构建、完整 28 项测试同轮通过。新增设置测试覆盖未配置、取消目录选择、默认目录但仍提醒、勾选后不弹框、重启持久化、并发同名文件、取消勾选后恢复弹框。
- Figma 组件部分已更新并完成截图验证，页面装配调用遇到连接器传输 HTTP 403；只读与 whoami 同样失败。具体已完成节点和待续事项见 `memory/design.md` 及 `memory/figma-sync-2026-10-21/state.json`，不能把全部 Figma 页面描述为已同步完成。
