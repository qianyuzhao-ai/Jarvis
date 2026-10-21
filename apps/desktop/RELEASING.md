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
2. 标签须包含本轮工作流、配置、entitlements 和校验脚本。旧标签不会获得新配置，不移动旧标签，也不覆盖已有 Release。
3. macOS 打包步骤先检查五项凭据是否齐全，再由 electron-builder 导入证书、签名、提交公证并附加票据。发布配置不允许缺失证书后降级为未签名包。
4. `scripts/verify-macos-release.sh` 校验目录包，以及 ZIP 解压和 DMG 只读挂载后的实际应用：架构、版本、Bundle ID、签名完整性、Developer ID Application 身份、Team ID、Hardened Runtime、公证票据和 Gatekeeper。临时检查目录留在 runner，不执行批量删除；DMG 检查后卸载。
5. Windows 构建及校验也成功后，统一发布三个文件到同一个 GitHub 预发布 Release。macOS 文件名不含 `unsigned`，Windows 文件名保留该标记。

首次发布仍需回读 Actions 成功状态与 Release 资产，并在 Apple Silicon Mac 上通过实际下载的 DMG 安装、启动并检查核心功能。静态配置通过不等于 Apple 接受了本次公证，也不等于真实签名包可正常运行。

## 本地打包与自动更新边界

`pnpm package:dir` 使用 `scripts/package.mjs` 的本地覆盖配置：关闭正式签名、公证和 Hardened Runtime，不需要云端凭据。它用于结构和运行验证，不作为已公证的正式产物。

当前 `publish: null`，应用尚未接入 `electron-updater`；本次只启用发布包签名、公证，不生成更新通道或证明跨版本升级可用。
