# Jarvis V1.0.0 Agent OS 实施计划

最后更新：2026-10-26

依据：用户上传的《Jarvis Agent OS 架构设计方案 v0.2》（2026-10-25，开放问题 A/B/C 已拍板）。用户 2026-10-26 明确：V1.0.0 大更新，现有 Agent 逻辑可以全部推翻，全部采用该方案；分批实现，先做 Agent 对话，再接入创作空间和写作空间。开发分支 `claude/agent-logic-redesign-9irs9g`（基于 origin/develop `48d698e`）。

## 1. 已确认决策

| 编号 | 决策 | 来源 |
| --- | --- | --- |
| A | Coordinator 只带只读小工具集（日程查询、文件搜索、记忆读取）；写操作和预计超过 3 次工具调用的事都开线程 | 方案 v0.2 |
| B | 线程默认挂载全部只读能力；写能力按任务书声明挂载，运行中可用 `request_capability` 申请，内核记录申请，策略引擎照常判级 | 方案 v0.2 |
| C | 所有线程和 Coordinator 都能直接写项目记忆；内核用 baseVersion 校验，Coordinator 每周整理一次 | 方案 v0.2 |
| U1 | 引入“项目”：一个项目就是一个 OS，对应一个 Coordinator；用户可以给项目指定它能访问的目录 | 用户 2026-10-26 |
| U2 | 新 UI（项目、协调对话、线程卡片/视图、Overview、决策卡、进度清单）先出 Figma，经用户确认后再实现 | 用户 2026-10-26 |
| U3 | 第一批只做首页 Agent 对话；画布与写作右侧栏 Agent 暂时下线，第二批作为 canvas / writing 能力包接回线程 | 用户 2026-10-26 |
| U4 | 旧 Agent 对话记录（`agent/index.json`、`agent/sessions`）不迁移，从零开始；旧文件原样留在磁盘、不再读取 | 用户 2026-10-26 |

待定（实施中再定，未得到用户答复前不得当作已确认）：

- D 线程用协程/同一主进程（方案建议）；当前实现按此执行。
- E 成本：投入缩放规则 + 每线程预算 + 并发槽（方案建议）；当前实现按此执行。
- F Coordinator 不等线程，线程完成时用唤醒回报（方案建议）；当前实现按此执行。
- 命名冲突：创作空间的画布也叫“项目”。代码里 Agent 项目命名为 `AgentProject`；界面文案在 Figma 评审时与用户确认。
- 不提供 Shell / 浏览器工具（AGENTS.md 约束，方案执行层里的 Shell 不实现）。

用户 2026-10-26 追加确认：

| 编号 | 决策 |
| --- | --- |
| U5 | Figma 评审稿样式通过（Section `493:41564`），可按稿实现 1c |
| U6 | 创作空间里的“项目”改名为“画布”（新建画布、画布列表等）；Agent 侧继续叫“项目” |
| U7 | 去掉“新对话”：每个项目只有一条协调对话作为唯一入口；“新建项目”放进顶部项目切换菜单 |
| U8 | 决策卡与线程卡住做成系统通知弹窗；普通决策卡可在通知按钮里直接选，不可逆操作的通知只有“查看”，点开后在卡片上看完整参数再批准 |
| U9 | 画布与写作右侧栏对话 = 绑定该画布或文档的线程（属于某个 Agent 项目，进线程列表与 Overview，可直接对话）；协调者开的线程也可挂载画布 / 写作能力 |
| U10 | 右侧栏 Figma 评审稿通过；侧栏太窄，输入框不显示“技能”按钮（/ 仍可选技能） |
| U11 | 决策卡除了给出的选项，还要能“自己输入”其他答案（批准类卡片仍只有批准 / 不执行） |

## 2. 存储布局（V1.0.0 新目录，不读旧记录）

```
userData/agent/                   保留：connection.json（模型）、skills.json、settings.json、mcp.json、mcp-oauth、calendar.json
userData/agent/os/
  projects.json                   项目列表与当前项目
  projects/<projectId>/
    project.json                  标题、说明（≤16k）、模型、预算
    folders.json, file-snapshots/ 本项目授权目录（每个项目独立的 LocalFiles）
    files/                        项目文件（Library，线程产物）
    memory/MEMORY.md, <topic>.md  项目记忆：索引由内核按主题文件头生成
    threads.json                  线程元数据（状态、任务书、清单、结果卡、挂载记录）
    decisions.json                决策卡
    wakes.json                    定时唤醒、周期任务、订阅
    sessions/<sessionId>.events.jsonl  追加式事件日志（消息 upsert、状态、唤醒）
    sessions/<sessionId>.jsonl    Pi 模型上下文
    ledger/<sessionId>.json       操作账本
```

