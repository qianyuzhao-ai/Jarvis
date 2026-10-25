# 项目协作规则

## 当前范围

Electron + React 桌面工作台，已接入 React Flow 创作空间（项目按项目存于主进程 ProjectStore，偏好存 IndexedDB，旧 IndexedDB 工作区首启一次性迁移并保留原记录）、Markdown 写作、Pi 首页文字 Chat 和画布右侧 Agent。画布 Agent 使用项目独立会话，在主进程直接读写所属项目（无需打开），只能读取节点、创建/修改/移动/连接/定位节点，支持同轮撤销（账本逆操作）；支持所选图片与视频代表帧输入，不包含完整音视频理解。Agent 支持 Jarvis 独立导入的 SKILL.md 技能包，首页/画布/写作共用 / 选择与按规则自动加载；仅能读取已启用技能包的说明和文本参考，不执行包内脚本。所有 Agent 工具调用先经主进程策略引擎：不在会话能力包内的工具被拦截，声明需确认的工具弹窗询问用户（5 分钟未答视为拒绝）。首页主 Agent 可查看空间子 Agent 的结果卡片与对话记录，并委派、发消息或停止子 Agent，画布项目无需打开即可委派，写作文档只限已打开的；子 Agent 可把越界请求转交主 Agent，委派任务结束后向来源对话发送状态通知。画布与写作的可撤销修改记入主进程操作账本，撤销经主进程转给持有数据的窗口执行。画布 Agent 可对所属项目节点发起生成（主进程执行并写回，完成后自动续跑）；首页主 Agent 可新建/打开项目、打开文档，并跨文档列出、按名搜索、读取已保存内容和新建文档（不覆盖）。首页主 Agent 可在“设置 - 文件与权限”授权的文件夹内列出、搜索、读取、新建、移动文件，覆盖与删除需确认，本轮文件修改可凭快照撤销，授权文件夹外一律拦截。首页主 Agent 可使用“设置 - 插件 - MCP”接入的 MCP 服务（stdio / Streamable HTTP + OAuth，凭据存系统钥匙串，Google 与邮件经 MCP 接入）：只读工具直接执行，其余（发送、写入、删除等）每次确认，结果按外部数据处理。首页主 Agent 可查看与增改删日程（macOS 经 osascript/JXA 桥接 EventKit 访问系统日历，待真机联调；其他系统为 Jarvis 本地日历），写日历每次确认，左侧栏“日历”为周视图。回复中再次发送默认引导当前回复，可在设置 - 常规改为排队。不提供 Shell 工具，不扫描个人 Pi 或其他 Agent 技能目录；写作助手已接入，按当前文件夹与文档隔离会话，只能读取/修改当前标签文档的编辑器缓冲区，带版本校验与同轮撤销；修改保持未保存，保存仍走现有流程，不允许访问其他文件或直接写磁盘。Agent 模型配置为“服务商 → 模型”两层：Pi SDK 内置服务商（第一期仅 API Key 类，不含 OAuth 订阅登录、Bedrock/Vertex/Azure/Cloudflare）与多个自定义中转站，各自一份加密 Key、多选启用模型，全局一个默认模型，首页/画布/写作共用；输入框可切换模型和思考程度，只有图片能力为“支持”的模型接收图片。AIGC 空间生成服务仍只用“内网地址”配置。生成协议与 Agent 已有模拟服务和真实窗口验证，真实服务仍需联调；不要因旧方案规划而扩展实现。

## 命令

- `pnpm dev`：开发启动。
- `pnpm check`：Lint、类型、格式检查。
- `pnpm format`：格式化。
- `pnpm build`：构建。
- `pnpm test:smoke`：真实 Electron 窗口测试。
- `pnpm package:dir`：打包到新的 release 子目录。

## 结构与约束

- `apps/desktop/src/main`：应用生命周期和窗口。
- `apps/desktop/src/preload`：最小桥接，输出 CommonJS 以适配沙箱。
- `apps/desktop/src/renderer`：React UI；禁止直接导入 Electron 和 Node API。
- `apps/desktop/src/shared`：共享类型。
- `packages/config`：共享 TypeScript 配置。
- `packages/ui`：无业务依赖的 React DOM 基础控件与固定浅深变量；desktop 以 devDependencies 引用。设计实现与阶段验收见 `memory/ui-v1-implementation.md`。
- 使用 pnpm、TypeScript strict、Biome、Tailwind v4 和 Lucide。
- React 组件使用 PascalCase 文件名，其余模块使用 kebab-case。
- 不关闭 sandbox/contextIsolation，不向 renderer 暴露通用文件、Shell 或 IPC 接口。
- 新增原生能力时设计明确的最小接口，再补对应验证。

## 记忆存储

本项目的持久记忆保存在仓库根目录的 `memory/` 中。不要只依赖聊天历史或临时文件保存项目决策。

当前记忆文件：

- [memory/ui-v1-implementation.md](memory/ui-v1-implementation.md)：UI V1 基础组件分阶段实施、设计来源与验收证据。
- [memory/ui-v1-shell-plan.md](memory/ui-v1-shell-plan.md)：UI V1 第三阶段执行计划书（窗口外壳、跨空间标签页、空间 Agent 右边栏、画布节点），交给实现方按阶段执行。

