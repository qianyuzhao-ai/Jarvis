# macOS 签名与公证

正式发布使用 `electron-builder.release.yml`：macOS arm64 产物要求 Developer ID Application 签名、Hardened Runtime 和 Apple 公证。`forceCodeSigning` 只在 macOS 启用，Windows x64 NSIS 仍未签名。

## GitHub Actions Secrets

在仓库 Settings → Secrets and variables → Actions 添加以下 Repository secrets：

| 名称 | 内容 |
| --- | --- |
| `CSC_LINK` | 包含证书和私钥的 `.p12` 文件的 Base64 内容 |
| `CSC_KEY_PASSWORD` | 导出 `.p12` 时设置的密码 |
| `APPLE_ID` | 有权为该团队提交公证的 Apple 账户邮箱 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 该 Apple 账户生成的 App 专用密码 |
| `APPLE_TEAM_ID` | 与签名证书一致的 10 位开发者团队 ID |

不要将证书、私钥、密码或 Base64 内容提交到仓库、聊天或日志。更新 Apple 账户主密码会撤销 App 专用密码，需要重新生成并更新对应 Secret。更换签名证书时重新导出带私钥的 `.p12`，同时更新证书和解密密码。

## 发布和验证

1. 按 `memory/git-workflow.md` 完成 feature → develop → main，版本号和变更记录在发版前确定。仅在获得发布授权后创建新版本标签。
2. 应用源码、版本号、打包配置和 entitlements 来自版本标签；macOS 校验脚本来自工作流触发提交，独立稀疏检出到 `.release-tools`，不混入应用。修复校验工具后，在 Actions 选择最新 main 手动输入旧标签重试；直接重跑原运行仍使用原工作流。旧标签不获得新的应用配置，不移动旧标签，也不覆盖已有 Release。
3. macOS 打包步骤先检查五项凭据是否齐全，再由 electron-builder 导入证书、签名、提交公证并附加票据。发布配置不允许缺失证书后降级为未签名包。
4. `scripts/verify-macos-release.sh` 校验目录包，以及 ZIP 解压和 DMG 只读挂载后的实际应用：架构、版本、Bundle ID、签名完整性、Developer ID Application 身份、Team ID、Hardened Runtime、公证票据和 Gatekeeper。临时检查目录留在 runner，不执行批量删除；DMG 检查后卸载。
5. 各平台运行 `scripts/verify-packaged-startup.mjs <产物目录>`：先用打包的 Electron 检查 ASAR 中全部必需依赖，再启动实际打包的 Jarvis（独立临时 profile，工作目录在仓库外），验证 packaged 状态、版本、ASAR 页面、设置页和更新桥接；禁止借用工作区 node_modules。依赖缺失或启动失败时不上传、不发布。
6. 各平台运行 `scripts/verify-update-metadata.mjs <产物目录> <macos|windows>`，校验清单版本、平台文件名、更新目标、实际文件大小与 SHA-512。Windows 构建及校验也成功后，统一发布三个安装文件、更新清单和生成的 blockmap 到同一个 GitHub 预发布 Release。macOS 文件名不含 `unsigned`，Windows 文件名保留该标记；`builder-debug.yml` 及其他 builder 调试清单不上传到 Release。

首次发布仍需回读 Actions 成功状态与 Release 资产，并在 Apple Silicon Mac 上通过实际下载的 DMG 安装、启动并检查核心功能。静态配置通过不等于 Apple 接受了本次公证，也不等于真实签名包可正常运行。

`stapler validate` 和 `spctl --assess` 仅对明确的 Apple 网络错误（NSURLErrorDomain/CFNetwork 的 -1001、-1003、-1004、-1005、-1006、-1009）最多执行 3 次，间隔 5 秒和 10 秒。明确 rejected/revoked、签名错误、无网络标识的票据失败立即停止；Error 68 本身不触发重试。最后一次失败仍返回原退出码，阻止发布，`codesign` 不重试也不跳过。回归脚本 `scripts/apple-network-retry.test.sh` 验证恢复、次数上限和真实拒绝边界，云端先运行回归再验证实际产物。

## 查询公证进度

长时间无新日志时，可在 Actions 中手动运行 `Apple notarization status`（`notarization-status.yml`，选择 main）。它使用现有三项 Apple Secrets，只调用 `notarytool history`，不会构建应用、上传文件或重新提交公证。