旧“设置 - 文件与权限”的全局授权目录改为项目级目录（U1）。

## 3. 模块结构（`apps/desktop/src/main/agent/`）

- `kernel/`（纯代码，无 LLM）：`event-log` 事件日志、`mailbox` 邮箱与限流、`wakes` 唤醒调度、`decisions` 决策卡与批准凭据、`memory` 项目记忆、`policy` 策略流水线、`scheduler` 带优先级的并发槽、`ledger` 账本、`capability` / `tool` 能力包接口。
- `os/`：`service`（AgentOs 门面：项目、会话、轮次、唤醒、决策、撤销）、`projects`（项目与线程元数据）、`prompts`（协调者 / 线程提示词与信任信封）、`coordinator-pack`、`thread-pack`、`memory-pack`、`model-admin`、`spaces`（画布 / 写作命令中转与窗口打开目标、关联账本）、`target-packs`（按线程目标挂画布 / 生成 / 写作包）、`disk-writing`（未打开文档的写盘与撤销）。IPC 在 `agent/bridge.ts`。
- `packs/`：files、calendar、mcp、writing-library、navigation、skills，以及画布、生成、写作包（第二批接回线程）。

## 4. 关键机制

- **信任**：消息入队时由内核打 `principal / peer / relay` 标签；`citedUserMessageIds` 只能由内核从真实用户消息复制。模型看到的唤醒文本带信任信封，relay 永远不能构成批准。
- **非阻塞确认**：`confirm` 级工具调用不弹窗；内核生成不可逆决策卡并拦截本次调用，线程先做不依赖它的部分后结束本轮。用户在卡片上批准后内核发放一次性批准凭据（绑定工具名与参数哈希）并唤醒线程，线程重新调用即放行。无超时拒绝，2 小时后提醒一次。模型也可用 `ask_user` 发普通决策卡，按推荐项先推进。
- **策略流水线**：钩子 → deny（批量删除、未知工具）→ ask → 模式 → allow/只读 → 四级（只读直接执行；可撤销执行并记账；确认走决策卡；禁止拒绝）。写能力未挂载时提示先申请。
- **唤醒**：user_message / spawn / peer_message / scheduled / external_event / decision / task_done / resume。会话空闲时唤醒开新一轮；运行中经 steer 在两次工具调用之间送达。线程不轮询、不 sleep。
- **恢复**：事件日志记录 round_start / round_end；启动时未结束的轮次自动以 resume 唤醒续跑。
- **并发**：全局并发槽（设置 1–6，默认 3）按“正在请求模型”计；优先级：用户正在看 > 有用户新消息 > 定时/外部 > 后台。每线程有 token 与工具调用预算，超出时发决策卡问是否继续。

## 5. 分批路线

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| 1a 后端 | 内核 + 项目 + Coordinator + 通用线程 + 记忆 + 唤醒 + 决策卡 + 新 IPC；Node 级测试 | 已完成（2026-10-26） |
| 1b 设计 | Figma：项目对话与线程卡片、线程视图与进度清单、Overview、决策卡、项目设置（浅/深） | 已完成，用户已确认（U5） |
| 1c UI | 按已确认 Figma 实现首页 UI（含 U6–U8）；画布/写作右侧栏已显示“即将接入” | 已完成（2026-10-26，见第 7.1 节） |
| 2 | 画布 / 写作 / 生成能力包接回线程，右侧栏 = 绑定线程（第 6 节） | 已完成（2026-10-26）：2a 后端、2b Figma（U10 通过）、2c 右侧栏 UI |
| 3 | 设置「用量与统计」：主 Agent / 子 Agent token 与费用统计（第 7.4 节） | 已完成（2026-10-26）：Figma 通过，账本 + IPC + 面板 |

## 6. 第二批方案：画布与写作 Agent 接入（2026-10-26，用户已确认，含“未打开文档按可撤销写盘”）

