# Jarvis

先阅读 `AGENTS.md`，遵守其中的记忆维护和文件删除限制。

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
- 使用 pnpm、TypeScript strict、ESLint + Prettier、Tailwind v4 和 Lucide。
- React 组件使用 PascalCase 文件名，其余模块使用 kebab-case。
- 不关闭 sandbox/contextIsolation，不向 renderer 暴露通用文件、Shell 或 IPC 接口。
- 新增原生能力时设计明确的最小接口，再补对应验证。
- 工程现状记录在 `memory/engineering.md`；UI 工作先读 `memory/design.md`。
