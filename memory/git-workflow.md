# Jarvis Gitflow 管理方案

最后更新：2026-10-25

## Agent 架构改造 PR（2026-10-25）

- 用户要求将云端会话分支 `ccr-1c636605-o0pprj`（A0–A6 及插话设置，基于 main `6761f10`，已包含 develop `81beb13`，领先 26 个提交）提 PR 合入 develop：[PR #84](https://github.com/qianyuzhao-ai/Jarvis/pull/84)。PR 由用户于 2026-10-25 合并到 develop（合并提交 `a358672`）；未打标签、未发布，版本号未改动。之后会话分支按“已合并 PR 后重新从 develop 起分支”规则重置到 `a358672`，后续记录作为新改动提交。这两条记录提交（`c418996`、`58147bd`）经 [PR #85](https://github.com/qianyuzhao-ai/Jarvis/pull/85) 提交合入 develop，只创建了 PR，没有合并。

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


## 模型配置修复与关于页集成（2026-10-25）

- 用户授权 `feature/model-dialog-lifecycle-fix` 与 `feature/settings-about` 推送、提 PR 并合入 develop，范围不含 main、版本标签或发布。
- 模型修复提交 `d8d1d93` 经 [PR #74](https://github.com/qianyuzhao-ai/Jarvis/pull/74) 合入 develop（`59f7dd5`）；关于页提交 `931f896` 同步新 develop（合并提交 `197e07e`），两份记忆顶部冲突保留双方记录，应用代码无冲突。关于页交付 PR 为 [#75](https://github.com/qianyuzhao-ai/Jarvis/pull/75)。
- 合并前集成 `pnpm check`、`pnpm build` 与模型/更新相关 26/26（30.1s）回归通过。GitHub 插件创建 PR 返回 integration 403，使用本机已登录 gh 完成授权操作；没有绕过仓库规则或强推。


## UI V1 第三阶段功能分支（2026-10-24）

从 origin/develop 的 d0e3219 创建 feature/ui-v1-shell，保留此前已授权集成的 Agent 节点生成修复 a1ec3a3；按 I → J → K → N → L → M 独立提交，每阶段检查、构建与完整回归通过。六阶段提交 e6a2783 / 74fe52c / 25ae76e / e307090 / c992f02 / 426b8d3 已推送，远端回读与 M 一致；随后仅补充验收索引文档。用户附件授权推送本功能分支，未授权 PR、合并、标签或发布。最终提交及远端回读结果见 [实施与验收](ui-v1-implementation.md) 第三阶段。


## Agent 生成修复重新集成（2026-10-24）

- 按用户要求 fetch 并核对本地 develop 与 origin/develop 均为 `d0e32190bd019e8c1efc34b29f35543c2c1c1325`，从该点创建 `feature/agent-generation-fix`。
- 将 `feature/agent-node-generation` 的修复提交 `a1ec3a3` 合入新分支，合并提交 `1c76472`，无冲突；原修复分支保留。新分支同时包含最新 develop 和修复提交。
- `pnpm check`、`pnpm build`、diff 检查通过。相对原已验证修复，新增内容仅为 develop 的 AGENTS/设计文档，应用代码一致，沿用此前 10 项回归结果。未推送、未合回 develop、未发布。

## UI V1 第二批功能分支（2026-10-24）

按用户任务从最新 origin/develop 创建 feature/ui-v1-overlays；设计分支仅只读参考，没有合入。E/F/G/H 独立提交 157ce2d / a73903a / d7ed150 / 3487102，阶段门禁全部通过，分支已推送且远端回读包含四阶段提交。随后追加验收文档记录。授权只到功能分支推送，未创建 PR、合并、打标签或发布；版本仍为 0.2.5。详情见 [UI V1 实施与验收](ui-v1-implementation.md)。

## UI V1 基础组件功能分支（2026-10-23）

- 按用户实施文档从最新 origin/develop 创建 feature/ui-v1-foundation；设计分支 claude/personal-workbench-project-8xza4v 只读参考，没有合入。
- 四阶段独立提交 90cb20a / 2a51146 / 2d2971b / 86cb31f，均完成检查、构建与实窗回归；已推送并回读远端分支。授权仅到功能分支推送，没有 PR、合并、标签或发布。详细证据见 [UI V1 验收报告](ui-v1-implementation.md)。


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

## Intel 与 macOS 13 功能分支（2026-10-23）

- 用户授权实现 Intel x64 支持及最低系统 13.0；从现有 origin/develop（7d5a3308137c656a334ef0a8f6513536866b219e）创建 feature/macos-intel-support，保留 README 与三份记忆已有未提交改动。未提交、推送、合并、打标签或发布。
- 发布矩阵改为 macOS arm64 / x64 和 Windows x64，三者全部通过才统一发布；macOS 同名更新清单需显式合并并复验，不得用 Artifact 覆盖。
- 首次使用本次流程必须创建包含配置、验证和清单合并脚本的新版本标签；不能把新工作流直接套用于缺少这些脚本的旧标签。旧版本重试应使用与该标签兼容的工作流，不移动已有标签。
- 本地检查、构建及发布工具回归通过；两种 macOS 未签名目录包启动通过（x64 使用 Rosetta），macOS 13 与 Intel 原生、云端签名公证仍待验证。详细证据见 engineering.md 对应记录。

## 0.2.4 发布阻塞（2026-10-22）

- 用户要求再试一次 macOS；原运行 attempt 3 的作业 119920231810 于北京时间 23:35:32 开始排队、23:50:33 零步骤结束。GitHub 明确再次报告 hosted runner 未获取成功及 macOS ARM64 容量不足，runner_name 为空；非编译、签名或公证失败。Windows 成功结果复用为 119920233965，统一发布 119928398787 skipped；运行于 23:50:34 以 failure 结束。v0.2.4 标签保持不变，Release 仍未发布，已连续三次因同一外部容量问题阻塞。

- 用户确认将署名更正、登录/上传修复、真实内网地址清理及版本准备一起提交并发布 0.2.4。地址清理前曾暂停，清理验证后已明确恢复发布授权。
- 提交 `9800c50`、`662de2b`、`9de1bff` 均署名 `QianYu <qianyuzhao.ai@gmail.com>`，无 Claude 联合署名。原功能分支通过精确旧 SHA 的 force-with-lease 同步；[PR #59](https://github.com/qianyuzhao-ai/Jarvis/pull/59) 合入 develop（31d46c4），[PR #60](https://github.com/qianyuzhao-ai/Jarvis/pull/60) 合入 main（8f0c883a5098a42ce8dde2618aa927560388b48b）。两次合并树均与已验证源码一致。
- 注释标签 v0.2.4 对象 `f0958df56400469ffa9fe55dd79955c7622279b2`，指向上述 main 提交。唯一标签运行 [39800805580](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39800805580) 共尝试三次，均未成功发布；没有移动标签或覆盖旧 Release。
- 最终源码 pnpm check、pnpm build、完整 Electron/本地模拟服务回归 **84/84（3.1m）**、发布工具回归 7/7、版本一致性与 diff 检查通过。真实服务仅由用户在目标设备联调；此前 Windows 媒体 readyState 问题在本轮 Mac 未复现，不表示 Windows 实机问题已解决。
- Windows 首轮作业 119900608771 成功：版本 0.2.4、360 项必需依赖、实际 win32 打包应用启动、ASAR 页面与更新桥接、更新清单版本/目标/大小/SHA-512 均通过；安装器保持未签名。第二次尝试复用此结果，显示作业 ID 119909799819，没有重新构建 Windows。
- macOS 首轮作业 119900608038 和单独重试作业 119909796126 均排队约 15 分钟后零步骤结束。两个 check-run 均明确报告 hosted runner 未获取成功及 macOS ARM64 容量约束；非代码、签名或公证失败。两轮统一发布均 skipped。第二次运行于北京时间 23:31:50 以 failure 结束，尚无 v0.2.4 GitHub Release，最新已发布版本仍为 v0.2.3。
- Windows Artifact `Jarvis-windows-x64-39800805580` 已回读未过期，ID 12435108418，210170288 字节，保留到 2027-01-20T15:00:52Z。后续容量恢复时可仅重试 macOS 失败作业，保留原标签与 Windows 产物；若产物已过期，需重新构建缺失平台。macOS 成功后仍需核对签名、公证、真实打包启动、统一 Release 资产和线上更新清单，不能把本轮源码验证称为发布完成。

## 0.2.3 发布（2026-10-22）

- 用户明确要求发布新版本，授权本次提交、推送、PR 合并、版本标签与云端发布，替代下方统一登录功能此前的仅本地开发边界。纳入统一登录功能和此前 Windows 自动更新实机验证文档。
- 当前 feature/generation-login 起点与最新 origin/develop 一致；远端最新版本为 0.2.2，无开放 PR。根包、桌面包、README 源码版本与变更记录统一为 0.2.3，继续 feature → develop → main PR 和新版本标签流程，不移动旧标签或覆盖旧资产。
- 发布前 pnpm check、构建、版本与 diff 检查通过，发布工具回归 7/7 通过；功能已通过完整回归 82/82 与最终相关复测 5/5。真实公司统一登录和生成服务由用户在内网设备联调。
- 实现提交 bb94bc7 经 [PR #56](https://github.com/qianyuzhao-ai/Jarvis/pull/56) 合入 develop（2e0f6b8），[PR #57](https://github.com/qianyuzhao-ai/Jarvis/pull/57) 合入 main（5ec8e0230bde4daa350458772c3aed2bc360259f），集成树与已验证实现一致。v0.2.3 标签对象 7337e7b7d33b50abed5f8d329896d849c217041f，剥离后指向该 main 提交。
- 唯一标签运行 [39774871216](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39774871216) 的 Windows、macOS 和统一发布三作业均 success；[v0.2.3 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.3) 于 2026-10-22 20:06:32（UTC+8）发布，非草稿、预发布，8 个资产均 uploaded。未重试构建、移动标签或覆盖旧资产。
- Windows 作业 119811171332、macOS 作业 119811171800 均通过 360 项必需依赖及实际打包应用启动、ASAR 页面和更新桥接检查，版本 0.2.3。macOS 目录包及 ZIP/DMG 内应用均通过签名、公证票据和 Gatekeeper（accepted / Notarized Developer ID）；Windows 安装器保持未签名。
- 两端云端校验更新文件名、版本、大小和 SHA-512；线上 latest.yml / latest-mac.yml 已下载，SHA-256 匹配 GitHub asset digest，清单目标及文件大小匹配已发布资产。中文发布说明与登录使用步骤已保留原自动生成记录并回读确认。真实公司统一登录及内网生成仍由用户在目标设备验收。

## 生成平台统一登录开发（2026-10-22）

- 用户授权实现可配置域名的生成平台统一登录入口；从 develop 创建 feature/generation-login。保留此前 Windows 自动更新实机验收的 README 和三份记忆未提交改动，不丢弃或重置。
- 本轮为本地开发和模拟服务验证，不包含新版本提交、推送、PR、标签或发布；版本保持 0.2.2。0.2.2 发布授权已完成，不扩展为本轮自动发版。

## 0.2.2 发布（2026-10-22）

- 用户要求发布新版本，以便在另一台可访问内网的设备上测试，授权本次提交、推送、PR 合并、版本标签和云端发布。此次授权替代下方任务接口改造原先的仅本地实现边界。
- 远端核对最新版本为 v0.2.1，无开放 PR；feature/generation-tasks 起点与 origin/develop 一致。根包/桌面包、README 源码版本和变更记录更新为 0.2.2，按 feature → develop → main PR 集成，随后在 main 合并提交打新标签，不移动旧标签、不覆盖旧资产。
- 发布前版本、pnpm check、构建及 diff 检查通过，发布工具回归 7/7 通过；已有完整 Electron 回归 79/79 和最终相关复测 8/8。真实内网由用户在其他设备联调。
- 实现提交 c2e976e 经 [PR #53](https://github.com/qianyuzhao-ai/Jarvis/pull/53) 合入 develop（81db00f），[PR #54](https://github.com/qianyuzhao-ai/Jarvis/pull/54) 合入 main（8688f7626c952ddf0f8d8e11342d80ed10c8031f），集成树与已验证实现一致。v0.2.2 标签对象 2331d29e8bc95074a5c33037ebc5b3209877a86f，剥离后指向该 main 提交。
- 唯一标签运行 [39764722806](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39764722806) 的 macOS、Windows 和统一发布三个作业均 success；[v0.2.2 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.2.2) 于 2026-10-22 18:46:43（UTC+8）发布，非草稿、预发布，8 个资产均 uploaded。未重试构建、移动标签或覆盖旧资产。
- Windows 作业 119777222170、macOS 作业 119777221712 均通过 360 项必需依赖检查及实际打包应用启动、ASAR 页面/更新桥接验证，版本为 0.2.2。macOS 目录、ZIP/DMG 内应用均通过签名、公证票据及 Gatekeeper（accepted / Notarized Developer ID）；Windows 安装器仍未签名。
- 两端云端均验证更新目标、文件大小与 SHA-512。线上 latest.yml / latest-mac.yml 已下载，SHA-256 匹配 GitHub asset digest，版本及目标文件大小与实际资产一致；中文发布说明保留自动生成记录并已回读。真实内网生成和 macOS 实机自动升级仍待用户验收。
- 用户于 2026-10-22 反馈 Windows 实机“发现新版本 → 点击更新 → 重启安装”流程可用，已验证通过。此为用户实测结果，替代此前 Windows 自动升级待验收状态；不据此推断内网生成已通过。

## AIGC 任务接口改造（2026-10-22）

- 用户授权开始实现新平台任务协议，全部图像/视频模型统一迁移、5 秒轮询；真实内网由用户联调。开始时 develop 与 origin/develop 一致且工作区干净，已创建 `feature/generation-tasks`。
- 本轮仅本地实现、验证和更新项目记忆，不包含提交、推送、PR、合并、标签或发布；版本维持 0.2.1。

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
- 首轮因 GitHub HTTPS 中断暂停；用户要求继续后网络恢复，所有提交已成功推送。连接器创建 PR 返回权限 403，改用已登录 gh CLI 完成，不读取凭据。

- Apple 只读查询 [39711114877](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39711114877) 确认本次公证 288cecf8-f672-46de-bbe7-4d5b58f9a5ce 为 Accepted；正式打包及目录/ZIP/DMG 内应用的签名、票据、Gatekeeper 均通过，三者均 accepted / Notarized Developer ID。本次无需重试发布。
- 发布资产包含 macOS arm64 DMG/ZIP、Windows x64 未签名 EXE、latest-mac.yml / latest.yml、三个 blockmap。两端云端校验更新目标、版本、大小及 SHA-512；线上清单已下载回读，其 SHA-256 与 GitHub digest 相同，所有目标名称/大小匹配实际发布资产，未发布 builder 调试文件。
- 0.1.8 没有更新器，需手动安装一次 0.2.0；后续生产签名版本之间的真实升级仍需更高版本验证。真实 DeepSeek 服务和 Windows 实机功能不在本次云端签名/清单验证结论内。

## 应用内自动更新开发（2026-10-22）

- 用户本轮要求接入 GitHub Releases 自动更新，并确认包含预发布版本。本轮只实现与验证，未执行提交、推送、PR、合并、标签或发布；根包/桌面包版本保留 0.1.8，已发布标签及资产不变。
- 从刷新后的 origin/develop `004beb3` 创建 feature/in-app-updates，独立 worktree `/Users/hugo/Developer/my-jarvis-worktrees/in-app-updates`。保留原 feature/ui-style 的未提交设置、字体、样式与记忆改动，不在原分支覆盖或混合实现。
- 新版本发布须包含 updater 运行时依赖、GitHub 发布配置、清单验证脚本和更新后的工作流；统一 Release 还需上传相应 yml 清单及 blockmap，builder 调试文件不得上传。已发布 0.1.8 无更新器，不能靠补改旧标签使现有客户端自动升级。

## 0.1.8 校验工具修复与同标签重试（2026-10-21）

- 用户明确授权有限重试修复、Gitflow 提交/推送/合并，以及重试发布 v0.1.8。原运行的 Apple 公证已成功，失败发生于 DMG 内应用 stapler validate 的 Apple 网络 -1005/退出 68；Windows、目录包与 ZIP 内应用校验成功。
- `feature/apple-network-retry` 从刷新后的 origin/develop `efbce12` 创建于独立 `/private/tmp/jarvis-apple-network-retry`，保留原工作区 feature/ui-style 未提交工作。仍经 feature → develop → main PR，不移动 v0.1.8（应继续指向 `caa4256e857957259f21518b772be24d5cc9d07f`），不覆盖已有 Release。
- 合并后从最新 main 手动 dispatch 发布工作流、输入 v0.1.8。应用源码/配置来自原标签，macOS 校验工具来自工作流触发提交的独立稀疏 checkout；原运行的 rerun 不会读取后续脚本修复。此次授权只重试这一版本，最终运行/资产结果待回读。
- 修复提交 `f3f2015` 经 [PR #39](https://github.com/qianyuzhao-ai/Jarvis/pull/39) 合入 develop（`35813f7`），[PR #40](https://github.com/qianyuzhao-ai/Jarvis/pull/40) 合入 main（`10490dc`）。唯一手动重试运行 [39621901772](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39621901772) 已触发；远端标签对象仍为 `5070c56792b0428b79ce0785fb50b14e363b644e`，剥离后仍为原 main 合并提交 `caa4256e857957259f21518b772be24d5cc9d07f`。
- 本次签名公证及三种包内应用校验已通过；三种形态均实际遇到一次 Apple 网络 -1005，有限重试第 2 次恢复，Gatekeeper 均 accepted。运行 `39621901772` 的 macOS、Windows 与统一发布全部成功；[v0.1.8 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.8) 已回读为非草稿预发布，DMG/ZIP/EXE 三个资产均 uploaded。原 v0.1.8 标签未变；结果说明通过独立文档 PR 回到 develop，不再触发构建。

## 0.1.8 发布验证（2026-10-21）

- 用户授权按 Gitflow 提交、推送、合并、发布 0.1.8 并验证 macOS 签名公证。实现提交 `23c96d4` 经 [PR #34](https://github.com/qianyuzhao-ai/Jarvis/pull/34) 合入 develop（`5447840`），[PR #35](https://github.com/qianyuzhao-ai/Jarvis/pull/35) 合入 main（`caa4256`）。`v0.1.8` 指向该 main 合并提交，远端标签已回读；没有移动旧标签或覆盖已有 Release。
- 首次标签构建 [39613181833](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39613181833) 的 Windows 构建、产物校验和 Artifact 上传成功（4m44s）；macOS 签名公证成功，但 DMG 内应用票据校验遇 Apple 网络 -1005/退出 68，统一发布跳过。后续通过顶部有限重试修复并成功发布，不再是当前阻塞。
- 为区分签名等待与公证排队，诊断提交 `52f0027` 经 [PR #36](https://github.com/qianyuzhao-ai/Jarvis/pull/36) → develop（`593b982`）、[PR #37](https://github.com/qianyuzhao-ai/Jarvis/pull/37) → main（`13bd2d6`）集成。独立手动诊断 [39615732424](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39615732424) 成功查询：Apple 于 `2026-10-21T14:09:14.028Z` 收到 `Jarvis.zip`，提交 ID `71055590-e096-4ee7-974c-6e75244c9610`，查询时为 `In Progress`。诊断不构建、不上传、不重提公证，没有改动 v0.1.8。
- 第二次只读诊断 [39616937355](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39616937355) 当时返回同一提交 `In Progress`，为早期等待快照；后续原公证 Accepted，首次运行因 Apple 网络票据校验失败。顶部同标签手动重试现已完整成功并创建 Release；保留此历史以区分首次等待、公证成功、网络校验失败与修复后发布成功。

## macOS 签名公证发布配置（2026-10-21）

- 后续用户授权本轮按 Gitflow 提交、推送、PR 合并并发布 0.1.8，验证云端 macOS 签名和公证。已 fetch 核对 develop 基线 `351ed83`，远端无 v0.1.8 标签、无打开的 PR，五项 Secrets 名称存在；不读取秘密值。根包、桌面包和版本记录统一 0.1.8，发布结果待回读。
- 用户完成 Developer ID Application 证书创建与带私钥 `.p12` 导出，并报告五项 Repository secrets 已配置；本轮授权修改工作流启用 macOS 签名、公证，不包含提交、推送、合并、标签或发布。
- 从已 fetch 的 `origin/develop` 创建 `feature/macos-signing-notarization`。新配置将 macOS arm64 包改为正式签名、公证并验证后发布；Windows x64 保持未签名，仍需双平台全部成功后统一预发布。首次使用须有包含新配置的新标签；0.1.7 及历史产物不改动。
- 本地检查与构建已通过；后续 0.1.8 已按用户新授权完成 PR 集成、标签和云端签名/上传，公证与 Gatekeeper 仍待完成，详见顶部 0.1.8 记录。凭据操作说明见 `apps/desktop/RELEASING.md`。

## 0.1.7 发布（2026-10-21）

- 用户要求“把最新的改动都一起发新版本，0.1.7”，授权本轮提交、推送、PR 合并、标签及发布。已 fetch 核对：当前分支包含 develop 和全部 5 个待发布功能提交（d60eece、e74a460、5ae71ae、074890f、f11244c）；其他本地功能没有遗漏的独有实现提交。保留历史分支、stash 和已有标签。已由 [PR #31](https://github.com/qianyuzhao-ai/Jarvis/pull/31) 合入 develop（69756c5），再由 [PR #32](https://github.com/qianyuzhao-ai/Jarvis/pull/32) 合入 main（2f7ef56），标签 v0.1.7 指向 main 合并提交。唯一云端运行 [39605956426](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39605956426) 双平台构建、校验及统一发布全部成功；[v0.1.7 Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.7) 已回读为非草稿的未签名预发布，DMG/ZIP/EXE 三个文件均已上传。没有移动旧标签或重试构建；发布说明与结果记录通过独立文档 PR 回到 develop。

## 本轮已完成的功能分支（2026-10-21）

- `feature/prompt-reference-tags` 依赖生成详情提交 `074890f`，实现光标引用菜单和整体tag编辑；用户随后授权本地 commit，包含代码、测试及 Figma 同步记录；不推送、不合并、不发布。

- `feature/node-generation-details` 依赖已完成 Skills 提交 `5ae71ae`，实现图像/视频节点的折叠详情与结果 URL 复制。用户随后授权本地 commit，范围包含代码、测试与 Figma 同步记录；不推送、不合并、不发布。

- Skills 后续开发位于 `feature/agent-skills`，依赖已本地提交的画布 Agent `e74a460`（及 Chat V2 `d60eece`）。用户随后要求 commit，授权本地提交 Skills 代码、测试与同轮 Figma 记忆；不推送、不合并、不发布，不表示已集成 develop/main。

- Chat V2 已在 `feature/chat-ui-v2` 本地提交 `d60eece`。随后用户授权画布 Agent 第一版和追加会话管理/图片视频帧输入，并要求 commit；从该完成点继续建立 `feature/canvas-agent`，明确依赖 Chat V2，未丢弃或重置已有工作。后续整合需包含该依赖，避免只摘取画布提交。
- 此轮授权仅本地提交代码、测试和同轮 Figma/工程记忆；没有推送、PR、合并、标签或发布授权。功能不表示 main/develop 已含本轮代码。

## 决策与来源

用户于 2026-10-20 明确要求本项目使用提供的 Gitflow 分支管理参考图。

- 来源文件：`/Users/hugo/Library/Mobile Documents/com~apple~CloudDocs/hugo-WorkOS/Software Development/01 Software Development - Resources/Git - Gitflow 分支管理参考图.pdf`
- 已渲染并检查完整单页图，作者 Vincent Driessen，标题 A successful Git branching model，图中标注许可 Creative Commons BY-SA。
- 原图来源链接：<http://nvie.com/posts/a-successful-git-branching-model/>。本次依据用户提供的 PDF 整理，未额外核对网页。
- 本文件为对原图分支流程的中文整理，并补充本仓库的命名与执行约定。

## 当前分支职责和流向（2026-10-21 用户更新）

`v0.1.6` 已经 PR #28 集成 Agent、App Icon 和全部待发布改动到 develop（`5c6b840`），PR #29 进入 main（`9526901`），标签指向 main 合并提交。唯一运行 [39560464413](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39560464413) 双平台构建及统一发布全部成功；[Release](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.6) 非草稿、未签名预发布，DMG/ZIP/EXE 三个文件均已上传。没有移动旧标签、手动重试或重复构建。发布说明与结果记录后续仅通过文档分支回到 develop，不修改已发布标签。

- 2026-10-21：用户授权发布 0.1.6，范围包含 `83e053e` Agent 实现、`95e132f` App Icon 及全部待发布改动。按 feature PR → develop → main PR → main 合并提交标签 `v0.1.6` 执行，标签只触发一次双平台统一预发布；此次不清理历史分支或移动旧标签，发布结果以远端回读为准。

`v0.1.5` 已由 PR #25 进入 develop (`7506c2b`)、PR #26 进入 main (`1f3be23`)，标签指向 main 的该合并提交。唯一运行 [39548892511](https://github.com/qianyuzhao-ai/Jarvis/actions/runs/39548892511) 的 macOS arm64、Windows x64 和统一发布作业全部成功，三个未签名安装文件已发布到 [v0.1.5](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.5)。此前独立的三项画布修复和写作空间均已纳入，旧标签未改动；本地最终集成回归 39/39 通过。

- 2026-10-21 用户授权 0.1.5，要求全部改动纳入：写作空间与独立画布修复集成后通过 PR 进入 develop，再由 develop PR main，标签仅触发一次 macOS arm64 + Windows x64 未签名预发布流程。此次授权包含提交、推送、PR 合并、版本标签与发布；不删除历史分支或移动旧版本标签。

`v0.1.4` 已由 PR #17→develop、#18→main 集成并打标签，指向 main 合并提交 `2aed851`。后续 CI 修复均走 develop→main PR，不移动标签；同一次成功双平台构建的三个文件已发布到 [v0.1.4 预发布](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.4)。Windows 功能由用户验收，具体构建重试及发布路径问题见工程记忆。

`v0.1.3` 标签保持指向 main 发布提交 `9c575c0`。原标签作业在 GUI 测试失败，第一次手动重试因 arm64 runner 容量不足零步骤失败；流程修正经 PR #11/#12 和 #13/#14 依序通过 develop→main。第二次手动输入原标签，在 Intel macOS runner 上成功交叉构建 arm64 DMG/ZIP 并创建 [v0.1.3 GitHub 预发布](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.3)；具体运行验证与未签名边界见 `memory/engineering.md`。未修改或重建受保护标签。

新流程首次试验 `0.1.2` 已完成分支合并和标签创建；唯一云端运行在窗口测试阶段失败，没有安装包或 GitHub Release。后续修复使用新补丁版本 `0.1.3`，不移动受保护的旧标签；具体运行结果见 `memory/engineering.md`。

| 分支 | 从哪里创建 | 用途 | 完成后合入 |
| --- | --- | --- | --- |
| `main` | 现有主分支 | 正式发布状态；对应原图 `master` | 长期保留 |
| `develop` | 初始从 `main` 创建 | 集成下一版本的开发成果；发版前更新版本和变更记录 | 经 PR 直接合入 `main` |
| `feature/<主题>` | `develop` | 独立功能开发，可跨越多个发布周期 | `develop` |
| `hotfix/<版本或主题>` | `main` | 已发布版本的线上紧急缺陷修复 | `main` 和 `develop` |

当前正常发版顺序：所有新功能通过 PR 进入 `develop` → 在 `develop` 定版本和记录 → `develop` PR 到 `main` → 合并后在 `main` 合并提交创建 `v<版本号>` 标签 → 标签只触发一次 GitHub 云端流程，分别构建 macOS arm64 / x64 签名公证包和 Windows x64 未签名包，全部成功后统一预发布。签名公证及 Apple 网络错误有限重试已在 0.1.8 完成云端验证；0.1.7 及之前版本均未签名。PR 和普通分支推送不触发云端构建。已有标签的任务失败或被取消时，使用与该标签兼容的工作流手动输入该标签重试，应用源码保持标签版本，校验工具从工作流提交独立读取。正常发版不再创建 `release/*` 分支；0.1.0/0.1.1 曾使用的 release 分支保留为历史，不自动删除。

旧参考图的原始 release 分支流程（历史，不再用于正常发版）：

1. 多条 feature 分支可并行，未完成的功能不必进入本次发布。
2. 从 develop 切出 release 后，develop 可以继续推进下一版本。
3. release 中的修复可持续回合 develop，发布完成时确保所有修复已回流。
4. release 完成后合入正式主分支，在对应发布提交上创建版本标签。
5. hotfix 从正式主分支开始，修复后发布新标签，并将修复同步到开发主线。

## 本仓库执行约定

- 保留已有 `main` 名称，不为了匹配原图改名为 `master`。开发主线使用 `develop`，不另建职责相同的 `dev`。
- 分支命名采用上表中的斜杠前缀；标签采用 `v<版本号>`。这些是本仓库的命名约定，不是原图的逐字命名。
- 普通未发布缺陷从 `develop` 开工作分支处理；只有线上紧急修复使用 `hotfix/*`。
- 优先保留能够辨认分支合并关系的 merge commit；使用 PR 时选择对应的合并方式，避免把原图中的合并关系全部压平。
- 旧 release 分支若仍在维护，hotfix 也须同步其中，避免旧修复被再次带回；新版本正常发布已不创建该分支。
- 合并前执行与变更相关的检查。应用代码通常需要 `pnpm check` 和构建；涉及窗口、preload 或启动交互时执行 `pnpm test:smoke`。纯文档修改检查内容和 diff 即可。
- 开始工作先检查当前分支、工作区及目标基线；需要最新远端状态时先 fetch，再从正确基线开分支，不覆盖已有工作。
- 提交、推送、合并、打标签和正式发布按用户任务授权执行。此文档本身不授予这些操作的执行权限。
- 不自动清理分支或工作区；文件删除继续遵守 AGENTS.md，禁止批量删除。

## 0.1.0 版本基线（2026-10-21）

- 用户明确要求以当前修改确定 0.1 版本，并按 Gitflow 推送远端。本次使用 SemVer `0.1.0`，标签 `v0.1.0`；该授权覆盖本轮功能集成、release 分支、main 合并、标签、develop 回合及远端推送。
- 开发完成点为 `feature/aigc-workspace` 的 `95d46ed`。已 fetch 核对 origin：远端仅有 main，指向 `b12a158`，没有同名版本标签。
- 本轮发布路径：feature → develop 的非快进合并，创建 `release/0.1.0`，统一工作区版本与桌面应用版本为 `0.1.0`，加入 `CHANGELOG.md`，再将 release 非快进合入 main、创建带注释标签 `v0.1.0`、回合 develop。远端推送包括 main、develop、release/0.1.0、feature/aigc-workspace 和 v0.1.0；不强推、不删除已有分支。
- 正式状态以实际 Git 引用和远端核验为准。后续功能继续从 develop 新建 feature 分支；0.1.0 源码版本不等于已提供签名安装包。

## GitHub 当前保护配置（2026-10-21）

- 2026-10-21：0.1.1 已由 PR #3 合入 develop、PR #4 合入 main，`v0.1.1` 标签指向 main 合并提交 `c425462`。旧工作流在多个事件上排入 macOS runner 队列；用户要求全部取消，现无运行中的任务，也未创建 GitHub Release。用户随后将正常流程改为 develop 直接 PR main，只有标签触发一次云端构建；本轮在 `feature/single-build-release` 落实。下方“仓库没有 Actions workflow”是规则配置当时的历史状态。
- 旧 `release/0.1.1` 回合 PR #5 因新流程而关闭，未删除分支；其中缺失的 Biome/PyCharm 版本记录已纳入 `feature/single-build-release`。
- 历史过程：PR #3 的 develop 合并提交为 `7c8f1c4`；当时从该提交创建 `release/0.1.1`，后经 PR #4 进入 main。旧工作流曾支持手动 Artifact 与 `v*` 标签预发布，现已由单次标签流程替代。

- 自动删除来源分支：`delete_branch_on_merge=true`，GitHub PR 合并后执行，不主动清理历史分支；已授权的手动清理见变更记录。受删除保护的分支不会按此设置自动删除。
- [主分支保护](https://github.com/qianyuzhao-ai/Jarvis/rules/25491765)：用户创建，目标 main/develop，Active，无 bypass。已核对禁止删除、禁止强推、必须 PR、0 人审批、只允许 Merge commit；本轮补开“合并前解决所有讨论”。今后 main/develop 更新必须通过 PR，不再直接推送本地合并结果。
- [发布与紧急修复分支保护](https://github.com/qianyuzhao-ai/Jarvis/rules/25491895)：本轮创建，Active，无 bypass，目标 `refs/heads/release/**/*`、`refs/heads/hotfix/**/*`，覆盖单层与嵌套命名；禁止删除、禁止强推，允许直接提交发布准备与修复。完成所有目标的合并后，如需清理，先对一个明确分支解除删除限制或加入精确排除，再按当次授权删除，不关闭整套保护以批量清理。
- [版本标签保护](https://github.com/qianyuzhao-ai/Jarvis/rules/25491901)：本轮创建，Active，无 bypass，匹配 `refs/tags/v*`，禁止修改、禁止删除；未限制创建新版本标签。
- 当前不强制线性历史、提交签名、审批人数或 CI 检查；仓库没有 Actions workflow，避免必需检查无结果而阻塞。仓库全局仍允许三种合并方式，但 main/develop 规则已经将实际可用方式限制为 Merge。
- 验证：回读规则完整参数，并通过 GitHub 有效分支规则 API 核对 main、develop、release/0.1.0 和未实际创建的 hotfix/test/nested 均正确匹配；feature/aigc-workspace 无匹配规则。仅做只读校验，未通过破坏性推送/删除来测试规则。

## 初始化历史

2026-10-20 用户授权初始化本地分支、提交当前基础工程，并明确暂不推送。

- 基线为现有本地 `main` 的 `b12a158`（Initial commit），与本地记录的 `origin/main` 一致；本次未 fetch，不声称远端服务器状态已刷新。
- 已从该基线创建 `develop`，再从 develop 创建 `feature/project-foundation`，保留全部现有改动。
- 本次集成流程：在 `feature/project-foundation` 提交基础工程及项目规则，检查通过后以 `--no-ff` 合入 `develop`，保留功能分支。
- `main` 保持初始基线；尚无发布，不建立 release/hotfix 分支或版本标签，不推送。实际提交与合并结果以 `git log --graph --oneline --all` 为准。

## 变更记录

- 2026-10-22：用户要求将 `feature/login-window-frames` 最近两个提交署名改为本人。按本仓库 Git 配置将 Author/Committer 改为 `QianYu <qianyuzhao.ai@gmail.com>`，移除 Claude 联合作者标记；`31ba0f2` → `9800c50`，`5fda514` → `662de2b`。逐提交核对 tree 完全一致，保留原提交说明及作者/提交时间。仅重写本地历史，未推送；本记录留在工作区，未追加第三个提交。

- 2026-10-21：用户要求增加 Windows x64 未签名 NSIS 安装包，与 macOS arm64 DMG/ZIP 由同一版本标签触发，构建全部成功后发布至同一 Release。保留标签/手动重试入口与不覆盖已有 Release 的规则；首次使用需包含配置的新版本标签。实现位于 `feature/windows-release`，用户随后授权提交、PR 合入 develop 并发布 v0.1.4；Windows 功能由用户验收。

- 2026-10-21：用户要求清理远端 feature/aigc-workspace。fetch 后确认其相对 origin/main 与 origin/develop 的独有提交数均为 0，且没有匹配保护规则；仅删除该远端分支，随后 ls-remote 核对已不存在。main、develop、release/0.1.0 与 v0.1.0 未改动。

- 2026-10-21：用户明确要求清理可清理的本地分支。核验祖先关系和 worktree 占用后，逐个通过 `git branch -d` 删除已合并的 feature/aigc-canvas-design、feature/aigc-workspace、feature/project-foundation、release/0.1.0；发布分支同时确认已合入 main/develop。保留 main、develop 和当前含未提交规则记忆的 feature/github-repository-rules；未改远端分支、标签或现有文件。

- 2026-10-21：用户要求 GitHub 合并后自动删除分支并提供保护配置说明。已通过 GitHub API 开启并回读验证 `delete_branch_on_merge=true`；没有手动删除现有分支。核对时 main、develop、feature/aigc-workspace、release/0.1.0 均未受保护，规则集为空、Actions workflow 为 0、开放 PR 为 0。分支保护尚未代设：建议 main/develop 启用删除限制、禁止强推、PR（个人开发 0 审批）及对话解决；保持 Merge commit，暂不强制不存在的 CI 或线性历史。release/hotfix 双向合并前须避免提前自动删除，可在活动期间加入防删除规则，全部合并后再明确安排单分支清理。此 GitHub 自动删除设置是用户明确授权的例外，不扩大为本地或现有分支批量删除授权。

- 2026-10-20：用户确定采用提供的 Gitflow 图；核对完整图后记录分支职责、流向及 main 命名适配，并在 AGENTS.md 中加入执行入口。已核对本地分支和工作区；未改变 Git 历史。
- 2026-10-20：用户授权本地初始化与提交；建立 develop 和 feature/project-foundation，将基础工程按功能分支提交、再合入 develop 的流程集成，不推送。
