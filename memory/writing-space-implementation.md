# 写作空间重新设计实施记录

最后更新：2026-10-26

## 授权与基线

用户要求执行 `writing-space-plan.md`。按计划实施 W1–W6、分阶段验证与提交推送功能分支；不创建 PR、不合并、不打标签或发布。每阶段必须通过验证，Claude 负责最终阶段验收。

- 从 fetch 后的 `origin/develop`（`48d698e`，0.4.0）创建 `feature/writing-space`。
- 合入原会话分支的三条方案/设计记录，`memory/design.md` 顶部冲突保留两侧内容，合并提交 `b982f02`。
- 两份已有未跟踪文件 `writing-redesign-components-state.json`、`writing-redesign-components-scripts.json` 保留，不作为本轮实现新增文件。

## W1：实现已保存，阶段门禁未通过

实现提交：`631e6df`（`feat ✨️: 实现写作空间W1文件能力与多目录标签`）。

### 已实现

- 全格式列表与文件类型、文件大小/修改时间；文本白名单、严格 UTF-8 解码、BOM/CRLF 保留和版本冲突保护。首页 Agent 文档库仍只访问 Markdown。
- 同根目录改名、移动、单文件副本、移入废纸篓（文件/空目录）、系统文件管理器定位；名称与路径检查、拒绝符号链接。所有应用写入按根串行；错误从 IPC 返回时不带系统绝对路径。
- 图片资产 MIME/魔数/10 MiB 校验、assets 保存与同名同内容复用；专用 IPC、mainFrame/可信 URL 校验与活跃写入计数。
- 目录监听 300ms 合并推送、窗口销毁释放、不可监听时保留 2.5s 轮询；所有已打开文本缓冲区外部变更检测。
- `jarvis-writing://` 只读媒体协议、GET/Range/格式校验；CSP 增加该媒体/框架来源，不开放网络或通用文件接口。
- 多文件夹标签、全局标签恢复、旧键一次性迁移；目录切换与打开其他根的文档不裁剪已打开标签。
- 改名迁移主进程 Agent 会话/卡片/账本作用域，运行中或排队回复拒绝改名；renderer 同步文档 ID、标签历史、编辑器缓存与本轮撤销事务。
- 目录行（28px、12px 层级、类型图标、徽标、行内改名、菜单、键盘与文件拖放）、文件/星图分段（W1 星图为空状态）、图片/PDF/音视频/二进制预览。文本使用源码视图；类型标签图标复用 Lucide 1.60。

### 设计核对

读取 Figma 文件 `mIwnyR5nAlECFMam1NvmER` 的 File Tree Row `461:38163`、File Preview `464:38503` 的设计上下文与截图。基础控件复用 V1 Button/Input/Badge/DropdownMenu/Dialog/Tabs；只在业务层组合，无新增颜色变量或检查器白名单。图标使用同版本 Lucide 的对应图标，经 `@jarvis/ui/icons` 导出。

### 验证进度

- 文件主进程 4 组测试通过：全格式/文本/BOM/CRLF/冲突，文件操作边界，资产格式/大小/符号链接，媒体 GET/Range/越界。
- 原写作实窗 6/6 通过（重启单目录恢复、冲突另存、主题与布局等）；跨目录用例增加双根重启恢复，并在完整回归通过。
- 写作 Agent 实窗通过，包括新增的改名后同轮撤销、恢复原名后继续 Agent 编辑；保留原版本冲突与越界断言。
- 新目录实窗通过：F2 改名、修改保存新路径、创建副本、图片真实加载、二进制预览、文本打开；旧键迁移测试在完整回归通过；新增移动、定位与废纸篓确认（原生操作替身）实窗测试随后通过。
- `pnpm check`、`pnpm build` 最终通过。完整 `pnpm test:smoke` 为 **182/183 通过（5.6m）**，唯一失败为既有 `agent-calendar-ui.spec.ts:77`（期望 7 天，实际 0 天）。只读隔离进程回读状态为 `{provider: apple, access: not_determined}`；没有申请权限、读取或修改个人日程，也没有跳过或删除断言。日志 `/private/tmp/jarvis-writing-w1-smoke.log`。
- 完整回归后仅补充文件菜单用例并调整目录头部内边距、选中行背景；最终 check/build、目录实窗 **3/3（8.2s）** 通过。没有把这次专项复验称为全套通过。
- 初轮失败及修复：更多按钮文件名模糊匹配；跨根打开替换标签；另存副本提前裁剪旧标签；新协议遗漏 CSP；目录行默认按钮居中。均保留失败证据并复验相关流程。
- 图片/目录初步截图：`apps/desktop/test-results/a98ffb2c-ac89-4704-9bd1-a3c173ecac56/writing-tree-writing-tree--35fe4-images-and-duplicates-files/`。这些截图早于最终样式。最终目录浅深、图片预览截图在 `apps/desktop/test-results/d31efede-520d-493e-ad53-d9f0bd9d8b4e/writing-tree-writing-tree--35fe4-images-and-duplicates-files/`（`tree-light.png`、`tree-dark.png`、`preview-light.png`），已检查对齐与裁切；不替代 Claude 的逐像素设计验收。

### 与旧测试的冲突处理

`writing.spec.ts` 原“switching writing folders clears obsolete tabs”预期切换目录关闭其他目录标签，与本计划 W1.4 的新行为相反。改为验证两个目录标签保留、切换可读，并增加重启恢复；未删除读取/写入/冲突业务断言。这是需求变化对应的断言替换，非为通过测试放宽行为。

### 尚未验收与实现取舍

- 保留计划中的阶段门禁：完整回归仍有一项失败，且尚无 Claude 的 W1 验收结论，因此不进入 W2。
- 文本文件目前使用 CodeMirror 纯文本源码模式，未新增各语言的语法高亮依赖。文件预览中图片与二进制面板已有实窗验证；PDF 内置查看器与音视频完整播放、Linux 监听降级、Windows 原生废纸篓/定位仍待目标环境验收。
- 目录与预览复用现有 WritingSpace 宿主，目录行与预览独立为 `tree/FileTreeRow.tsx`、`viewers/FilePreview.tsx`；未另拆整份 WritingSidebar。范围与进程边界不变。
- 无新增生产依赖；W6 打包与依赖总验收尚未执行。

## W2–W6

尚未开始。W1 阶段门禁和 Claude 验收尚未通过。
