# Jarvis 工程记忆

最后更新：2026-10-20

## 范围与结构

- 用户要求先搭建基础项目，明确暂不引入 Pi Agent 相关工具。
- 沿用系统架构方案的 pnpm workspace、Turborepo、Electron、electron-vite、React、TypeScript 和 Tailwind v4。
- 目前仅有 `apps/desktop` 与 `packages/config`；未预建空的 Agent、存储或工具包。
- Node 22.23.3 由 pnpm 的 devEngines.runtime 下载管理，不修改全局 Node；pnpm 11.24.0。
- Electron 44.9.1、electron-vite 6.0.0、React 19.3.1、Vite 8.3.4、Tailwind 4.3.3、TypeScript 5.9.3。具体版本以 package.json 和 lockfile 为准。
- 主进程为 ESM，沙箱 preload 为 CommonJS；renderer 禁止直接引入 Electron/Node。
- 开启 sandbox、contextIsolation，关闭 nodeIntegration；preload 只暴露运行时版本信息。拒绝权限请求、新窗口和外部导航。
- UI 是工程启动页；可展开和收起侧栏，默认宽度 230px，最大值 320px，尚未实现拖拽调整。新对话、设置和 AIGC 入口禁用。
- 不包含 Pi Agent、模型 SDK、MCP、Skill 执行、数据库和 React Flow。完整 Figma 页面留待后续任务。

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
