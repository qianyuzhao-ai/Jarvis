# Jarvis 设计记忆

最后更新：2026-10-20

本文件记录本项目的设计要求、Figma 位置、设计变更和未决事项。后续设计工作先读本文件，再检查 Figma 实际状态；如两者不一致，以用户最新要求和实时文件为准。

## 项目与设计范围

- 项目目录：`/Users/hugo/Developer/my-jarvis`。
- 仓库：<https://github.com/qianyuzhao-ai/Jarvis>。
- 产品名使用 **Jarvis**。方案文档沿用 **Pi Workbench** 名称，尚未统一改名。
- 产品定位：以 AI 对话、文件读取和工具调用为核心的个人工作台；先自用，再公开发布，也作为求职作品。
- 2026-10-20 用户授权搭建本地基础工程，并明确暂不引入 Pi Agent 相关工具。现已建立 Electron + React 启动页和可收起侧栏，尚未完整实现 Figma 页面。Figma 中出现的按钮、配置和状态不代表功能已实现；工程状态见 `memory/engineering.md`。
- 用户已要求绘制首页和设置页，并指定所有主组件集中存放的位置。
- 用户新增 AIGC 创作空间：侧栏入口切换到项目列表，一个项目对应一张独立的无限画布，画布技术指定为 React Flow。该新增要求扩展了原方案的功能范围；当前只完成入口和项目列表设计，尚未开发或接入 React Flow。
- 用户明确纠正：**给 Sidebar 做变体，不是给首页做变体。** 首页、项目列表和设置页保持独立 Frame；侧栏统一为一个本地组件集。
- 当前页面是已交付的第一版设计，不等于用户已经确认全部视觉细节。

## 方案中的设计约束

- 初始方案为 macOS 桌面端，最低支持 macOS 26，以 Liquid Glass 设计语言为方向。
- 用户已考虑未来 Windows 版本，并因此决定统一使用 Lucide 图标、将已用官方组件取消远程关联。当前仍是现有桌面页面的设计调整，尚未实现或确认 Windows 版开发排期；独立网页端与 iOS 尚未开发。
- 视觉应接近 macOS 应用：克制的层级、浅色窗口、轻透侧栏、清晰的文字与控件。
- 优先考虑键盘操作、VoiceOver、Reduced Motion 和可读性。这些是设计与实现目标，尚未完成实际无障碍验收。
- 设计 token 驱动界面；后续代码按需引入和改造 shadcn，不全量导入组件。
- Figma 中保留可编辑文字、矢量、自动布局和组件实例，不能用整页截图代替 UI。
- Figma Variables 到代码的同步、Code Connect、Storybook 均为方案目标，目前尚未接入。
- 画布中的材质与阴影只是设计表达，不代表已验证 Electron 能实现对应原生效果。

## Figma 文件与组织规则

文件：[Jarvis](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis)

文件 Key：`mIwnyR5nAlECFMam1NvmER`

