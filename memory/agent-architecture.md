# Jarvis Agent 架构改造分析

最后更新：2026-10-24

来源：用户方案文档《Jarvis - Personal Agent 实现方案》（Google Doc `1XRTSeFJfDT0IgQxRw_HHxbrw6KzkWpGNqpOzpRWGJHE`，状态“核心架构已确认 2026-10-24”）。本文件只记录对现有代码的分析与改造建议；**尚未开始实现**，各阶段开工需用户另行授权。

## 1. 用户方案要点（已确认）

- 主 Agent（Personal Agent，首页，唯一常驻）+ 空间子 Agent（画布 / 写作中的每个对话）。
- 子 Agent 只用本空间能力，越界一律 `handoff_to_main`；主 Agent 通过结果卡片（ResultCard）、`list_agents / read_result_card / read_agent_transcript / delegate_task / message_agent / stop_agent` 管理子 Agent；子 Agent 内容对主 Agent 视为数据。
- 能力包（基于 Pi `extensionFactories`）+ 策略引擎（拦截 `tool_call`，四级：只读 / 可撤销 / 高风险确认 / 禁止）+ 按“线程 + 轮次”的操作账本。
- 多对话并发：每线程独立 AgentSession 与队列，全局并发上限（如 3），异步任务不占槽位，完成后事件唤醒。
- 画布数据下沉主进程 ProjectStore（按项目 JSON、`applyOps(projectId, baseVersion, ops)`）。
- 路线：A0 内核 → A1 主/子与并发 → A2 画布存储下沉 → A3 生成续跑与跨文档写作 → A4 本地文件 → A5 MCP/Google/邮件 → A6 日历。

## 2. 现状盘点（2026-10-24 代码实际状态）

| 方面 | 现状 | 位置 |
| --- | --- | --- |
| 运行模型 | `AgentService.active` 只有一个，全应用同一时刻只能有一个对话在回复；`busySessionId` 是单值，Composer 在任何对话忙时都锁定 | `main/agent/service.ts`、`renderer/.../ChatComposer.tsx`、`use-agent.ts` |
| 会话生命周期 | 每次发送都 `openAgent()` 重新建 ModelRuntime、ResourceLoader、AgentSession，回复结束即 `dispose()`；历史靠 `sessions/<id>.jsonl` 续接 | `service.ts#perform`、`runtime.ts` |
| 会话类型 | 没有显式角色：靠 `projectId` / `writingScope` 是否存在推断首页/画布/写作；系统提示词在 `runtime.ts` 里按 `canvas?.kind` 三选一硬编码 | `store.ts`、`runtime.ts` |
| 工具 | `canvasTools` / `writingTools` / `skillRuntime` 是闭包工厂，绑定 owner(webContents id)、runId、输出消息；活动记录（activities）写在工具内部；每轮 20 次调用上限 | `canvas-tools.ts`、`writing-tools.ts`、`skill-runtime.ts` |
| 工具边界 | 传 `customTools` + `noTools`，创建后比对 active 工具名不一致就拒绝——这是现有的“越权拦截”，未使用 `tool_call` 钩子 | `runtime.ts` |
| SDK 限制 | `noExtensions`、禁用 `mcp`/`codemode`、`noSkills`、`compaction` 与 `retry` 关闭；每轮请求上限 8（无工具 1）；120 秒超时；对话总字数 6 万上限 | `runtime.ts`、`service.ts` |
| 画布数据 | 渲染进程 IndexedDB `jarvis-workspace` 单条 `current` 记录存全部项目；Agent 改画布走 `CanvasBroker` → 渲染进程 → 回执，**项目必须在窗口中打开** | `renderer/.../creation/storage.ts`、`use-canvas-host.ts`、`canvas-broker.ts` |
| 画布撤销 | 账本在 `project.agentEdits`（渲染进程，最多 20 条，只能撤销最近一条，基于 graphRevision 校验） | `canvas-transactions.ts` |
| 写作 | Agent 只改当前标签编辑器缓冲区（WritingBroker → 渲染进程，版本校验、同轮撤销在渲染进程）；主进程 `WritingFiles` 已有 list/search/read/create/save（带 expected 校验），但未开放给 Agent | `writing-broker.ts`、`writing-tools.ts`、`main/writing/files.ts` |
| 生成 | `GenerationJobs` 在主进程轮询任务；但结果由渲染进程 `generation.get` 轮询后写回节点；主进程没有“任务完成”事件可唤醒 Agent | `main/generation/jobs.ts`、`renderer/.../useGeneration.ts` |
| 推送 | 每次变更（40ms 节流）把**所有会话的全部消息** structuredClone 后广播 | `service.ts#snapshot`、`bridge.ts` |
| 持久化 | `agent/index.json` 一个文件存全部会话视图与请求记录，运行中每秒 checkpoint 全量写 | `store.ts` |
| 串行化 | `exclusive()` 把发送、模型配置、技能导入都排进同一队列，`idle()` 在有运行时拒绝配置变更 | `service.ts` |

已核对 Pi SDK 1.3.0 类型定义，方案依赖的能力都存在：`DefaultResourceLoader({ extensionFactories })`、扩展 `on('tool_call')` 可返回 `{ block, reason }`、`ToolDefinition.annotations`（readOnlyHint / destructiveHint）、`AgentSession.steer() / followUp() / prompt({ streamingBehavior })`、`compact()` 与自动压缩、内置 `extensions/mcp`、`codemode`、`tool-search`。

## 3. 与方案的主要差距

