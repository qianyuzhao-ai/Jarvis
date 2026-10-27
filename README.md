# Jarvis

个人工作台桌面应用。首页提供项目协调者与任务线程，AIGC 画布和本地 Markdown 写作空间通过右侧栏接入对应线程。

当前源码版本：`1.0.3`，功能和验证边界见 [版本记录](CHANGELOG.md)。

[v1.0.3 预发布版](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v1.0.3) 已发布：优化画布多节点拖动，增加助手 Markdown 回复，并调整聊天、画布菜单和窗口交互。三平台依赖、实际启动与更新清单校验通过，12 个资产已核对；macOS arm64/x64 签名公证，Windows x64 未签名。

[v1.0.2 预发布版](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v1.0.2) 已发布：新增画布节点复制粘贴，恢复视频原生控件，并修复菜单、生成按钮、聊天回到底部和标签栏布局。三平台依赖、实际打包启动和更新清单验证通过；macOS arm64/x64 签名公证，Windows x64 未签名。12 个资产已核对。

[v1.0.0 预发布版](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v1.0.0) 已发布，包含 Agent OS 和写作空间升级。macOS arm64/x64 签名公证包与 Windows x64 未签名包均通过云端实际启动，12 个资产已核对。旧版 Agent 对话不迁移，原记录保留在磁盘。

[0.4.0 预发布版](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.4.0) 已发布：包含 Agent 委派、工具权限与操作撤销、授权文件夹、MCP、日历和并发设置，以及 V1 遗留界面迁移与首页建议布局修复。macOS arm64、Intel x64 和 Windows x64 均通过云端打包应用启动验证；两种 macOS 包通过签名、公证和 Gatekeeper，Windows 安装器未签名。macOS 最低系统目标为 13.0，真实日历授权、13 实机与真实版本升级仍待验收。

## 启动

使用 pnpm 11.24.0。项目通过 `devEngines.runtime` 管理 Node.js 22.23.3，不改变全局 Node；首次安装需要联网下载依赖和运行时。运行检查前确认实际 `node --version` 为 22.23.3；若现有 PATH 仍落到旧 Node，请先在当前终端切换运行时，避免测试加载器兼容问题。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 打开 Electron 窗口，并启动仅监听 `127.0.0.1:5173` 的开发服务器。关闭开发任务使用终端 `Ctrl+C`。

## 当前范围

- Electron + electron-vite + React + TypeScript strict，使用 pnpm workspace、Turborepo、Biome、Tailwind CSS v4 和 Lucide。
- V1 浅深主题、跨空间标签页和可调宽侧栏。主进程、preload、renderer 分离，启用沙箱和上下文隔离，renderer 不开放 Node API。
- Agent OS 按项目提供协调对话、任务线程、Overview 和目录权限。协调者拆解任务、委派线程和汇总结果，线程展示进度、结果和需要用户处理的决策。
- 线程支持问题卡、自填答案、不可逆操作批准、预算、定时任务和事件唤醒。旧版 Agent 对话不迁移，旧文件保留；模型、技能、MCP 和通用设置沿用。
- React Flow 创作空间支持图像/视频节点、参考素材、模型参数、节点连线、生成与导出。画布由主进程 ProjectStore 保存，旧 IndexedDB 工作区首次迁移后保留原记录。
- 写作空间支持全格式目录、跨文件夹标签、文件改名/移动/副本、单文件及空文件夹移入废纸篓；图片、PDF、音视频通过只读资产协议预览。
- Markdown 提供块编辑与源码视图、未编辑块原文保留、斜杠命令、Callout、折叠、代码高亮、Mermaid、思维导图、表格、图片、双链与星图。共鸣点关联需要用户确认。
- 画布和写作右侧栏使用绑定目标的线程，支持历史、决策、撤销和转到首页查看。打开文档的 AI 修改留在编辑器缓冲区；未打开的授权 Markdown 文档按版本校验写盘。

在“设置 → 模型服务”配置服务商、API Key、启用模型及默认模型，首页与空间线程共用。密钥在主进程加密保存；只有图片能力标为支持的模型能接收选中图片和视频代表帧，不提供完整音视频理解。

内网生成、上传及登录地址默认为空，需在设置中填写。生成任务由主进程提交并查询，保存平台任务 ID，登录失效后暂停查询；不能确认是否接单时保留结果未知，不自动重复提交。