| 用途 | 页面或节点 | 链接 |
|---|---|---|
| 界面页面 | `Page 1`，`0:1` | [界面页面](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=0-1) |
| 首页 | `Jarvis / 首页 / 新对话`，`5:35` | [首页](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=5-35) |
| 设置页 | `Jarvis / 设置 / 模型服务`，`8:53` | [设置页](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=8-53) |
| 创作空间项目列表 | `Jarvis / AIGC 创作空间 / 项目列表`，`42:625` | [项目列表](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=42-625) |
| 主组件页面 | `components`，`2:104` | [组件库](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=2-104) |
| 首页组件组 | `Jarvis / 首页组件`，`5:36` | [首页组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=5-36) |
| 设置组件组 | `Jarvis / 设置组件`，`8:54` | [设置组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=8-54) |
| 控件样本与适配组件 | `Jarvis / 控件样本与适配`，`17:104` | [控件样本](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=17-104) |
| 本地控件主组件 | `Jarvis / 本地控件`，`25:326` | [本地控件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=25-326) |
| Lucide 图标 | `Lucide / Icons`，`26:330` | [图标组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=26-330) |
| 上下文用量交互状态 | `Jarvis / Context usage / 交互状态`，`38:508` | [默认与悬停状态](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=38-508) |
| 创作空间组件 | `Jarvis / 创作空间组件`，`41:518` | [创作空间组件](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=41-518) |
| Sidebar 组件集 | `Jarvis / Sidebar`，`48:1001` | [侧栏变体](https://www.figma.com/design/mIwnyR5nAlECFMam1NvmER/Jarvis?node-id=48-1001) |

**用户明确要求：用到的主组件都放在 `components` 页面。** 新增主组件也遵循这个位置，界面页面使用实例。

- 最新要求：统一使用 Lucide 图标，将已使用的官方组件取消远程关联，允许轻微调整。这一要求取代之前“优先使用官方关联实例”的方向。
- 页面使用本地主组件的实例，保留本地复用关系；不要重新引入 Apple 远程实例或 SF Symbols 字符。
- 本地化组件保留来源说明。取消远程关联不改变原素材许可，也不代表已完成 Windows 素材授权审查。
- 修改前读取目标节点、现有组件和样式，优先复用。
- Sidebar 的 Main 和 Settings 是侧栏布局变体，不是整页变体。不要创建 `Home` 组件集，也不要把设置分类移到主内容区来实现这个要求。
- 普通组件整理应保留节点 ID；用户明确要求的远程组件本地化可以创建新主组件并重接实例，但必须恢复文字、状态、尺寸和本地属性绑定。
- 不擅自改变用户调整过的页面位置或已有内容。
- 本项目禁止批量删除文件或目录；需要批量清理时交由用户手动处理。

## 已完成的页面

### 首页：新对话

- 窗口尺寸：`1280 × 820`。
- 主内容区 `6:91` 的左上、左下圆角为 16px，窗口底色与侧栏一致，让主内容的左侧圆角可见；右侧仍由窗口外轮廓控制。
- 左侧：窗口控制、Jarvis 名称、新对话按钮、AIGC 创作空间入口、按时间分组的历史会话、用户与设置入口。本轮实时读取时侧栏中已无会话搜索，保留现状，不按旧记录恢复。
- 用户认为旧的新对话灰色选中条不好看，已改为白底细描边操作按钮：40px 高、10px 圆角、Lucide square-pen 图标、右侧 ⌘ N 提示，主组件 `41:535`。在侧栏中横向 FILL，230px 侧栏默认内宽为 198px；主组件原始宽度 228px 不作为页面内的固定宽度。当前按钮为共享 Sidebar 内的嵌套实例，不再使用原实例 ID `6:38`。
- 首页侧栏实例为 `49:648`，引用 Sidebar 的 Main 变体。创作空间入口为 `I49:648;46:777`，默认无底色，点击切到项目列表 `42:625`；旧入口 `42:610` 已随原侧栏替换。
- 首页已加入点击收起/展开侧栏的原型。默认展开，收起后主内容铺满窗口，输入框保持 680px 宽并居中；窗口控制和展开按钮在收起态显示于主内容工具栏左侧。
- 主区：欢迎语、输入区、添加文件图标按钮、上下文占用圆环、模型选择、发送按钮、开始建议和键盘提示。
- 用户明确要求：模型选择左侧显示模型上下文占用圆环；添加文件使用 icon button，不显示“添加文件”文字按钮。
- 输入操作行顺序：添加文件图标按钮 → 弹性留白 → 上下文占用 → 模型选择 → 发送。
- 最新要求：默认只显示上下文圆环，不在输入栏显示百分比或其他数字。悬停显示详细面板，包含已用 token、总容量、剩余空间和占用比例。
- 当前首页为新对话空圆环示意；数字只在详情面板中出现。未知用量使用虚线环，面板明确标为未知，不能当作 0%。
- 开始建议：梳理一份资料、推敲一个想法、把讨论变成计划。
- 当前输入框为空，发送按钮按未输入状态展示。
- 历史会话、用户名和模型名称是设计示例，不是从用户实际会话或账号读取的数据。

### 设置页：模型服务

- 窗口尺寸：`1180 × 820`。
- 设置详情区 `9:370` 同步使用左上、左下 16px 圆角，保持与首页相同的内容表面处理。
- 左侧分类：通用、模型服务、外观、文件与权限、MCP 连接、Skill、数据与隐私、关于 Jarvis。
- 左侧整体为 Sidebar 的 Settings 变体实例 `49:1029`，保留原分类布局；没有迁移成顶部标签，也没有将设置页做成首页变体。
- 当前只绘制了“模型服务”详情，其他分类只是导航入口，不能描述为已完成的设置页面。
- 详情包括服务商切换、添加服务商、API Key、接口地址、测试连接、默认模型、取消与保存。
- API Key 默认遮蔽；测试连接和保存更改是不同操作。
- 默认模型说明限定为“新对话使用此模型，已有对话不受影响”。
- “已配置”“尚未测试当前配置”“更改尚未保存”都是设计状态，不代表真实服务已连接或保存。
- 首页及项目页底部设置入口已连到本页，设置侧栏“返回工作台”已连到首页；分类切换、输入、保存和连接测试仍未接通原型。

### AIGC 创作空间：项目列表

- 窗口 `42:625`，尺寸 `1280 × 820`；主内容 `43:544`，沿用左侧 16px 圆角。
- 页面与首页引用同一个 Sidebar Main 主组件，实例为 `49:890`。嵌套创作空间入口 `I49:890;46:777` 呈浅蓝选中态；新对话按钮 `I49:890;46:776` 点击返回首页。原入口 `42:635` 和按钮 `42:634` 已随原侧栏替换。
- 主内容包括“我的项目”标题、新建项目按钮、搜索项目、最近编辑排序和紧凑项目列表。
- 列表 `43:595` 展示画布结构缩略示意、项目名称与描述、节点数量、最后编辑时间、更多操作入口。
- 当前 4 个项目均为设计示例：播客片头视觉探索、人物一致性测试、产品短片分镜、下期播客封面；缩略图和节点数量不是实际项目数据。
- 用户明确的产品模型为“一个项目 = 一张独立无限画布”。React Flow 是后续实现要求，不出现在面向用户的界面文案中。
- 本轮只设计入口与列表，未绘制画布编辑页；项目行打开画布、新建项目、搜索、排序及更多操作尚未接通原型或真实功能。
- 已回读验证首页到列表、列表到新对话的两条原型连线；尚未用真实鼠标在 Present 模式中走查。

## 组件清单

### Sidebar 复用与变体

- 组件集：`Jarvis / Sidebar`，`48:1001`，位于 `components` 页的 `Jarvis / Sidebar components`（`46:737`）中。
- `Mode=Main` 主组件 `46:897`，默认尺寸 230 × 820，供首页和创作空间共同引用。创作空间选中状态通过嵌套入口的 State 属性覆盖，不复制整份侧栏。
- `Mode=Settings` 主组件 `48:874`，默认尺寸 230 × 820，供设置页引用，保留设置分类与返回工作台入口。
- 用户明确指定：展开态最小宽度 230px，默认使用最小宽度 230px。最大宽度当前按设计建议设为 320px，用于避免挤占主内容；320px 是建议值，不是 Apple 规范要求或用户另行指定的数值。
- 两个主组件及三页实例均设置 minWidth=230、maxWidth=320；内部按钮、标题容器、列表和底部区域横向自适应。组件描述及可见说明区 `60:1022` 均记录了宽度规则。
- 宽度 token：`size/sidebar/min`（`VariableID:60:1020`）和 `size/sidebar/max`（`VariableID:60:1021`），位于原 Jarvis 设计变量集合，Light/Dark 值相同。
- 项目页与设置页的主内容、表单和表格调整为 FILL，以适应 230–320px 的侧栏范围；已验证 320px 时关键内容没有横向溢出。此处仅为 Figma 尺寸约束，尚未实现应用中的拖拽调宽。
- 组件集暴露 `Mode` 和 `User name` 属性；主导航态的创作空间及设置入口是可编辑的嵌套实例。
- 页面映射：`5:35` → `49:648` → Main；`42:625` → `49:890` → Main；`8:53` → `49:1029` → Settings。
- 两个 Main 实例的设置按钮分别为 `I49:648;46:898`、`I49:890;46:898`，点击进入设置页；设置页返回入口 `I49:1029;48:873` 点击回到首页。
- 三张页面的 Frame ID、尺寸、画布位置和主内容均保留。原侧栏 Frame `6:26`、`42:626`、`9:273` 已被组件实例替代，旧侧栏内节点 ID 不再作为定位依据。
- 曾误建的 `Jarvis / Home` 组件集已按用户纠正删除，组件库中没有 Home 页面变体。后续不要恢复该结构。

### 首页侧栏收起/展开

- 没有创建首页组件变体，也没有复制一张收起态页面。原首页 Frame `5:35` 通过本地交互变量切换显示状态。
- 变量集合 `Jarvis / 首页侧栏交互`，ID `VariableCollectionId:53:1011`，模式 Expanded `53:0`、Collapsed `53:1`。默认模式为 Expanded，交付时首页没有强制指定模式。
- 变量：sidebar/visible `VariableID:53:1012`、titlebar/show-window-controls `VariableID:53:1013`、sidebar/width `VariableID:55:808`、titlebar/window-controls-width `VariableID:55:809`。
- 首页侧栏实例 `49:648` 保留，放在新的容器 `57:798` 中。可见性与占位宽度绑定在容器上，不能直接绑定实例可见性：本轮发现直接隐藏实例后，连接器可能在恢复模式时丢失可见性绑定。
- 同时控制容器可见性与宽度，避免隐藏内容后仍保留空白占位。侧栏展开默认占 230px，交互变量 sidebar/width 的 Expanded 值已同步为 230；Collapsed 值仍为 0。不要把 230px 最小宽度加到收起容器上。收起时主内容从 x=1 开始、宽 1278px，填满 1280px 窗口的边框内区域。
- 主内容 `6:91`、工具栏 `6:92`、对话区域 `6:104`、底部说明 `6:157` 改为横向 FILL。聊天内容列及输入框仍固定 680px，不随窗口拉伸成过长行。
- 新增本地切换按钮组件集 `Jarvis / Sidebar toggle`，`53:1024`；Collapse `53:1014`、Expand `53:1019`，尺寸 30 × 30，使用 Lucide panel-left。
- 首页收起按钮为 `I49:648;53:1025`；收起态工具栏组 `54:1053` 包含窗口控制和展开按钮 `54:1058`。展开时该工具栏组隐藏且不占位。
- 两个按钮分别通过 ON_CLICK → SET_VARIABLE_MODE 切换 Collapsed / Expanded。此次为即时状态切换，没有添加动画时间线。应用实现阶段仍需补键盘操作及无障碍提示。
- 只给首页绑定了收起/展开事件。项目列表与设置页未接入这一交互，不因共用 Sidebar 自动获得对应原型行为。
- 验证：检查两个状态截图，并通过“切到收起 → 恢复默认展开”的完整变量模式循环回读位置、可见性、绑定和导航。展开后收起按钮及创作空间/设置导航仍存在。未用真实鼠标在 Present 中走查。

首版创建了以下 17 个本地主组件。此表保留节点记录，不代表全部仍用于当前页面；当前使用情况见下方迁移记录。

| 分组 | 组件 | 节点 ID |
|---|---|---|
| 首页 | Sidebar / Conversation | `6:2` |
| 首页 | Sidebar / Selected | `6:6` |
| 首页 | Starter / Row | `6:12` |
| 首页 | Button / Icon | `6:21` |
| 设置 | Settings / Navigation row | `9:229` |
| 设置 | Settings / Navigation icon | `9:230` |
| 设置 | Settings / Icon / model | `9:241` |
| 设置 | Settings / Icon / appearance | `9:245` |
| 设置 | Settings / Icon / folder | `9:249` |
| 设置 | Settings / Icon / plug | `9:252` |
| 设置 | Settings / Icon / skill | `9:255` |
| 设置 | Settings / Icon / data | `9:259` |
| 设置 | Settings / Icon / info | `9:263` |
| 设置 | Settings / Text field | `9:267` |
| 设置 | Button / Secondary | `9:269` |
| 设置 | Button / Primary | `9:271` |
| 设置 | Settings / Provider | `9:378` |

并非所有独立界面元素都已组件化。后续发现需要复用的元素时，再提取为主组件并放入组件库页面。

### 历史：迁移到 macOS 26 官方组件

以下记录保留官方来源和迁移过程，已被后续“本地控件 + Lucide”决定取代。首页与设置页的根节点 ID、窗口尺寸和画布位置保持不变，但当前已无远程实例关联。

| 官方组件 | 用途 | 已导入组件集 ID |
|---|---|---|
| Window Controls/Standard | 两页窗口控制 | `12:131` |
| Item | 会话列表、设置分类、新对话选中态 | `14:113` |
| Search Field | 搜索对话、搜索设置 | `14:290` |
| Push Button | 测试连接、取消、保存、添加文件、添加服务商、返回工作台 | `14:627` |
| Text Field | API Key、接口地址 | `14:915` |
| Pop-Up Button | 首页模型选择、设置默认模型 | `14:939` |
| Segmented Control | Anthropic / OpenAI 服务商切换 | `14:1043` |
| Window/Button | 工具栏更多操作、禁用发送按钮 | `14:976` |

- 本地适配主组件 ID `17:218` 保留，当前改名为 `Jarvis / Sidebar row`。内部仍叫 `Native Item` 的层已改接本地默认或选中组件，不再关联官方库。
- 对话 `17:214`、新对话 `17:217` 及旧设置图标主组件保留 ID，内部图形已替换为 Lucide 实例。
- `Starter / Row`（`6:12`）继续使用，内部文档和箭头图标已替换为 Lucide；聊天输入容器及上下文占用圆环保留本地设计。
- 已不再用于当前两页的旧主组件：`6:2`、`6:6`、`6:21`、`9:229`、`9:267`、`9:269`、`9:271`、`9:378`。它们保留在原组件组中作为首版记录，不应在后续页面继续选用。
- 两页中部分被替换控件取得了新 ID；修改时从现有页面结构定位，不沿用首版控件 ID。
- 侧栏适配实例应使用横向 `FILL`，避免设置页 200 宽容器中继承 228 宽组件而裁切。
- 发送按钮保持官方 XL 的 `36 × 36` 尺寸；输入操作行同步使用 36 高度。

### 当前本地控件

| 本地主组件 | 节点 ID |
|---|---|
| Jarvis / Window controls | `28:330` |
| Jarvis / Sidebar / Default | `28:334` |
| Jarvis / Sidebar / Selected | `28:340` |
| Jarvis / Search field | `25:327` |
| Jarvis / Button / Secondary | `28:361` |
| Jarvis / Button / Primary | `28:367` |
| Jarvis / Text field | `28:373` |
| Jarvis / Model selector | `28:381` |
| Jarvis / Provider switch | `28:392` |
| Jarvis / Icon button / More | `28:411` |
| Jarvis / Icon button / Send disabled | `28:425` |
| Jarvis / Icon button / Add file | `28:438` |
| Jarvis / Button / Text | `28:451` |

- 上述控件已移除嵌套远程实例、远程变量绑定和远程样式依赖；页面继续通过本地实例复用。
- 本地化时须显式重建文字和布尔属性绑定。远程变体单独克隆后，属性定义及绑定可能不保留，不能只检查 `componentProperties` 的值。
- 中文按钮文字使用自动宽高，不沿用英文默认标签的固定宽度，否则会出现换行或裁切。
- 图标按钮改为轻底色、8px 圆角的本地控件，移除原有玻璃效果；保持现有操作顺序和窗口布局。

### 创作空间与侧栏新增组件

| 组件 | 节点 ID |
|---|---|
| Jarvis / New conversation button | `41:535` |
| Jarvis / Creation space entry | 组件集 `41:559`，Default `41:543`，Selected `41:551` |
| Jarvis / New project button | `41:560` |
| Jarvis / Project list row | `41:566` |
| Lucide / square-pen | `41:520` |
| Lucide / layout-grid | `41:524` |
| Lucide / workflow | `41:530` |

- 主组件均在 `components` 页的 `41:518` 内，没有引入远程组件或 SF 字体。
- 项目行具有 Title、Description、Node count、Updated 文字属性，后续实例修改使用属性覆盖。
- 两类操作语义保持区分：新对话是创建动作，用独立按钮；创作空间是页面导航，用默认/选中状态。

### 聊天输入区组件

- 附件按钮主组件：`Jarvis / Add file`，`22:313`；首页实例 `22:336`。内部改接本地 `28:438`，使用 Lucide `plus`，尺寸 `36 × 36`。
- 上下文占用组件集：`Jarvis / Context usage`，`22:335`；首页实例 `22:343`，紧邻模型选择左侧。
- 圆环组件为 Jarvis 自定义容量指示器。已检索的 macOS 官方 `Determinate` 为横向进度条，未用它替代用户要求的圆环，也未用不确定进度动画表达占用。
- 圆环直径 20，图标控件整体改为 `36 × 36`。默认百分比文字已隐藏，轨道使用 muted 颜色以保证仅图标时仍可辨认。
- 组件集保留 ID `22:335`，增加 `State=Default / Hover`；Usage 仍为 Empty、Used、Unknown。
- Default 变体：Empty `22:322`、Used `22:326`、Unknown `22:331`。Hover 变体分别为 `38:514`、`38:546`、`38:580`。
- 悬停面板尺寸 `288 × 228`，12px 圆角，位于圆环上方，右侧与控件对齐。内容包括模型名、百分比、已使用、总容量、剩余空间，以及系统指令/消息/工具结果的计入说明。
- Empty 的 `0 / 200,000`、Used 的 `50,000 / 200,000` 是设计示例，不代表所选 Claude Sonnet 的真实配置或实时用量；Unknown 显示未知状态及 `—`。
- 交互组件集已移到 `components` 页的状态展示区 `38:508`。原展示行 `22:312` 保留附件主组件和三个默认圆环实例。
- Figma 原型已配置：默认态 `ON_HOVER` 或 `ON_CLICK` 切换为对应 Hover；Hover 态 `MOUSE_LEAVE` 或再次点击返回默认。首页交付时恢复为 Empty / Default。
- 为防止面板裁切，输入操作行、Composer、首页内容列和开始对话容器允许内容溢出；主内容区仍保留圆角裁切。
- 验证方式：回读交互连线，并在首页强制切换 Hover / Default 检查截图；尚未通过真实鼠标在 Present 模式中走查，也没有接入实时数据。
- 后续应用实现仍需支持键盘聚焦、Escape 关闭和“上下文用量”无障碍名称。附件按钮的提示及文件选择功能尚未实现。

## 视觉基础与当前限制

- 变量集合：`Jarvis / 首页`，ID 为 `VariableCollectionId:5:2`。目前首页和设置页共用，名称仍保留初始命名。
- 集合已有 Light / Dark 模式，当前完成的是浅色画面；深色页面尚未进行视觉验收。
- 主要颜色变量：canvas、sidebar、surface、text、secondary、muted、border、accent、selected、accentText、soft。
- 已有间距变量：4、6、8、10、12、16、20、24、28、32、40、48、64。
- 共享文字样式：`Jarvis/body`、`Jarvis/label`、`Jarvis/caption`、`Jarvis/title`、`Jarvis/latin`。
- 当前页面和本地组件统一使用 **Noto Sans SC**，不再依赖 SF Pro / SF Pro Rounded 或 SF Symbols 字符。
- 字体历史：首版遇到 SF Pro 缺字，曾回退至 Noto Sans SC；接受许可后官方控件中的 SF 字体曾显示正常；本次为统一本地设计，全部改为 Noto Sans SC，并验证无缺字。
- 用户已在 Figma 文件中启用 **macOS 26** 库，连接器已确认其处于已添加状态。
- 官方组件导入限制已解除：2026-10-20，用户说明刚刚接受 Apple Design Resources 许可协议，随后单组件和组件集导入均成功。此前 `Not permitted to upsert from library` 与首次使用授权未完成有关，不能归因于订阅不包含 UI Kit。
- 权限排查时先验证了 `Window Title/Standard`（远程主组件 `12:124`）和 `Window Controls/Standard`（远程组件集 `12:131`），未放置测试实例。随后按用户要求完成了上述页面迁移。
- 官方库的权限问题已解决，但用户最新决定是使用本地控件。库保持启用不代表当前页面仍有远程依赖；不要继续沿用“官方库不可调用”的旧结论，也不要未经要求恢复远程关联。
- 排查 Apple UI Kit 时要区分“添加库”和“首次插入时接受资源许可协议”；协议由用户自行阅读和选择，不能代替用户接受。
- 官方依据：[Apple UI Kit 入门](https://help.figma.com/hc/en-us/articles/24037833895831-Get-started-with-Apple-s-UI-kit)说明 UI Kit 对所有套餐开放，首次插入需要接受资源许可，SF Pro 有独立的可选许可步骤。[MCP 入门](https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server)说明教育版支持写入画布。实际账号检查显示用户在 `project` 团队拥有教育版 Full 席位。

### 当前图标规则：Lucide

- 用户明确选择 Lucide，取代此前讨论过的 SF Symbols 方案。
- 使用官方 `lucide` 包的 SVG 路径，当前来源版本为 `1.8.0`，许可标识为 ISC。不要凭外观手绘替代，也不要使用特殊字体字符充当图标。
- 当前图标基于 24px viewBox，线宽 1.75，圆角端点与连接；按控件需要显示为 14、16、18 或 24px，颜色复用 Jarvis 变量。
- 图标主组件位于 `26:330`；已包含 message-square、plus、search、panel-left、sliders-horizontal、cpu、contrast、folder、plug、bookmark-check、database、info、file-text、arrow-right、ellipsis、chevrons-up-down、chevron-down、arrow-up、eye、external-link、chevron-left、x。
- 上下文占用圆环是数据指示组件，不替换为静态 Lucide 图标。macOS 窗口红黄绿控制仍作为当前 Mac 窗口示意保留；未来 Windows 窗口装饰需另行设计。
- 最终检查：界面页 103 处实例、组件页 44 处实例均能解析到本地主组件；两页无远程变量绑定、SF 私用字符和缺失字体。该数量是本次快照，后续修改前仍需实时读取。

### 历史：SF Symbols 使用评估

- 用户询问项目能否使用 Apple SF Symbols。当前项目仅面向 macOS，适合将 SF Symbols 用作应用内界面图标。
- 依据：[Xcode 与 Apple SDK 许可协议](https://images.apple.com/legal/sla/docs/xcode.pdf)第 2.10 节按 Apple 品牌设备及对应操作系统限定系统图像用途，未在该节要求界面必须由 SwiftUI/AppKit 编写。因此 Electron 本身不构成排除条件，这是基于条款范围的判断，不是 Apple 对 Electron 集成方式的专项确认。
- [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)禁止将 SF Symbols 或易混淆的相似图像用于 App 图标、Logo 或其他商标用途；部分代表 Apple 产品或功能的符号还有单独限制。
- 若未来增加 Windows 或面向非 Apple 平台的网页端，需重新选择相应平台的图标资源，不能自动沿用本项目的 Apple 图标。
- 实现方式仍待验证：设计稿可以使用官方符号；Electron 中的静态资源或原生渲染路径需单独验证，不把 Figma 中的私用字符当作稳定的网页图标接口，也不因 UI Kit 可用就推定可以打包分发 SF 字体。
- 此处仅保留研究结论。用户随后已明确选择 Lucide，不实施全量 SF Symbols 替换。

## 设计修改记录

| 日期 | 修改 | 验证结果 |
|---|---|---|
| 2026-10-20 | 新建首页、首页组件和基础变量 | 页面为可编辑图层，无整页图片替代 |
| 2026-10-20 | 将无法显示的 SF Pro 文字改为 Noto Sans SC | 字体缺失清单为空，截图中的英文标签恢复显示 |
| 2026-10-20 | 新建设置页，完成模型服务详情 | 截图检查通过，无已知文字裁切 |
| 2026-10-20 | 按用户要求，将两个组件组移到 `components` 页面 | 17 个主组件迁移完成，36 处实例引用保持正常；首页和设置页的位置、尺寸未改 |
| 2026-10-20 | 创建本地 `memory/design.md` | 记录本轮设计要求、位置和变更，供后续沿用 |
| 2026-10-20 | 排查 macOS 26 库导入权限；用户刚接受 Apple 资源许可后重试 | 单组件、组件集均导入成功，回读确认均为远程资源；未放置测试实例或替换现有设计 |
| 2026-10-20 | 将首页和设置页的通用控件迁移到 macOS 26 官方组件，新增官方控件展示组和侧栏适配组件 | 两页根节点、尺寸及位置保持；8 类官方控件保留远程关联；修正侧栏宽度和按钮尺寸后，页面及组件展示截图检查通过，无可见缺字 |
| 2026-10-20 | 在输入区模型选择左侧增加上下文占用圆环，将添加文件改为原生加号图标按钮 | 主组件已放入 components；0%、25% 示例及未知状态布局正常；输入区截图检查通过，无缺失字体 |
| 2026-10-20 | 按用户新要求统一 Lucide 图标，将已用官方控件改为本地主组件，移除嵌套远程依赖；字体统一 Noto Sans SC | 两页及组件样本截图检查通过；中文按钮属性、选中态和字段值已恢复；界面页与组件页的远程实例、远程变量、SF 私用字符和缺失字体均为 0 |
| 2026-10-20 | 两页主内容左侧增加 16px 圆角；上下文用量默认仅图标，新增悬停详情面板与点击切换 | 默认态无可见数字；三组用量状态的交互连线回读正常；首页展开/收起、设置页及状态展示截图通过，当前首页恢复为默认态 |
| 2026-10-20 | 侧栏新增 AIGC 创作空间入口，新建项目列表页；新对话改为白底描边按钮 | 首页和项目列表截图检查通过；列表 4 行示例数据、全部本地组件、Noto Sans SC 无缺字；首页到列表及返回新对话的原型连线已回读确认 |
| 2026-10-20 | 按用户纠正，将 Sidebar 建为 Main / Settings 两个变体，并让三张页面引用；撤销误建 Home 变体 | 首页与项目页共享同一 Main 主组件；设置页使用 Settings；页面位置、尺寸及主内容保持，截图与导航连线回读通过，无缺字 |
| 2026-10-20 | 首页新增侧栏点击收起/展开，收起态窗口控制移入主内容顶部，主内容自适应填满窗口 | 修复隐藏后空白占位及展开恢复问题；状态循环和两态截图通过，输入宽度保持 680px，交付默认展开；未创建首页变体 |
| 2026-10-20 | Sidebar 两变体和三页实例统一最小／默认 230px，最大暂按建议设为 320px，并增加组件说明 | 默认三页截图通过；320px 下表单与项目列表无横向溢出；最小宽度不影响收起占位归零；交付恢复 230px |

## 方案文档与未决事项

- [方案书 v0.3](https://docs.google.com/document/d/16uQSOrUhWX0zsU0gVS7f90MOHkzhzX6p4TgCgtjW-IM)
- [系统架构方案 v0.2](https://docs.google.com/document/d/13YbeT6wgkHD94h9ywu0v_knBXq-4i9e01x_SdN9F0r8)

两份文档已转换为原生 Google 文档，原 Markdown 文件仍保留。后续继续修改方案时，优先更新 Google 文档，避免产生未说明的多份版本。

以下事项仍未明确确认，不要通过 UI 设计替用户决定：

- **D1**：Host 崩溃时，接受丢失最后约 1 秒未保存文字，还是要求已显示文字零丢失。
- **D2**：第三批暂不执行任意 Skill 脚本，还是必须支持脚本执行及对应隔离能力。
- **D3**：首版最优先的真实工作场景。

用户曾回复“D1 接受／零丢失；D2 接受／需要脚本”，仍包含互斥选项；当时已询问澄清，尚未收到明确选择。

## 后续维护

- 完成设计变更后，在此文件同步记录变更、节点位置和验证结果。
- 将用户明确要求、当前设计方案、已验证结果和环境限制分开记录。
- 页面名称、节点 ID、组件数量等可能变化，操作前实时检查。
- 未完成的详情页、原型、深色模式和无障碍验证，不写成已完成。
