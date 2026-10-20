# Jarvis 工程记忆

最后更新：2026-10-21

## 范围与结构

- 用户要求先搭建基础项目，明确暂不引入 Pi Agent 相关工具。
- 沿用系统架构方案的 pnpm workspace、Turborepo、Electron、electron-vite、React、TypeScript 和 Tailwind v4。
- 目前仅有 `apps/desktop` 与 `packages/config`；未预建空的 Agent、存储或工具包。
- Node 22.23.3 由 pnpm 的 devEngines.runtime 下载管理，不修改全局 Node；pnpm 11.24.0。
- Electron 44.9.1、electron-vite 6.0.0、React 19.3.1、Vite 8.3.4、Tailwind 4.3.3、TypeScript 5.9.3。具体版本以 package.json 和 lockfile 为准。
- 主进程为 ESM，沙箱 preload 为 CommonJS；renderer 禁止直接引入 Electron/Node。
- 开启 sandbox、contextIsolation，关闭 nodeIntegration；preload 暴露运行时版本信息及受限的上传、生成任务、URL 媒体预览和项目 Excel 导出接口，没有通用 Node/文件/Shell 权限。拒绝权限请求、新窗口和外部导航。
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