1. **空间线程**：线程新增 `targets`（`{ kind: 'canvas', canvasId }` 或 `{ kind: 'document', rootId, path }`）。右侧栏新建的对话 = 当前 Agent 项目里一个绑定该画布 / 文档的线程，来源记为“空间”；用户在右侧栏说的话直接是 principal，不经协调者。标题取首条消息，任务书自动生成（目标“在画布「X」中按用户要求工作”，挂载该目标的 canvas 写能力）。右侧栏顶部显示所属项目，可切换。
2. **能力包按目标限定**：
   - canvas：读概况 / 节点详情 / 定位（只读，定位需窗口打开，否则说明）；`edit_canvas` 可撤销，直接写主进程 ProjectStore，逆操作记账本（沿用 A2c）。只能改任务书目标里的画布。
   - generation：发起生成需挂载；结束后由生成服务投递 external_event 唤醒线程（替代旧的 relay 续跑），线程不轮询；计入线程预算。
   - writing：文档在窗口打开时改编辑器缓冲区（未保存、版本校验、同轮撤销，沿用现有 broker）；未打开时读已保存内容，修改**建议**按可撤销写盘（写前快照、内容哈希防冲突、可撤销），此条待确认。
   - writing-library（跨文档列出 / 搜索 / 读 / 新建）保持。
3. **协调者联动**：`spawn_thread` 可带 targets 并声明 canvas / writing 写能力，画布无需打开；线程快照与 Overview 包含空间线程；空间线程越界的事用 `ask_coordinator`（取代 handoff_to_main）。
4. **视觉输入**：画布选中的图片 / 视频代表帧随用户消息发送（principal），只发给图片能力为“支持”的模型（沿用现有限额）。
5. **右侧栏 UI**（紧凑版线程视图，与已确认的线程视图一致）：标题 + 状态 + 历史（本画布 / 文档的线程，按进行中 / 已完成）+ 新线程 + 关闭；可折叠进度清单；消息与内联决策卡；紧凑输入框带上下文提示（“已选 3 个节点”“全文 · 已选 2 段”）与技能；“在首页查看”跳到完整线程视图。需先出 Figma 紧凑稿再实现。
6. **撤销**：画布在主进程按账本逆操作；写作缓冲区经窗口撤销；未打开文档按快照撤销。活动记录在右侧栏和首页线程视图都显示撤销入口。
7. **分步**：2a 能力包 + targets + 生成唤醒（后端与 Node 测试）→ 2b 右侧栏 Figma 紧凑稿 → 用户确认 → 2c 右侧栏 UI 与实窗测试（重写被删的 canvas-agent / writing-agent / vision 用例）。

## 7. 1a 实现要点（2026-10-26）

