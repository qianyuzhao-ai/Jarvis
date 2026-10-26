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

- `kernel/`（纯代码，无 LLM）：`event-log` 事件日志、`mailbox` 邮箱与限流、`wakes` 唤醒调度、`decisions` 决策卡与批准凭据、`memory` 项目记忆、`policy` 策略流水线、`scheduler` 带优先级的并发槽、`ledger` 账本、`capability` 能力包接口。
- `os/`：`projects` 项目与线程元数据、`harness` 会话运行器（一轮处理一个唤醒）、`coordinator` 协调者提示词与工具、`thread` 线程提示词与工具、`service` 对外门面、`bridge` IPC。
- `packs/`：沿用 files、calendar、mcp、writing-library、navigation、skills；画布/写作/生成能力包保留文件，第二批接回线程。

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
| 1b 设计 | Figma：项目对话与线程卡片、线程视图与进度清单、Overview、决策卡、项目设置（浅/深） | 已完成，待用户评审 |
| 1c UI | Figma 经用户确认后实现首页 UI；画布/写作右侧栏已显示“即将接入” | 待用户确认 Figma；当前为过渡 UI |
| 2 | canvas / writing / generation 能力包接回线程，恢复右侧栏 Agent | 待做 |

## 6. 1a 实现要点（2026-10-26）

- 代码：`main/agent/kernel/`（event-log、memory、decisions、wakes、mailbox、scheduler 优先级、policy 流水线、tool）、`main/agent/os/`（projects、service、prompts、coordinator-pack、thread-pack、memory-pack、model-admin）、`main/agent/bridge.ts`（`os:*` IPC）、`shared/agent-os.ts`（类型与 `desktop.os` 桥）。删除旧 `service.ts`、`store.ts`、approval/bus、agent-control/handoff/report 能力包。
- 存储：`userData/agent/os/`；旧 `agent/index.json` 与 `sessions/` 不读不改（U4）。模型、技能、MCP、日历、通用设置文件沿用 `userData/agent/`。项目首次发消息（或在设置里首次添加目录）时才创建；项目自带“项目文件”目录。
- Coordinator 每轮用内存会话（不保留模型上下文），只读工具：线程管理、项目记忆读写（决定 C）、目录列出/搜索、日历查询、技能。线程用持久 Pi 会话，挂全部只读能力；写能力按任务书或 `request_capability` 挂载，策略引擎照常判级。
- 不可逆操作：生成决策卡并拦截本次调用；用户在卡片上批准后发放一次性凭据（工具名 + 参数哈希），线程被唤醒后原样重试才放行。无 5 分钟超时，2 小时后提醒一次。relay 消息、Coordinator 转达都不能批准。
- 唤醒：`send_later` / `create_routine`（5 字段 cron）/ `subscribe`（日程临近、项目目录文件变化，30 天失效）；应用关闭期间到期的在启动时补触发并标注。崩溃中断的线程轮次启动后以 resume 唤醒续跑；Coordinator 中断的那条消息重新处理；排队消息跨重启保留。
- 与方案的差异：用户在任务里明确要求的不可逆步骤仍需在决策卡上点一次（内核无法从文字判断“已批准”，按最严格处理）；邮件订阅、线程内子 Agent、共享任务列表（B6）未做。
- 过渡 UI（Figma 确认前）：首页每个对话 = 一个项目的协调对话；侧栏“线程”列出未解决线程，点开即线程对话；决策卡暂用 AlertDialog 逐张显示（可“稍后”）；“设置 - 文件与权限”作用于当前项目；画布/写作右侧栏显示“即将接入”。
- 验证：`pnpm check`、`pnpm build` 通过；后端测试 38 项通过（os-kernel 7、os-flow 6，其余为移植的并发/引导/策略/模型/日历/文件/MCP/技能等）。完整实窗回归在 Linux 容器内 166/167（安装 gnome-keyring 并临时改 Playwright 的 password-store 参数，验证后已还原）；唯一失败为 `agent.spec.ts:153` 首页建议区几何断言，在基线提交 `48d698e` 上同样失败（Linux 字体度量），不是本次改动造成。
- Figma（文件 `mIwnyR5nAlECFMam1NvmER`，页 V1-视觉换新）：Section `493:41564`「V1.0.0 · Agent OS（待评审）」6 张：项目对话浅 `493:41565` / 深 `493:41745`、线程浅 `493:41610` / 深 `493:41790`、Overview `493:41655`、项目设置 `493:41700`。全部为 V1 组件实例与可编辑文字，0 图片填充，字体 SF Pro。

## 7. 变更记录

- 2026-10-26：建立本文件，记录用户确认的 U1–U4 与方案 A/B/C。
- 2026-10-26：完成 1a 后端与过渡 UI、1b Figma 评审稿；验证结果见第 6 节。
