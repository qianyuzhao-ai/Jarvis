# Jarvis

个人工作台桌面应用。已实现 Pi 首页 Chat、带画布 Agent 的 AIGC 创作空间和本地 Markdown 写作空间。

当前源码版本：`0.1.8`，功能和验证边界见 [版本记录](CHANGELOG.md)。

## 启动

使用 pnpm 11.24.0。项目通过 `devEngines.runtime` 管理 Node.js 22.23.3，不改变全局 Node；首次安装需要联网下载依赖和运行时。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 打开 Electron 窗口，并启动仅监听 `127.0.0.1:5173` 的开发服务器。关闭开发任务使用终端 `Ctrl+C`。

## 当前范围

- Electron + electron-vite + React + TypeScript strict。
- pnpm workspace + Turborepo，共享 TypeScript 配置。
- Tailwind CSS v4、Lucide 图标、Noto Sans SC 字体、可调宽侧栏和浅深主题。主题在「设置 → 通用」中选择跟随系统、Light Mode 或 Dark Mode，新用户默认跟随系统。
- Motion 侧栏展开/收起动画；拖动边缘可调整到 230–320px，双击恢复默认，宽度自动保存，支持减少动态效果。
- React Flow 项目画布：添加/拖拽/删除图像与视频节点，独立编辑面板、参考素材、模型参数。
- 缩放、适应视图、缩略图、点阵显示和 24px 网格吸附。
- 项目、节点、素材与视口通过 IndexedDB 自动保存在本机；保存错误会显示提示。
- 本地 Markdown 写作空间：选择目录、文件树/文件名搜索、新建文档和文件夹、多标签、基础实时预览/源码切换、标题导航、自动/手动保存、冲突另存副本与工作状态恢复。正文直接写入 .md 文件，左右侧栏独立收起和调宽，写作助手暂为占位。
- Biome 检查与格式化、桌面冒烟测试、本地应用打包。
- 主进程、preload、renderer 分离；启用沙箱和上下文隔离，renderer 不开放 Node API。
- Pi 1.3.0 首页文字 Chat：中转站模型配置（Chat Completions / Responses）、SSE 流式回复、停止/中断反馈、会话重命名与重启恢复。API Key 经系统密钥存储加密，只在主进程使用。

设置表单支持本地保存、取消和校验。生成按钮会先上传参考素材，再通过主进程提交生成，并在节点中显示图片或视频结果。支持本地任务状态、重复提交保护、刷新恢复；应用重启后的未完成任务标为结果未知，不自动重发。已支持受类型、去重和循环校验约束的节点连线。

首页 Chat 在「设置 → 模型服务」配置中转站地址、Key、协议和模型 ID；可先获取模型列表，也可直接填写 ID。测试连接会发出一条收费规则由中转站决定的简短请求，测试与保存独立。已有对话保留其模型与连接；更换地址/协议后请新建对话。容量未知时不显示占用百分比；长对话达到本地保护上限时需新建对话，不自动裁剪或发起摘要请求。

画布右上角可展开 Agent 侧栏，支持当前项目独立的新建、历史、重命名及删除对话。可读取节点、修改提示词/参数、创建或移动节点、连接或断开连接、定位节点；修改保存后展示回执和变更，同轮修改可一起撤销。画布发生后续变动时拒绝覆盖或过期撤销。删除聊天保留画布和资产。

多选画布图片/视频后，点击输入框下方 + 添加资产，可逐项移除；每次最多 6 个资产、12 张图片/视频帧。视频抽取 10%、50%、90% 三个代表帧，附时间点；准备失败时阻止发送并显示原因，不支持音频或完整视频理解。需要配置支持视觉输入的中转站模型；真实服务兼容性仍需联调。

首页 Chat 保持文字输入，首页和画布均支持技能：点击输入框下方的书本图标管理技能，选择包含 `SKILL.md` 的文件夹导入，再输入 `/` 按名称或描述搜索。方向键选择、Enter/Tab 补全，补充任务后发送；例如已导入 shot-plan 时可输入 `/skill:shot-plan 规划三个镜头`（也支持 `/shot-plan`）。Agent 会按已启用技能的适用描述主动加载正文；`disable-model-invocation: true` 的技能仅手动调用，活动记录会标明实际加载方式。同名导入更新内容并保留启停，技能包由 Jarvis 独立保存，不扫描其他 Agent 目录。