- 代码：`main/agent/kernel/`（event-log、memory、decisions、wakes、mailbox、scheduler 优先级、policy 流水线、tool）、`main/agent/os/`（projects、service、prompts、coordinator-pack、thread-pack、memory-pack、model-admin）、`main/agent/bridge.ts`（`os:*` IPC）、`shared/agent-os.ts`（类型与 `desktop.os` 桥）。删除旧 `service.ts`、`store.ts`、approval/bus、agent-control/handoff/report 能力包。
- 存储：`userData/agent/os/`；旧 `agent/index.json` 与 `sessions/` 不读不改（U4）。模型、技能、MCP、日历、通用设置文件沿用 `userData/agent/`。项目首次发消息（或在设置里首次添加目录）时才创建；项目自带“项目文件”目录。
- Coordinator 每轮用内存会话（不保留模型上下文），只读工具：线程管理、项目记忆读写（决定 C）、目录列出/搜索、日历查询、技能。线程用持久 Pi 会话，挂全部只读能力；写能力按任务书或 `request_capability` 挂载，策略引擎照常判级。
- 不可逆操作：生成决策卡并拦截本次调用；用户在卡片上批准后发放一次性凭据（工具名 + 参数哈希），线程被唤醒后原样重试才放行。无 5 分钟超时，2 小时后提醒一次。relay 消息、Coordinator 转达都不能批准。
- 唤醒：`send_later` / `create_routine`（5 字段 cron）/ `subscribe`（日程临近、项目目录文件变化，30 天失效）；应用关闭期间到期的在启动时补触发并标注。崩溃中断的线程轮次启动后以 resume 唤醒续跑；Coordinator 中断的那条消息重新处理；排队消息跨重启保留。
- 与方案的差异：用户在任务里明确要求的不可逆步骤仍需在决策卡上点一次（内核无法从文字判断“已批准”，按最严格处理）；邮件订阅、线程内子 Agent、共享任务列表（B6）未做。
- 过渡 UI（Figma 确认前，已被 1c 取代）：首页每个对话 = 一个项目的协调对话；侧栏“线程”列出未解决线程，点开即线程对话；决策卡暂用 AlertDialog 逐张显示（可“稍后”）；“设置 - 文件与权限”作用于当前项目；画布/写作右侧栏显示“即将接入”。
- 验证：`pnpm check`、`pnpm build` 通过；后端测试 38 项通过（os-kernel 7、os-flow 6，其余为移植的并发/引导/策略/模型/日历/文件/MCP/技能等）。完整实窗回归在 Linux 容器内 166/167（安装 gnome-keyring 并临时改 Playwright 的 password-store 参数，验证后已还原）；唯一失败为 `agent.spec.ts:153` 首页建议区几何断言，在基线提交 `48d698e` 上同样失败（Linux 字体度量），不是本次改动造成。
- Figma（文件 `mIwnyR5nAlECFMam1NvmER`，页 V1-视觉换新）：Section `493:41564`「V1.0.0 · Agent OS（待评审）」6 张：项目对话浅 `493:41565` / 深 `493:41745`、线程浅 `493:41610` / 深 `493:41790`、Overview `493:41655`、项目设置 `493:41700`。全部为 V1 组件实例与可编辑文字，0 图片填充，字体 SF Pro。

## 7.1 1c 实现要点（2026-10-26）

- 首页侧栏 = `ProjectSidebar`：顶部项目切换菜单（项目列表、新建项目、项目设置），Overview（meta“N 件等你”）、协调对话、“线程 / 已完成”两组，底部“N 个可访问目录”。`ShellSidebar` 只保留设置与画布两种侧栏，首页通过 `home` 插槽传入；旧“新对话”、对话历史、结果卡列表、“设置 - 文件与权限”页已删除（目录改在项目设置里管理）。
- 首页标签的 ref：null = 当前项目的协调对话；会话 ID = 协调对话或线程；`overview:<项目>`、`project:<项目>`。标签标题随快照同步（协调对话显示项目名）。菜单新建的项目名为“新项目”，首条消息会把它改成消息摘要；没有项目时首条消息直接建项目。
- 视图：`AgentViews.tsx`（协调对话、线程、Overview、项目设置）与 `AgentCards.tsx`（决策卡、线程卡、状态条、进度清单、原话引用），样式 `features/agent/os.css`。Overview 按稿：批准类（工具 / 预算）显示完整决策卡；普通问题显示一行“去回答”，到线程里回答。
- U8 系统通知（主进程 `bridge.ts`）：窗口聚焦且正显示该会话时不弹；普通问题在 macOS 通知按钮里直接选项作答（失败则打开线程）；不可逆批准、预算、线程卡住只给“查看”，点通知或按钮会聚焦窗口并经 `os:open` 打开该会话（已有标签则切过去）。其他系统无按钮，点击打开。通知对象保留到关闭以免丢失回调。“正在看”的会话改由 App 按当前活动标签上报（以前隐藏标签也会覆盖）。
- U6：创作空间文案“项目”→“画布”（我的画布、新建画布、搜索/排序画布、N 个画布、删除/重命名画布、画布名称、未命名画布、创建画布）；Agent 侧继续叫“项目”。
- 测试：新增 `tests/os-ui.spec.ts`（项目、线程卡与状态条、Overview 问题行 → 线程内回答、`os:open`、项目设置改名、第二个项目隔离）与 `tests/helpers/os-ui.ts`（`projectMenu` 等待上一个菜单关闭动画结束再开，否则其焦点归还会关掉新菜单；`newProject`；`approveInOverview`）。日历 / MCP / 文件实窗用例改为在 Overview 的决策卡上批准；文件用例改在项目设置添加/移除目录。
- 已删除：`AgentDecisions.tsx`、`ChatTab.tsx`、`FileAccessSettings.tsx`、`CanvasConversations.tsx`（逐个删除）。
- 思考档位：没有自己档位的协调对话跟随该模型上次用过的档位（界面显示与实际轮次一致，切换模型不再把它固定成“关”）；线程仍按任务书力度。
- 验证（提交 `23e4b92` 及后续修正）：`pnpm check`、`pnpm build` 通过；完整实窗 168 项中 166 通过，`model-library` 用例（仍点旧“新对话”）修正后复跑通过；唯一失败仍是基线即存在的 `agent.spec.ts` 首页建议区几何断言（Linux 字体）。临时跳过该断言时 `agent.spec` 其余流程（项目设置改名、重启恢复）通过。

