# 项目协作规则

## 当前范围

Electron + React 桌面工作台，已接入 React Flow 创作空间与 IndexedDB 本地保存。尚未接入 Pi Agent 或真实生成服务；不要因为旧方案存在规划而自动扩展实现。

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
- 使用 pnpm、TypeScript strict、Biome、Tailwind v4 和 Lucide。
- React 组件使用 PascalCase 文件名，其余模块使用 kebab-case。
- 不关闭 sandbox/contextIsolation，不向 renderer 暴露通用文件、Shell 或 IPC 接口。
- 新增原生能力时设计明确的最小接口，再补对应验证。

## 记忆存储

本项目的持久记忆保存在仓库根目录的 `memory/` 中。不要只依赖聊天历史或临时文件保存项目决策。

当前记忆文件：

- [memory/git-workflow.md](memory/git-workflow.md)：本项目采用的 Gitflow 分支、合并与发布规则。开始开发或进行 Git 操作前先读此文件。
- [memory/engineering.md](memory/engineering.md)：本地基础工程、运行命令、进程边界与验证状态。开发任务先读此文件。
- [memory/design.md](memory/design.md)：设计要求、Figma 页面和组件位置、设计变更、验证结果、环境限制及未决事项。
- [memory/figma-sync-2026-10-21/state.json](memory/figma-sync-2026-10-21/state.json)：本轮 Figma 同步的已返回节点 ID、验证结果与中断续传状态；页面脚本位于同目录。

### 开始任务前

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
- 只有版本标签触发一次 GitHub 云端 macOS arm64 构建；已存在标签的失败或取消任务可手动输入该标签重试。PR 与 main/develop 推送不触发云端构建。
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