技能仅提供说明与包内文本参考，不会执行脚本或增加工具权限。每包最多 100 文件/2MB、单文件 256KB；最多保存 100 个技能。停用后不再进入新请求的可选或自动目录，历史已加载内容仍保留。Agent 无通用文件/Shell/生成执行工具，不读取个人 Pi 配置，未接入官方服务商登录，写作助手仍占位。输入框始终位于底部；首页未实现的附件/Auto 有禁用提示。会话与加密配置位于 Electron userData 的 `agent/` 下。模拟验证不代表所有服务都支持。

画布操作：滚轮/触控板平移，Ctrl/⌘ + 滚轮缩放，中键或右键拖动平移；点击节点打开编辑面板，点击空白或 Escape 关闭，Delete/Backspace 删除选中节点。右下角依次是缩略图、点阵和吸附，新画布默认开启吸附。节点面板关闭按钮下方可进入 960 × 600px 居中放大编辑，小窗口自动缩小；Esc 优先还原面板，输入内容保留。清除应用数据会清除本地项目；开发服务器与打包应用属于不同存储来源，不自动迁移数据。

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

当前本地验证平台为 macOS arm64。应用已使用 Jarvis 图标；[0.1.8 安装包](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.8) 已发布，macOS Developer ID 签名、公证、目录包及 DMG/ZIP 内应用的票据和 Gatekeeper 均通过云端验证。0.1.7 及之前版本仍为未签名包。自动更新尚未接入，Windows 安装包仍未签名，功能需实机验收。

## GitHub 打包与发布

- 新功能从 `develop` 创建功能分支，以 PR 合回 `develop`。发版前在 `develop` 更新根包和桌面包版本、版本记录，并在本地完成 `pnpm check` 与 `pnpm test:smoke`。
- 直接由 `develop` 向 `main` 提发布 PR。合并后在 `main` 的合并提交上推送 `v<版本号>` 标签；这是唯一自动触发 GitHub 云端构建的事件。PR、`develop` 和 `main` 推送不会运行构建。
- 标签工作流（`.github/workflows/release-macos.yml`）核对版本和 `main` 祖先关系，然后分别运行检查与一次构建：Intel macOS runner 交叉生成 **macOS arm64 DMG/ZIP**，Windows runner 生成 **Windows x64 NSIS EXE 安装包**。Windows 安装器支持选择安装目录，默认按当前用户安装。
- 两个平台分别上传 Artifact，全部成功后由一个发布任务核对三个文件齐全，再创建同一个 **预发布 Release**。任一平台失败则不创建 Release，已成功平台的 Artifact 仍可下载。PR 和普通分支推送不触发构建。
- 已存在标签的任务失败或取消时，可重新运行失败作业，或在 Actions 手动输入该标签重试；已存在 Release 则停止，避免覆盖。首次双平台发布必须使用包含新配置的新版本标签，旧标签不会自动获得 Windows 配置，也不会补改现有 Release。
- 新配置的产物命名为 `Jarvis-<版本>-macos-arm64.dmg`、同名 `.zip` 和 `Jarvis-<版本>-windows-x64-unsigned-setup.exe`。Windows 构建核对程序 x64 架构、版本与程序/安装器未签名状态；macOS 校验目录包、ZIP 解压后的应用及 DMG 中应用的架构、版本、Developer ID 签名、Team ID、Hardened Runtime、公证票据和 Gatekeeper，并检查归档完整性。
- 签名、公证凭据仅注入 macOS 打包步骤；缺失凭据或验证失败会阻止发布。配置与凭据维护见 [macOS 发布说明](apps/desktop/RELEASING.md)。最低系统版本仍为 macOS 26.0，Windows 仍为未签名测试包。真实 Electron 窗口回归继续在发版前的本机运行。

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
