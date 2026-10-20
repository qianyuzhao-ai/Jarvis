# Jarvis Gitflow 管理方案

最后更新：2026-10-20

## 决策与来源

用户于 2026-10-20 明确要求本项目使用提供的 Gitflow 分支管理参考图。

- 来源文件：`/Users/hugo/Library/Mobile Documents/com~apple~CloudDocs/hugo-WorkOS/Software Development/01 Software Development - Resources/Git - Gitflow 分支管理参考图.pdf`
- 已渲染并检查完整单页图，作者 Vincent Driessen，标题 A successful Git branching model，图中标注许可 Creative Commons BY-SA。
- 原图来源链接：<http://nvie.com/posts/a-successful-git-branching-model/>。本次依据用户提供的 PDF 整理，未额外核对网页。
- 本文件为对原图分支流程的中文整理，并补充本仓库的命名与执行约定。

## 分支职责和流向

| 分支 | 从哪里创建 | 用途 | 完成后合入 |
| --- | --- | --- | --- |
| `main` | 现有主分支 | 正式发布状态；对应原图 `master` | 长期保留 |
| `develop` | 初始从 `main` 创建 | 集成下一版本的开发成果 | 通过 release 流程发布 |
| `feature/<主题>` | `develop` | 独立功能开发，可跨越多个发布周期 | `develop` |
| `release/<版本>` | `develop` | 发布准备、测试及缺陷修复，不接收新功能 | `main` 和 `develop` |
| `hotfix/<版本或主题>` | `main` | 已发布版本的线上紧急缺陷修复 | `main` 和 `develop` |

原图明确表达的流程：

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
- 如已有 release 分支，hotfix 必须同步给该发布分支，并确保最终也进入 develop，避免下一次发布重新带回旧缺陷。
- 合并前执行与变更相关的检查。应用代码通常需要 `pnpm check` 和构建；涉及窗口、preload 或启动交互时执行 `pnpm test:smoke`。纯文档修改检查内容和 diff 即可。
- 开始工作先检查当前分支、工作区及目标基线；需要最新远端状态时先 fetch，再从正确基线开分支，不覆盖已有工作。
- 提交、推送、合并、打标签和正式发布按用户任务授权执行。此文档本身不授予这些操作的执行权限。
- 不自动清理分支或工作区；文件删除继续遵守 AGENTS.md，禁止批量删除。

## 当前初始化状态

2026-10-20 用户授权初始化本地分支、提交当前基础工程，并明确暂不推送。

- 基线为现有本地 `main` 的 `b12a158`（Initial commit），与本地记录的 `origin/main` 一致；本次未 fetch，不声称远端服务器状态已刷新。
- 已从该基线创建 `develop`，再从 develop 创建 `feature/project-foundation`，保留全部现有改动。
- 本次集成流程：在 `feature/project-foundation` 提交基础工程及项目规则，检查通过后以 `--no-ff` 合入 `develop`，保留功能分支。
- `main` 保持初始基线；尚无发布，不建立 release/hotfix 分支或版本标签，不推送。实际提交与合并结果以 `git log --graph --oneline --all` 为准。

## 变更记录

- 2026-10-20：用户确定采用提供的 Gitflow 图；核对完整图后记录分支职责、流向及 main 命名适配，并在 AGENTS.md 中加入执行入口。已核对本地分支和工作区；未改变 Git 历史。
- 2026-10-20：用户授权本地初始化与提交；建立 develop 和 feature/project-foundation，将基础工程按功能分支提交、再合入 develop 的流程集成，不推送。