技能通过独立导入的 `SKILL.md` 包提供说明与文本参考，支持 `/` 选择和按规则加载，不执行包内脚本。MCP 支持 stdio、Streamable HTTP 与 OAuth；外部结果作为数据处理，写入、发送和删除需要决策批准。应用不提供 Shell 工具，也不扫描个人 Pi 或其他 Agent 技能目录。

macOS 日历使用 EventKit 桥接，其余系统使用本地日历。真实日历授权、通知、服务商、外部 MCP、内网服务及系统版本兼容性尚需目标设备验证。各阶段通过项与未通过项见 `memory/` 下的工程及实施记录。

画布操作：滚轮/触控板平移，Ctrl/⌘ + 滚轮缩放，中键或右键拖动平移；点击节点打开编辑面板，点击空白或 Escape 关闭，Delete/Backspace 删除选中节点。右下角可切换缩略图、点阵和吸附。

## 常用命令

| 命令               | 用途                                 |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | 开发模式启动桌面应用                 |
| `pnpm check`       | Lint、类型和格式检查                 |
| `pnpm format`      | 格式化工程文件                       |
| `pnpm build`       | 构建主进程、preload 和 React 页面    |
| `pnpm start`       | 打开已经构建的应用，首次先运行 build |
| `pnpm test:smoke`  | 构建并启动真实 Electron 窗口进行测试 |
| `pnpm package:dir` | 构建并打包当前平台的本地应用         |

打包每次输出到新的 `release/<唯一标识>/`，测试结果在 `apps/desktop/test-results/<唯一标识>/`，构建不自动清空旧输出。需要清理时遵守 `AGENTS.md` 的删除限制。修改依赖后主动执行 `pnpm install`，命令运行前不自动重装依赖。

[0.2.3 安装包](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.3) 已发布，包含新平台任务接口、5 秒轮询、统一登录入口和登录过期后的任务续查。Windows x64 和 macOS arm64 均已在云端实际启动打包应用，ASAR 页面、设置/更新桥接及 360 项必需依赖检查通过；macOS 正式签名、公证、目录及 ZIP/DMG 内应用的票据和 Gatekeeper 也已通过。Windows 安装器仍未签名；用户已验证 Windows 发现新版本、点击更新及重启安装流程可用。真实第三方服务和 macOS 实机自动升级仍需后续验收。

**0.2.0 用户请手动安装 0.2.3：** 0.2.0 因遗漏 debug 等运行时依赖可能启动即崩溃，无法通过应用内更新自救。0.2.1 已修复依赖收集，并加入发布前实际启动门禁。

## 应用内更新

- 通过公开的 GitHub Releases 检查更新，包含预发布版本，拒绝降级。正式安装包启动 15 秒后检查一次，此后每 4 小时检查；“设置 → 关于 Jarvis”提供手动检查。
- 点击“下载更新”后显示百分比、已下载/总量和速度；失败可重试。下载完成不会自行安装，普通退出也不会触发安装。
- 点击“重启并安装”后由原生对话框确认，再保存项目和写作文档。未保存设置、写作冲突、任务仍在运行或保存失败会阻止安装。窗口关闭后才交给安装器；安装器交接失败会恢复窗口显示错误。
- 关于 Jarvis 显示完整更新面板，其他页面提供更新提醒。开发模式、本地目录包缺少更新源时明确显示不可用，不访问更新服务。
- Windows 应用内更新及重启安装已由用户实机验证；macOS 正式签名版本间升级仍待实机验证，步骤见 [发布与更新说明](apps/desktop/RELEASING.md)。当前实现未改变项目、文档或会话的存储路径。

## GitHub 打包与发布