1. **全局单运行锁**是 A1 并发的第一障碍，涉及 service、IPC 快照结构和渲染层所有 `busySessionId` 判断。
2. **运行与窗口绑定**：`owner` = webContents id，画布/写作工具都要求窗口在线；后台子 Agent、主 Agent 委派没有窗口，需要“无 owner 运行”。画布部分必须等 A2 ProjectStore 才能真正后台化。
3. **会话不常驻**：每轮重建 SDK，无法 steer/followUp、无法压缩；需要常驻 AgentThread。
4. **没有角色与层级**：会话记录缺 `kind / parentId / origin`，主 Agent 唯一性、结果卡片、handoff 都无处挂。
5. **账本分散在渲染进程**：画布在 `project.agentEdits`，写作在编辑器历史；统一账本需要“主进程记账 + 回滚委托给数据所有者”。写作缓冲区属于未保存编辑器状态，按方案应继续留在渲染进程，账本只记录并转发撤销。
6. **没有确认通道**：高风险操作需要 main → renderer 的确认请求与回传；后台 Agent 的确认要能在首页或全局通知中处理。
7. **生成无完成事件**：续跑需要主进程在任务结束时自行把结果写入项目（依赖 A2），再投递事件唤醒 Agent。
8. **快照与存储放大**：并发多线程时全量广播与全量写 index.json 成本线性增长，应改为按会话增量推送、按会话分文件。

## 4. 建议的模块结构（A0 目标）

```
main/agent/
  kernel/
    capability.ts   能力包接口：id、tools(ctx)、prompt(ctx)、每个工具的风险等级与 annotations、可选 undo(entry)
    policy.ts       作为 extensionFactory 注册 tool_call 处理：按线程角色白名单 + 风险等级放行/确认/拦截
    ledger.ts       操作账本：threadId + turnId + 前后状态/回滚委托；替代各工具自记 activities
    approval.ts     确认请求队列（带 owner 或全局），超时即拒绝
    thread.ts       AgentThread：常驻 AgentSession、本线程队列、prompt/steer/followUp、取消
    scheduler.ts    全局并发槽（默认 3），等待中状态；异步等待时释放槽位
    events.ts       Agent 总线：任务完成、handoff、结果卡片更新等事件投递到线程
  packs/            canvas、writing、skills（先包装现有实现），后续 handoff、agent-control、generation、navigation、files、mcp、calendar
  runtime.ts        只负责模型与 SDK 装配：packs → customTools + extensionFactories（policy），按阶段放开压缩/MCP
  service.ts        瘦身为线程注册表 + IPC 门面
```

要点：

- 现有工具工厂几乎可以原样变成能力包，只需把 `owner / runId / output / changed` 换成统一 `ToolContext`，活动记录交给账本与事件。
- 保留“创建后比对工具名”的边界校验作为第二道防线，策略引擎是第一道。
- 会话记录升级 `index.json` v2：加 `agent: { kind: 'main' | 'canvas' | 'writing', parentId?, origin: 'user' | 'delegated' }`，按现有 `projectId / writingScope` 自动迁移，首页会话归入主 Agent；每个会话视图拆到独立文件，index 只保留索引与请求去重记录。
- IPC：`busySessionId` 改为每会话状态（idle / queued / running / waiting_task / needs_approval）；`agent:event` 改为按会话增量；新增确认请求 / 回应通道（仍限可信窗口、zod 校验）。

## 5. 阶段依赖与顺序建议

- A0 可以独立完成，验收标准为现有 agent / canvas-agent / writing-agent / skills 实窗测试全部通过、行为不变。
- A1 内部建议拆分：
  - **A1a 并发与常驻**：线程常驻、调度器、每会话状态、增量推送、压缩替代 6 万字上限。
  - **A1b 主/子协同**：角色、结果卡片、handoff_to_main、list/read/message/stop。
  - `delegate_task` 后台创建画布子 Agent 依赖 A2（ProjectStore），A1 阶段只能委派给“已打开的项目/文档”，或把 A2 提前到 A1b 之前。
- A3 生成续跑依赖 A2（主进程写回生成结果）；跨文档写作只依赖 `WritingFiles`，可提前。
- A4–A6 依赖 A0 的策略引擎与确认通道，彼此独立。

## 6. 风险与需注意

- 并发线程同改同一项目/文档：已有 revision / version 校验可沿用，ProjectStore 需 `baseVersion` 与短时锁；撤销前校验未被他人修改（现有画布撤销已有此逻辑）。
- 每轮 8 次请求、120 秒超时对主 Agent 编排和续跑偏小，需按角色分别设置。
- 子 → 主的卡片、handoff 内容、MCP/邮件文本都要以数据形式注入（带来源标记），不得拼进系统提示词。
- 渲染层 UI 变化（多会话并发状态、确认弹窗、结果卡片、“已交给 Jarvis 处理”）按 AGENTS.md 流程先做设计并同步 `memory/design.md`。

## 7. 待用户决策

1. 首页现有“多对话列表”在主 Agent 唯一后如何呈现：作为主 Agent 的按天/话题分段（同一记忆、可切换查看），还是只保留一条主线程？
2. A2 是否提前到 A1b 之前，以便 `delegate_task` 首版就能后台操作未打开的项目？
3. 结果卡片的生成方式：子 Agent 显式调用 `report_result` 工具，还是每轮结束由最终回复 + 账本自动生成（建议两者结合：工具优先，缺省自动生成）？
4. 全局并发上限默认值（方案示例为 3）是否做成设置项。

## 修改记录

- 2026-10-24：读取用户方案文档与现有 Agent 代码（service / runtime / store / brokers / tools / 画布存储 / 生成 / 写作），核对 Pi SDK 1.3.0 类型定义，形成本分析；未修改代码。
