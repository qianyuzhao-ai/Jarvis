# UI V1 实施与验收

最后更新：2026-10-23

任务依据：用户提供的 `codex-prompt-ui-v1.md`。当前授权覆盖 A–D 实现、阶段提交与功能分支推送，不包括 PR、合并或发布。从 origin/develop 创建 feature/ui-v1-foundation；设计分支只读参考，未合入。

设计来源：[方案 v0.2](https://docs.google.com/document/d/1Z2vZyoCYf3dsKiBwbDrzSDeXsLjj6bJWfk6BwnTLd2M/edit)、[V1 Components](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=332-28013)。当前任务明确授权按初稿实施，替代旧设计笔记中本批组件“仅设计、待授权实现”的边界；不改变其他未确认设计的状态。

## A：规范与基建

- 新增 @jarvis/ui 源码工作区、精确 peerDependencies、clsx 2.1.1 与 tailwind-merge 3.7.0；desktop 以 devDependencies 引用，两个 tsconfig 均覆盖 UI 源码。
- tokens.css 保留用户指定全部基础值与浅深语义变量；Tailwind inline 映射、清空默认色板/字号/圆角/阴影。迁移前未发现业务组件使用默认颜色、字号、圆角或阴影工具类。
- 原 styles.css 规则移到 legacy.css；入口统一声明 theme/base/legacy/components/utilities 顺序并加载各功能 CSS。重叠的旧颜色/圆角/字体改用 legacy 前缀保留原值。避免 JavaScript 模块导入顺序提前创建 legacy 层导致 reset 覆盖页面。
- 主题属性移至 html，旧变量也提升到根作用域，Prompt Portal 挂到 body。theme-root 保留布局与更新安装 inert 状态。
- 变量检查器按文件与具体字面量计数约束现存例外；白名单文件也不能新增颜色或任意值。另检查 UI 包对 Electron / window.desktop / 应用路径的依赖边界。检查器回归 1/1 通过。
- tests 顶层 TypeScript 文件中 locator/querySelector/querySelectorAll 的 class/id 调用 270 → 66；其中应用自有样式类调用 208 → 0。剩余为 React Flow / CodeMirror 第三方类（含 React Flow selected 状态）。16 条 toHaveCSS 断言保留。口径与原文估计的 247/13 不同，报告使用实际扫描值。
- 16 张截图（Chat、项目列表、画布、写作、通用、模型服务、内网地址、插件 × Light/Dark）逐像素差异全部为零。目录 `apps/desktop/test-results/ui-v1/before/` 与 `apps/desktop/test-results/ui-v1/phase-a/`；可用 `node scripts/capture-ui.mjs <阶段>` 重采。该基线覆盖页面默认状态，复杂行为由实窗回归覆盖。
- `pnpm check`、`pnpm build` 已通过；最终完整实窗回归 **84/84（3.1m）** 通过。初轮定位迁移误替换 React Flow selected 类，已恢复第三方定位，没有删除行为断言。
- `pnpm package:dir` 成功。目录包 `release/4c9421f4-f67f-458e-b03e-cfb38f7aff46`；verify-packaged-startup.mjs 检查 360 项生产依赖、真实 darwin arm64 启动、ASAR renderer、版本 0.2.5 和更新 bridge 全部通过。必需依赖数未变化；无签名目录包不是发布产物。

## 后续阶段

B、C、D 尚未实施。最终报告在各阶段验证后补齐。
