# Jarvis 工程记忆

最后更新：2026-10-21

## v0.1.4 发布产物路径修复（2026-10-21）

- 第二次重试 `39527698231` 的 macOS arm64、Windows x64 两个作业全部成功，包括产物校验和上传；统一发布作业因预期产物在顶层而失败。实际 Artifact 保留 `github-0.1.4/` 子目录，已下载并核对。
- 工作流发布文件路径改为 `release-assets/github-${version}/...`。本轮直接使用同次成功构建的三个 Artifact 完成 v0.1.4 预发布，不再次构建，不移动标签；最终发布结果另记。

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
