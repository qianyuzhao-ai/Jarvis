# Jarvis 工程记忆

最后更新：2026-10-20

## 范围与结构

- 用户要求先搭建基础项目，明确暂不引入 Pi Agent 相关工具。
- 沿用系统架构方案的 pnpm workspace、Turborepo、Electron、electron-vite、React、TypeScript 和 Tailwind v4。
- 目前仅有 `apps/desktop` 与 `packages/config`；未预建空的 Agent、存储或工具包。
- Node 22.23.3 由 pnpm 的 devEngines.runtime 下载管理，不修改全局 Node；pnpm 11.24.0。
- Electron 44.9.1、electron-vite 6.0.0、React 19.3.1、Vite 8.3.4、Tailwind 4.3.3、TypeScript 5.9.3。具体版本以 package.json 和 lockfile 为准。
- 主进程为 ESM，沙箱 preload 为 CommonJS；renderer 禁止直接引入 Electron/Node。
- 开启 sandbox、contextIsolation，关闭 nodeIntegration；preload 暴露运行时版本信息及受限的上传、生成任务、URL 媒体预览接口，没有通用 Node/文件/Shell 权限。拒绝权限请求、新窗口和外部导航。
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
