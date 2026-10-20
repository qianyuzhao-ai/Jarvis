# Jarvis

个人工作台桌面应用。已实现 AIGC 创作空间的界面和基础交互，尚未接入 Pi Agent。

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
- Tailwind CSS v4、Lucide 图标、Noto Sans SC 字体、可收起侧栏和浅深主题。
- React Flow 项目画布：添加/拖拽/删除图像与视频节点，独立编辑面板、参考素材、模型参数。
- 缩放、适应视图、缩略图、点阵显示和 24px 网格吸附。
- 项目、节点、素材与视口通过 IndexedDB 自动保存在本机；保存错误会显示提示。
- ESLint、Prettier、桌面冒烟测试、本地应用打包。
- 主进程、preload、renderer 分离；启用沙箱和上下文隔离，renderer 不开放 Node API。

新对话仍待接入。设置表单支持本地保存、取消和校验。生成按钮仅提示尚未接入，不会上传素材或调用真实服务。未实现节点连线、生成任务和结果查询；不包含 Pi Agent 或工具执行。

画布操作：滚轮/触控板平移，Ctrl/⌘ + 滚轮缩放，中键或右键拖动平移；点击节点打开编辑面板，点击空白或 Escape 关闭，Delete/Backspace 删除选中节点。右下角依次是缩略图、点阵和吸附。清除应用数据会清除本地项目；开发服务器与打包应用属于不同存储来源，不自动迁移数据。

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

当前本地验证平台为 macOS arm64。应用未配置正式图标、Developer ID 签名、公证或自动更新，仅用于本地开发验证；Windows 尚未验证。

## 目录

```text
apps/desktop/
  src/main/       Electron 窗口与应用生命周期
  src/preload/    只读的运行时信息桥接
  src/renderer/  React 页面和样式
  src/shared/    跨进程共享类型
  tests/         Electron 冒烟测试
  scripts/       本地打包入口
packages/config/ 共享 TypeScript 配置
memory/          项目决策与设计记忆
```

开发约定见 [AGENTS.md](AGENTS.md)，工程状态见 [memory/engineering.md](memory/engineering.md)，设计要求见 [memory/design.md](memory/design.md)。
