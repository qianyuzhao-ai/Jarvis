# Jarvis Gitflow 管理方案

最后更新：2026-10-21

## 决策与来源

用户于 2026-10-20 明确要求本项目使用提供的 Gitflow 分支管理参考图。

- 来源文件：`/Users/hugo/Library/Mobile Documents/com~apple~CloudDocs/hugo-WorkOS/Software Development/01 Software Development - Resources/Git - Gitflow 分支管理参考图.pdf`
- 已渲染并检查完整单页图，作者 Vincent Driessen，标题 A successful Git branching model，图中标注许可 Creative Commons BY-SA。
- 原图来源链接：<http://nvie.com/posts/a-successful-git-branching-model/>。本次依据用户提供的 PDF 整理，未额外核对网页。
- 本文件为对原图分支流程的中文整理，并补充本仓库的命名与执行约定。

## 当前分支职责和流向（2026-10-21 用户更新）

`v0.1.3` 标签保持指向 main 发布提交 `9c575c0`。原标签作业在 GUI 测试失败，第一次手动重试因 arm64 runner 容量不足零步骤失败；流程修正经 PR #11/#12 和 #13/#14 依序通过 develop→main。第二次手动输入原标签，在 Intel macOS runner 上成功交叉构建 arm64 DMG/ZIP 并创建 [v0.1.3 GitHub 预发布](https://github.com/qianyuzhao-ai/Jarvis/releases/tag/v0.1.3)；具体运行验证与未签名边界见 `memory/engineering.md`。未修改或重建受保护标签。

新流程首次试验 `0.1.2` 已完成分支合并和标签创建；唯一云端运行在窗口测试阶段失败，没有安装包或 GitHub Release。后续修复使用新补丁版本 `0.1.3`，不移动受保护的旧标签；具体运行结果见 `memory/engineering.md`。

| 分支 | 从哪里创建 | 用途 | 完成后合入 |
| --- | --- | --- | --- |
| `main` | 现有主分支 | 正式发布状态；对应原图 `master` | 长期保留 |
| `develop` | 初始从 `main` 创建 | 集成下一版本的开发成果；发版前更新版本和变更记录 | 经 PR 直接合入 `main` |
| `feature/<主题>` | `develop` | 独立功能开发，可跨越多个发布周期 | `develop` |
| `hotfix/<版本或主题>` | `main` | 已发布版本的线上紧急缺陷修复 | `main` 和 `develop` |

当前正常发版顺序：所有新功能通过 PR 进入 `develop` → 在 `develop` 定版本和记录 → `develop` PR 到 `main` → 合并后在 `main` 合并提交创建 `v<版本号>` 标签 → 标签只触发一次 GitHub 云端流程，分别构建 macOS arm64 和 Windows x64 未签名包，全部成功后统一预发布。PR 和普通分支推送不触发云端构建。已有标签的任务失败或被取消时，手动输入该标签重试同一工作流。正常发版不再创建 `release/*` 分支；0.1.0/0.1.1 曾使用的 release 分支保留为历史，不自动删除。

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

- 2026-10-21：用户要求增加 Windows x64 未签名 NSIS 安装包，与 macOS arm64 DMG/ZIP 由同一版本标签触发，构建全部成功后发布至同一 Release。保留标签/手动重试入口与不覆盖已有 Release 的规则；首次使用需包含配置的新版本标签。实现位于 `feature/windows-release`，用户随后授权提交、PR 合入 develop 并发布 v0.1.4；Windows 功能由用户验收。

- 2026-10-21：用户要求清理远端 feature/aigc-workspace。fetch 后确认其相对 origin/main 与 origin/develop 的独有提交数均为 0，且没有匹配保护规则；仅删除该远端分支，随后 ls-remote 核对已不存在。main、develop、release/0.1.0 与 v0.1.0 未改动。

- 2026-10-21：用户明确要求清理可清理的本地分支。核验祖先关系和 worktree 占用后，逐个通过 `git branch -d` 删除已合并的 feature/aigc-canvas-design、feature/aigc-workspace、feature/project-foundation、release/0.1.0；发布分支同时确认已合入 main/develop。保留 main、develop 和当前含未提交规则记忆的 feature/github-repository-rules；未改远端分支、标签或现有文件。

- 2026-10-21：用户要求 GitHub 合并后自动删除分支并提供保护配置说明。已通过 GitHub API 开启并回读验证 `delete_branch_on_merge=true`；没有手动删除现有分支。核对时 main、develop、feature/aigc-workspace、release/0.1.0 均未受保护，规则集为空、Actions workflow 为 0、开放 PR 为 0。分支保护尚未代设：建议 main/develop 启用删除限制、禁止强推、PR（个人开发 0 审批）及对话解决；保持 Merge commit，暂不强制不存在的 CI 或线性历史。release/hotfix 双向合并前须避免提前自动删除，可在活动期间加入防删除规则，全部合并后再明确安排单分支清理。此 GitHub 自动删除设置是用户明确授权的例外，不扩大为本地或现有分支批量删除授权。

- 2026-10-20：用户确定采用提供的 Gitflow 图；核对完整图后记录分支职责、流向及 main 命名适配，并在 AGENTS.md 中加入执行入口。已核对本地分支和工作区；未改变 Git 历史。
- 2026-10-20：用户授权本地初始化与提交；建立 develop 和 feature/project-foundation，将基础工程按功能分支提交、再合入 develop 的流程集成，不推送。