## 7.2 2a 实现要点（2026-10-26）

- 共享类型：线程新增 `targets`（`canvas` canvasId / `document` rootId+path，每种最多一个）与 `origin`（coordinator / space）；写能力新增 `canvas`、`generation`、`writing`，只有绑定了对应目标的线程能挂载（任务书声明或 `request_capability` 都校验）。`desktop.os.send` 可附 `canvas`（选中节点 + 图片/视频帧）；新增 `desktop.os.startSpaceThread`（右侧栏首条消息：在当前项目开空间线程，没有项目时建“我的项目”；同一 requestId 不重复开）。
- `os/target-packs.ts`：画布线程挂画布包（主进程 ProjectStore，无需打开，逆操作记账本；定位需窗口打开）与生成包；文档线程在有窗口打开时走编辑器缓冲区（未保存、版本校验、窗口内撤销），未打开时走 `os/disk-writing.ts`：同样的读/改工具，每次修改校验内容版本后直接保存，本轮修改记为 `textChanges`（at/removed/inserted/afterVersion），撤销时从新到旧逐条核对版本再写回；文件被改过就拒绝撤销。打开中的文档不能用写盘撤销（请在编辑器里撤销）。
- `spawn_thread` 增加 `targets`；声明 canvas/generation/writing 必须写明对应目标，目标须存在（画布在 ProjectStore、文档在已授权写作文件夹且为 Markdown）。线程提示词写明工作对象；空间线程说明用户在右侧栏直接对话（principal），越界的事用 `ask_coordinator`。协调者的线程快照带 targets。
- 生成：线程发起的生成结束后由生成服务回调 → 以 external_event（trust=relay，来源“生成任务”）唤醒该线程，不轮询，计入线程预算。
- 共鸣点：绑定文档的线程可在 `report_result.resonance` 给出同文件夹最多三个候选（经星图索引校验），对话里记一条“发现共鸣点，等待确认”的活动；建立关联仍由用户在写作空间确认。
- 撤销 `desktop.os.undo`：文件（快照）、画布（逆操作 + 画布未再变化 + 最近一次）、写作缓冲区（发给打开该文档的窗口）、未打开文档（textChanges）。
- 改名/移动文档：有线程正在修改该文档时拒绝；成功后绑定该文档的线程目标与各项目账本、关联账本的路径一起更新。星图关联同样在文档线程忙时拒绝。
- 图片：只给图片能力为“支持”的模型；校验附图属于所选节点、类型与字节头匹配、单次 16MB、每线程累计 60 张；像素不落盘，只在消息里保留预览信息；带图或带新选区的消息不并入正在进行的回复（单独一轮）。
- 验证（`2238c2f` 及后续修正）：`pnpm check`、`pnpm build` 通过；完整实窗 + Node 回归 204 项中 203 通过，唯一失败仍是基线即存在的 `agent.spec.ts` 首页建议区几何断言（Linux 字体）。keyring 临时补丁已还原。
- 测试：新增 `tests/os-space.spec.ts`（画布空间线程改画布与撤销、选区与提示词、重复请求、生成完成唤醒；协调者开的文档线程写盘、共鸣点、版本冲突时拒绝撤销、改名跟随、打开后改走编辑器；无目标不能挂画布/写作能力）。

## 7.3 2c 实现要点（2026-10-26）