- `In Progress`：Apple 已收到提交，尚在处理；保留原运行，不因等待而重复上传。
- `Accepted`：Apple 已接受公证，仍需原工作流附加票据并完成包内签名、Gatekeeper 校验和统一发布。
- `Invalid`：公证未通过，读取原发布作业的 Apple 诊断日志后定位原因。

0.1.8 的首次提交 ID 为 `71055590-e096-4ee7-974c-6e75244c9610`，Apple 接收时间为北京时间 2026-10-21 22:09:14。实时结果见 Actions，阶段性验证记录见 `memory/engineering.md`。

## 本地打包与自动更新边界

`pnpm package:dir` 使用 `scripts/package.mjs` 的本地覆盖配置：关闭正式签名、公证和 Hardened Runtime，不需要云端凭据。它用于结构和运行验证，不作为已公证的正式产物。

基础配置保持 `publish: null`，本地目录包没有更新源，因此界面明确禁用更新。正式发布配置单独指定公开 GitHub provider `qianyuzhao-ai/Jarvis`，electron-builder 将更新源写入应用资源中的 `app-update.yml`，并生成 `latest-mac.yml` / `latest.yml`（带 SemVer 预发布后缀时使用相应通道名）。客户端不携带 GitHub token，不允许 renderer 指定更新服务器或文件路径。

## 应用内更新与首次发布验收

- 用户确认包含预发布版本。`electron-updater` 设为允许预发布、拒绝降级、禁止自动下载和普通退出时安装、禁用 Web installer。启动 15 秒后及每 4 小时检查，用户也可从通用设置手动检查。
- 更新提示、进度和错误来自主进程真实状态。下载失败保留新版本供重试，缓存由 electron-updater 管理。只有下载成功后才能进入安装确认；主进程原生确认默认“稍后”，取消后保持下载就绪。
- 安装前检查 Agent、生成、上传、下载、导出和写作请求，向原窗口发送一次性保存确认。renderer 保存项目及写作文档，未保存设置、写作冲突或确认超时均阻止重启；主进程核对窗口、主 frame、URL 和一次性 ID。收到成功回执后关闭窗口，等 `closed` 再调用 `quitAndInstall(false, true)`。交接失败时恢复窗口与错误状态。
- 首个含更新器的版本必须用新版本号发布，不能覆盖 v0.1.8。用户先手动安装该版本 A，再发布更高的签名版本 B，验证 A 能检查到 B、下载进度、取消安装、普通退出不安装、确认后重启进入 B，以及项目/文档/设置/会话保持。
- 回读同一 Release 的更新清单、安装文件与 blockmap，核对文件引用和 SHA-512；macOS 继续核验 Developer ID、公证与 Gatekeeper。Windows NSIS 仍未签名，需要 Windows 实机验证更新行为；不要将 hash 校验描述为 Windows 发布者签名。
- 本地测试使用真实 Electron、模拟更新服务和隔离缓存验证下载/校验/交互，安装交接使用模拟安装器，不替换开发者已安装的应用。本地未签名 ZIP 仅验证打包更新源和清单，不代表真实签名版本间升级已验收。

## pnpm 11 运行时依赖收集修复（2026-10-22）

0.2.0 发布包存在依赖漏打包：Windows 用户报告 builder-util-runtime 无法加载 debug，实际下载的 macOS 发布 ZIP 也复现同一错误；原云端仅校验签名、架构、版本和清单，未覆盖真实启动。

`patches/app-builder-lib@26.15.3.patch` 通过 pnpm patchedDependencies 固定应用一行补丁，使 pnpm 使用 builder 已有的磁盘依赖遍历，避开 pnpm list 去重子树丢失。必需依赖无法解析时遍历直接失败，补丁不能用忽略警告或只添加 debug 代替。版本升级时应重新验证补丁是否仍需要；上游同类问题：https://github.com/electron-userland/electron-builder/issues/10000 。

本地验证命令：`node apps/desktop/scripts/verify-packaged-startup.mjs release/<唯一标识>`。本地目录包保持无正式签名和公证，不能替代后续云端 Windows 原生启动与 macOS 签名公证验证。已崩溃的 0.2.0 客户端无法通过应用内更新修复，需手动安装修复版。