- [memory/git-workflow.md](memory/git-workflow.md)：本项目采用的 Gitflow 分支、合并与发布规则。开始开发或进行 Git 操作前先读此文件。
- [memory/engineering.md](memory/engineering.md)：本地基础工程、运行命令、进程边界与验证状态。开发任务先读此文件。
- [memory/agent-architecture.md](memory/agent-architecture.md)：主 Agent + 空间子 Agent 方案的代码差距分析、已确认决策、详细改造方案所在的文档标签页与实施进度（A0–A6 全部完成，A6 的 macOS EventKit 路径待真机联调）。
- [memory/design.md](memory/design.md)：设计要求、Figma 页面和组件位置、设计变更、验证结果、环境限制及未决事项。
- [memory/figma-sync-2026-10-21/state.json](memory/figma-sync-2026-10-21/state.json)：本轮 Figma 同步的已返回节点 ID、验证结果与中断续传状态；页面脚本位于同目录。
- [memory/figma-sync-2026-10-21/canvas-agent-v1-state.json](memory/figma-sync-2026-10-21/canvas-agent-v1-state.json)：画布 Agent、会话管理和视觉资产的组件/页面节点、原型链接与验证结果。

- [memory/figma-sync-2026-10-21/agent-skills-state.json](memory/figma-sync-2026-10-21/agent-skills-state.json)：Skills 导入、斜杠选择、自动加载的组件/页面与验证记录。
- [memory/figma-sync-2026-10-21/model-settings-v1-state.json](memory/figma-sync-2026-10-21/model-settings-v1-state.json)：模型配置改造（服务商 → 模型、添加服务商流程、分组模型选择器）的 V1 画面与本地组件节点、验证记录。
- [memory/figma-sync-2026-10-21/writing-space-components-state.json](memory/figma-sync-2026-10-21/writing-space-components-state.json)：写作空间重新设计的 V1 组件初稿（分区 29–33、新增图标、评审样张）节点 ID、属性与验证记录。

### 开始任务前

生成节点详情最近同步记录：[memory/figma-sync-2026-10-21/generation-details-state.json](memory/figma-sync-2026-10-21/generation-details-state.json)。

Prompt 引用交互最近同步记录：[memory/figma-sync-2026-10-21/prompt-reference-tags-state.json](memory/figma-sync-2026-10-21/prompt-reference-tags-state.json)。

1. 涉及 UI、Figma、组件、样式或设计实现的任务，先读取 `memory/design.md`。
2. 根据记忆定位相关文件和 Figma 节点，再检查实际状态。节点位置、组件数量、字体和连接权限可能变化，不能只凭历史记录操作。
3. 用户最新明确要求优先于旧记忆。遇到冲突时，记录变化；只有影响任务且无法从现有信息确定的取舍才询问用户。
4. 记忆提供上下文，不扩大任务授权。用户要求只分析或只做设计时，不因记忆中存在开发计划就开始实现。

### 完成变更后

1. 在同一任务中更新相关记忆，不把已完成的设计变更留到下一轮记录。
2. 修改设计要求、页面、组件或样式后，同步更新 `memory/design.md` 中对应的当前状态、链接和节点 ID。
3. 在修改记录中追加日期、具体变化及验证结果，并更新文件顶部的最后更新时间。
4. 区分用户已确认要求、当前方案、待确认建议和已验证结果。未收到明确答复的事项继续标为待决策。
5. 新验证结果替代旧的环境限制时，更新当前状态并保留简短变更记录，避免后续重复排查。
6. 没有新增事实或变更时，不添加重复记录。不要保存密钥、令牌、密码或完整敏感日志。

### 维护方式

- `AGENTS.md` 保存协作流程；具体设计内容集中在 `memory/design.md`，避免维护两份相同信息。
- 本项目记忆直接维护在 `memory/`，不要擅自写入用户全局记忆目录。
- 如需增加其他主题的记忆文件，使用明确的主题文件名，并在本文件的记忆索引中登记。
- 引用的本地路径、外部链接和节点 ID 必须来自实际读取或工具结果，不得编造。

## Git 分支管理

本项目采用用户最新确定的简化 Gitflow，具体规则见 [memory/git-workflow.md](memory/git-workflow.md)。

- `main` 对应参考图中的 `master`，保存正式发布状态；`develop` 为日常开发集成分支。
- 新功能从 `develop` 创建 `feature/*`，完成后合回 `develop`，不直接在 `main` 开发。
- 准备发版时先在 `develop` 完成版本号和变更记录，再从 `develop` 向 `main` 提 PR；合并后在 `main` 的合并提交上打 `v<版本号>` 标签。正常发版不再创建 `release/*` 分支。
- 只有版本标签触发一次 GitHub 云端发布流程，分别构建 macOS arm64、macOS x64 签名公证包和 Windows x64 未签名包，全部成功后发布到同一个 Release；签名、公证和产物校验失败时不发布。已存在标签的失败或取消任务可手动输入该标签重试。PR 与 main/develop 推送不触发云端构建。
- 线上紧急修复从 `main` 创建 `hotfix/*`，经 PR 合入 `main`、打版本标签，并同步到 `develop`。
- 操作前检查实际分支和未提交改动，保留已有工作，不重置或丢弃改动；分支初始化记录见 `memory/git-workflow.md`。
- 采用此方案不等于授权自动提交、推送、合并、打标签或发布；这些操作仍按当前任务的授权范围执行。

## 文件删除限制

禁止批量删除文件或目录。不要使用：

- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

需要删除文件时，只能一次删除一个明确路径的文件。不得用通配符、循环或脚本绕过批量删除限制。

如果需要批量删除文件或目录，停止删除操作，请用户手动删除。