- 新功能从 `develop` 创建功能分支，以 PR 合回 `develop`。发版前在 `develop` 更新根包和桌面包版本、版本记录，并在本地完成 `pnpm check` 与 `pnpm test:smoke`。
- 直接由 `develop` 向 `main` 提发布 PR。合并后在 `main` 的合并提交上推送 `v<版本号>` 标签；这是唯一自动触发 GitHub 云端构建的事件。PR、`develop` 和 `main` 推送不会运行构建。
- 标签工作流（`.github/workflows/release-macos.yml`）核对版本和 `main` 祖先关系，然后分别运行检查与一次构建：macOS 26 ARM64 / Intel runner 分别生成 **macOS arm64 / x64 DMG/ZIP**，Windows runner 生成 **Windows x64 NSIS EXE 安装包**。Windows 安装器支持选择安装目录，默认按当前用户安装。
- 三个构建任务分别校验并上传 Artifact，包含五个安装文件、更新清单和生成的 blockmap；统一发布任务分别下载产物并合并 macOS 双架构更新清单，重新验证后创建同一个 **预发布 Release**。更新清单上传前校验版本、平台目标、文件大小与 SHA-512，排除 builder 调试文件。任一平台失败则不创建 Release，已成功平台的 Artifact 仍可下载。PR 和普通分支推送不触发构建。
- 已存在标签的任务失败或取消时，可重新运行失败作业，或在 Actions 手动输入该标签重试；已存在 Release 则停止，避免覆盖。首次 Intel/macOS 13 发布必须使用包含新配置及合并脚本的新版本标签，旧标签不会自动获得新配置，也不会补改现有 Release。
- 新配置的产物命名为 `Jarvis-<版本>-macos-<arm64|x64>.dmg`、同名 `.zip` 和 `Jarvis-<版本>-windows-x64-unsigned-setup.exe`。Windows 构建核对程序 x64 架构、版本与程序/安装器未签名状态；macOS 校验目录包、ZIP 解压后的应用及 DMG 中应用的架构、版本、Developer ID 签名、Team ID、Hardened Runtime、公证票据和 Gatekeeper，并检查归档完整性。
- 签名、公证凭据仅注入 macOS 打包步骤；缺失凭据或验证失败会阻止发布。配置与凭据维护见 [macOS 发布说明](apps/desktop/RELEASING.md)。macOS 最低系统目标为 13.0；macOS 13 实机兼容性仍待验收，Windows 仍为未签名测试包。真实 Electron 窗口回归继续在发版前的本机运行。

## 目录

```text
apps/desktop/
  src/main/       Electron 窗口与应用生命周期
  src/preload/    运行时信息及限定的生成桥接
  src/renderer/  React 页面和样式
  src/shared/    跨进程共享类型
  tests/         Electron 冒烟测试
  scripts/       本地打包入口
packages/config/ 共享 TypeScript 配置
memory/          项目决策与设计记忆
```

开发约定见 [AGENTS.md](AGENTS.md)，工程状态见 [memory/engineering.md](memory/engineering.md)，设计要求见 [memory/design.md](memory/design.md)。

## 生成验证

运行前在设置页填写配置，再在节点中选择模型、填写提示词并点击生成。素材在生成前上传，已成功上传的素材在配置未变化时复用。生成期间可关闭编辑面板或切换项目；节点输入和删除暂时禁用。

任务结果保存在应用用户数据目录，图片与视频通过本地媒体通道预览。结果 URL 仍依赖原服务可访问，并不代表已将媒体文件永久下载到本机。刷新页面会重新查询本地任务，只有查询会自动重试；生成请求不自动重发。结果未知时应先核实服务端，再决定是否再次生成。

`pnpm test:smoke` 使用本地模拟 HTTP 服务验证上传、参数映射、结果加载与播放、失败处理和恢复，不调用真实服务。真实服务由用户自行联调；部分标记为待验证的模型尚未验证，首尾帧模式暂不开放。

参考素材：图像节点仅接受图片，最多 9 张；视频节点最多 9 张图片、3 个音频和 3 个视频。普通面板以固定叠卡显示，点击叠卡放大后可横向浏览和移除素材。

## UI V1 基础控件

仓库内部 `@jarvis/ui` 提供基础按钮、表单、选择与提示控件，通用、模型、内网、下载和插件设置已迁移。系统强调色通过只读桥接同步，macOS 侧栏启用原生材质；平台实机验收边界见 [实施报告](memory/ui-v1-implementation.md)。

运行 `pnpm dev` 后可在开发服务打开 `http://127.0.0.1:5173/#/ui-preview` 查看浅深控件预览。生产构建不包含预览入口；`pnpm check` 检查设计变量与包边界，`pnpm test:smoke` 包含组件截图及键盘交互回归。