- `features/agent/use-space-thread.ts`：右侧栏显示用户选的线程，否则当前项目里绑定该画布 / 文档、最近一个未解决的线程；没有就由首条消息经 `startSpaceThread` 开线程。`useAgent` 新增 `start` 钩子与 `send(text, model, canvas)`。
- `features/agent/SpaceThreadPanel.tsx`：画布与写作共用的紧凑线程视图——头部线程标题 + 状态 Badge + 线程历史 / 新线程 / 关闭；“线程 · 项目名 / 在首页查看”（经 `open-thread.ts` 打开首页线程标签）；置顶一行进度（可展开为完整清单）；消息后接紧凑决策卡；历史页按进行中 / 已完成列出本目标线程，写作历史附“文档没打开时”说明。样式在 `os.css`。
- 画布侧栏：选中节点与添加的图片 / 视频帧随消息发送；撤销按钮经 `desktop.os.undo`，仅最近一次画布修改可撤；保留宽度拖拽。写作侧栏：发送前确认编辑器可读；块菜单与 / 面板的 AI 指令照旧自动发送；撤销经主进程转给编辑器；星图共鸣点卡片在侧栏消息后显示。写作空间里文档线程只建一个钩子，侧栏和星图“寻找共鸣点”共用；编辑器的 Agent 撤销分组改按“没有线程在改这篇文档”结束。
- 紧凑输入框不显示“技能”按钮（U10）。决策卡新增“其他答案”输入（U11）：`decisionAnswerSchema` 增加 `text`（option 为 `OTHER_ANSWER = -1`），线程以 `<user_answer trust="principal">` 收到；批准与预算卡拒绝自填。Figma：Section `511:42965` 四个侧栏输入框关闭技能、两张侧栏决策卡和首页线程决策卡（`501:26883` / `501:27397`）加“其他答案”行。
- 验证（`07569b2`）：`pnpm check`、`pnpm build` 通过；完整回归 206 项中 205 通过，唯一失败为基线即存在的 `agent.spec.ts` 首页建议区几何断言（Linux 字体）。
- 测试：新增 `tests/space-agent.spec.ts`（画布侧栏：开线程、改画布、紧凑决策卡自填答案、撤销、历史 / 新线程、在首页查看；写作侧栏：改编辑器不落盘、撤销、历史说明）；`writing.spec` 改为检查侧栏空状态文案。

## 7.4 设置「用量与统计」（2026-10-26，已实现）

用户确认（2026-10-26）：

| 编号 | 决策 |
| --- | --- |
| S1 | 设置新增「用量与统计」面板，统计 Agent 的 token 消耗，分主 Agent（各项目的协调者）与子 Agent（线程，含画布 / 写作右侧栏的空间线程） |
| S2 | 旧消耗不补，从上线这一版开始统计；`threads.json` 里已有的线程累计数不导入 |
| S3 | 费用能算的显示（Pi SDK 回报的费用，美元），算不出的（如自定义中转站没有价格）显示“—” |
| S4 | 先出 Figma 评审稿，确认后再实现 |
| S5 | Figma 样式通过；费用用美元；连接测试 / 图片识别检测等不单独做卡，计入“其他”（总消耗与图表里显示） |

现状差距：`service.ts` 在 `message_end` 把总 token 累加到当轮 `run.tokens`；线程轮次结束加进 `thread.usage.tokens`（只为预算）；协调者的消耗不保存；没有输入 / 输出 / 缓存拆分、按天、按模型的记录；压缩与模型探测未计入。

方案：
1. 用量账本 `main/agent/kernel/usage.ts`：`userData/agent/os/usage/<YYYY-MM>.jsonl` 按月追加；每次模型回复一条（时间、projectId、sessionId、角色 coordinator / thread / other、threadId 与标题、服务商、模型、输入 / 输出 / 缓存读 / 缓存写、合计、费用或 null）；只存数字与 ID。记账点：`service.ts` 的 `message_end`；压缩随所属会话的角色；`model-admin` 的探测与测试记为 other。线程预算逻辑不变。
2. `os:usage` IPC：参数为范围（今天 / 7 天 / 30 天 / 全部）与项目；主进程汇总后返回总量、主 / 子 / 其他、按天、按模型、主 Agent 按项目、线程排行前 5，渲染进程不读原始文件。
3. 设置面板 `features/settings/UsageSettings.tsx`，侧栏「插件」后加「用量与统计」（Lucide ChartColumn）；新回复后节流刷新。
4. 测试：Node（追加与截断行容错、按月切分、汇总、主 / 子分开）与实窗（模拟模型跑协调对话 + 线程后面板数字一致）。

分步：U1 Figma（已出，见 design.md）→ 用户确认 → U2 账本 + IPC + Node 测试 → U3 面板 + 实窗测试 + 记忆更新。

实现要点：
- 记账点统一在 `runtime.ts` 的 `streamFunction` 包装里：每个模型请求结束（done / error）且有 token 时调 `onUsage(usage, priced)`；上下文压缩也走这里（Pi 的压缩用 `agent.streamFunction`）。`priced` = 非自定义服务商且 SDK 模型有单价，否则费用记 null。
- `kernel/usage.ts` `UsageLedger`：每次追加都以换行开头，崩溃截断的行读取时跳过；`summary` 按本地日期计算范围（今天 / 7 天 / 30 天 / 全部），“全部”超过 31 天按月分桶；`since` 取最早月份文件里的第一条。线程 / 项目名在查询时按当前注册表解析，已删除的显示“已删除的线程 / 项目”。
- `AgentOs.recordUsage`（协调者 / 线程，带 projectId 与 sessionId）与 `ModelAdmin.onUsage`（角色 other）；写盘失败不影响轮次。`os:usage` → `AgentOs.usageSummary`，类型在 `shared/agent-usage.ts`，桥 `desktop.os.getUsage`。
- 界面 `features/settings/UsageSettings.tsx`：设置侧栏「插件」后的「用量与统计」（`ChartColumn`，已加入 `@jarvis/ui/icons`）；快照变化后 2 秒内刷新；子 Agent 色为 `bg-accent/40`，其他为 `bg-fg-tertiary/50`（有其他时图例才显示）；线程行点开首页线程标签（`openThread`），已删除的线程不可点。总消耗：全部无价格时只写“N 个模型无价格”。
- 测试：`tests/os-usage.spec.ts`（账本按月、截断行、范围与分桶、项目筛选、空账本；Agent OS 实跑协调者 + 线程分开计数、中转站费用为 null）；`tests/usage-ui.spec.ts`（空状态、对话后统计卡 / 按模型 / 按项目 / 7 根柱、切换今天与项目、深色截图、点线程打开）；`tests/helpers/os-relay.ts` 新增可选 `usage`。内置服务商的计价路径没有离线测试（需要真实服务商）。

## 8. 变更记录

- 2026-10-26：建立本文件，记录用户确认的 U1–U4 与方案 A/B/C。
- 2026-10-26：完成 1a 后端与过渡 UI、1b Figma 评审稿；验证结果见第 7 节。
- 2026-10-26：用户确认 U5–U9；写入第二批方案（第 6 节，待确认）。
- 2026-10-26：完成 1c（首页 UI、U6 画布改名、U7 去掉新对话、U8 系统通知）；验证见第 7.1 节。
- 2026-10-26：用户通过右侧栏 Figma（U10）并要求决策卡可自填答案（U11）；完成 2c（第 7.3 节）。
- 2026-10-26：完成 2a 后端（第 7.2 节）与 2b Figma 右侧栏评审稿（见 design.md），2c 待用户评审 Figma 后实现。
- 2026-10-26：用户确认第二批方案（含“未打开文档按可撤销写盘”）并告知 develop 有写作空间 W1–W6 新功能。已合并 origin/develop `cc331ee`：旧 `service.ts` / `report.ts` / `writing-agent.spec.ts` 保持删除（旧写作 Agent 用例留作第二批参考）；星图拖线关联与撤销、改名/移动改由 AgentOs 处理（`os/spaces.ts`：画布/写作命令中转、各窗口打开的画布与文档、关联专用账本 `os/link-ledger`），画布与写作命令回执通道恢复。写作右侧栏与星图“寻找共鸣点”在第二批线程接回前保持不可用。合并后 `pnpm check`、`pnpm build` 通过；写作 / Agent / 外壳相关实窗 94 项中 93 通过，`updates.spec.ts:179` 单独复跑通过（时序抖动）。
- 2026-10-26：用户确认设置「用量与统计」方案 S1–S4（第 7.4 节），先出 Figma 评审稿。
- 2026-10-26：用户通过「用量与统计」Figma 并确认 S5；完成实现（第 7.4 节）。
