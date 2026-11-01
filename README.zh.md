# WordPress Publisher for Obsidian

[![GitHub release](https://img.shields.io/github/v/release/spark-ai-boy/obsidian-wordpress-publisher?style=flat-square)](https://github.com/spark-ai-boy/obsidian-wordpress-publisher/releases)
[![CI](https://github.com/spark-ai-boy/obsidian-wordpress-publisher/actions/workflows/ci.yml/badge.svg)](https://github.com/spark-ai-boy/obsidian-wordpress-publisher/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.5-7c3aed?style=flat-square)](https://obsidian.md)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759b?style=flat-square)](https://wordpress.org)

**中文** · [English](README.en.md)

![WordPress Publisher](docs/banner.svg)

把 Obsidian 笔记发布到 WordPress，支持创建和更新文章、分类与标签、特色图片、正文图片上传、定时发布、多站点、预览、冲突保护和发布历史。

Publish Obsidian notes to WordPress with post creation/updating, categories and tags, featured images, inline media uploads, scheduling, multiple sites, previews, conflict protection, and publish history.

> 非官方项目，与 Obsidian、WordPress 或 Automattic 无隶属关系。  
> Unofficial project. Not affiliated with Obsidian, WordPress, or Automattic.

---

## 目录 / Contents

- [功能](#功能)
- [环境要求](#环境要求)
- [安装](#安装)
- [配置 WordPress](#配置-wordpress)
- [配置插件](#配置插件)
- [使用](#使用)
- [Frontmatter 参考](#frontmatter-参考)
- [内容转换规则](#内容转换规则)
- [多站点与重新关联](#多站点与重新关联)
- [安全与隐私](#安全与隐私)
- [常见问题](#常见问题)
- [开发](#开发)
- [发布新版本](#发布新版本)
- [贡献](#贡献)
- [许可证](#许可证)

---

## 功能

| 模块 | 能力 |
| --- | --- |
| 发布 | 从当前笔记创建文章；根据 frontmatter 自动更新已关联文章 |
| 状态 | 草稿、发布、待审核、私密、定时发布（future） |
| 内容 | Obsidian Markdown 渲染为 HTML，保留代码块、表格、任务列表、脚注、标注等 |
| 标题 | 可自动使用首个 H1 作为标题，并移除正文中重复的 H1 |
| 分类 | 读取完整分类树，支持搜索、多选、直接在发布窗口中新建分类 |
| 标签 | 逗号分隔输入，自动查找或创建 WordPress 标签 |
| 特色图片 | 从库中选择、输入远程 URL、使用正文第一张图片，或自动使用首张已上传图片 |
| 正文图片 | 上传本地附件到媒体库并替换链接；可选下载并上传远程图片；本地媒体缓存避免重复上传 |
| 文章选项 | Slug、摘要、文章格式、评论、Pingback、置顶、密码保护、移除已有密码 |
| 定时 | 按 WordPress 站点时区选择日期和时间 |
| 预览 | 发布前在 Obsidian 内预览标题、摘要和正文 |
| 多站点 | 无限站点配置；每个站点独立凭据、默认状态、默认格式、默认分类和标签 |
| 冲突保护 | 更新前检测 WordPress 端修改，要求明确确认后才覆盖 |
| 工作流 | 功能区按钮、命令面板、文件右键菜单、快速发布、状态栏、发布历史 |
| 国际化 | 完整中文和英文界面，可跟随 Obsidian 语言 |
| 移动端 | 使用 Obsidian `requestUrl`，桌面端和移动端均可使用 |

### 为什么需要它

- **笔记就是源文件**：在 Obsidian 里写作，发布后继续修改，再次发布会更新同一篇文章。
- **不锁定平台**：通过 WordPress 标准 REST API 和应用程序密码工作，不需要安装 WordPress 插件。
- **可审阅**：发布前预览；远程被修改时不会静默覆盖。
- **可控媒体**：明确选择哪些图片上传到 WordPress，并缓存媒体 ID 避免重复上传。

---

## 环境要求

- **Obsidian** 1.5.0 或更高版本。
- **WordPress** 5.6 或更高版本（应用程序密码随 5.6 进入核心）。
- WordPress 站点启用 REST API，且固定链接不是“朴素”模式。
- 使用 **HTTPS**。WordPress 默认要求 HTTPS 才允许应用程序密码；本机开发环境可通过 `WP_ENVIRONMENT_TYPE=local` 放行。
- 主要面向**自托管 WordPress**。WordPress.com 等托管平台可能要求 OAuth 或限制 REST 写入，不在当前支持范围内。
- 账号角色至少具备发布所需权限：
  - 发布文章：`publish_posts`、`edit_posts`、`upload_files`、`manage_categories`（新建分类/标签时需要）。
  - 仅提交待审核：Contributor 通常即可，但无法上传媒体或管理分类。
  - 如果使用管理员账号，以上权限默认都有。

> 插件通过 WordPress REST API 工作。部分安全插件、主机防火墙或反向代理会拦截 `/wp-json/` 或 `Authorization` 请求头，需要加入白名单。

---

## 安装

### 方式一：手动安装（推荐用于当前版本）

1. 从 [Releases](https://github.com/spark-ai-boy/obsidian-wordpress-publisher/releases) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 在库中创建目录：

   ```text
   <你的库>/.obsidian/plugins/obsidian-wordpress-publisher/
   ```

   Windows 路径示例：

   ```text
   C:\Users\you\Documents\MyVault\.obsidian\plugins\wordpress-publisher\
   ```

3. 将三个文件复制到该目录。
4. 重启 Obsidian，打开 **设置 → 第三方插件**，关闭安全模式并启用 **WordPress Publisher**。

### 方式二：BRAT

1. 安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 在 BRAT 中选择 **Add Beta plugin**。
3. 输入仓库地址：`spark-ai-boy/obsidian-wordpress-publisher`。

> 上架 Obsidian 官方社区插件市场需要单独提交审核；当前仓库已按社区插件结构准备，可直接用 BRAT 或手动安装。

---

## 配置 WordPress

### 1. 创建应用程序密码

1. 登录 WordPress 后台。
2. 进入 **用户 → 个人资料**（Users → Profile）。
3. 滚动到 **应用程序密码**（Application Passwords）。
4. 输入名称，例如 `Obsidian`，点击 **添加新的应用程序密码**。
5. 复制生成的密码（形如 `abcd EFGH 1234 ijkl MNOP 6789`）。它只显示一次。

不要使用主账号登录密码。应用程序密码可以单独撤销，且不会泄露你的正常登录凭据。

### 2. 检查 REST API

在浏览器中访问：

```text
https://你的站点/wp-json/wp/v2/
```

如果返回 JSON（通常包含 `namespace`、`routes` 等字段），说明 REST API 可用。如果返回 404、403、HTML 或登录页，请先解决主机/安全插件/固定链接问题。

### 3. 插件中的站点地址

填写站点根地址，**不要**填写 `/wp-json`：

```text
✅ https://example.com
✅ https://example.com/blog
❌ https://example.com/wp-json/wp/v2
```

WordPress 安装在子目录时，保留子目录，例如 `https://example.com/blog`。

---

## 配置插件

打开 **设置 → WordPress Publisher**。

### 语言

- **自动**：跟随 Obsidian 语言。
- **中文** / **English**：强制使用指定语言。
- 切换语言后，命令面板中的命令名称需要重启 Obsidian 才会刷新；其他界面立即生效。

### 添加站点

点击 **添加站点**，填写：

| 字段 | 说明 |
| --- | --- |
| 显示名称 | 例如“我的博客”，仅用于插件内识别 |
| 站点地址 | WordPress 根地址，可包含子目录 |
| 用户名 | WordPress 登录名，不是邮箱 |
| 应用密码 | 上一步生成的应用程序密码，允许包含空格 |
| 默认状态 | 新文章默认状态 |
| 默认格式 | WordPress 文章格式（standard、aside 等） |
| 默认分类 | 该站点的默认分类，可多选 |
| 默认标签 | 该站点的默认标签，逗号分隔 |

点击 **测试连接** 会验证凭据并加载分类。保存后可以在设置页管理多个站点。

### 发布默认值

设置页中的“发布默认值”作用于当前站点：

- 默认文章状态
- 默认文章格式
- 默认评论状态
- 默认 Pingback 状态

### 内容处理

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| 使用第一个 H1 作为标题 | 开 | 笔记以单个 H1 开头时自动填充标题 |
| 移除重复 H1 | 开 | 开头 H1 与最终标题一致时从正文删除 |
| 将笔记标签作为 WordPress 标签 | 开 | 没有保存过 WordPress 标签时，从 YAML/行内标签预填 |
| 上传本地图片 | 开 | 上传库内图片并替换链接 |
| 同时上传远程图片 | 关 | 下载正文中 http(s) 图片并上传；默认关闭以避免意外复制 |
| 自动特色图片 | 关 | 未指定时使用正文首张已上传图片 |
| 双链处理 | 保留文字 | 可以改为链接到已发布的 WordPress 文章 |

### 工作流

- **发布后打开文章**：成功后用默认浏览器打开。
- **显示状态栏**：在 Obsidian 状态栏显示当前笔记的 WordPress 状态，点击可打开发布窗口。
- **远程修改提醒**：更新前对比 WordPress 的修改时间；有变化时要求确认。

---

## 使用

### 发布新文章

1. 打开一篇 Markdown 笔记。
2. 点击左侧功能区的 **上传云** 图标，或运行命令 **Publish current note to WordPress / 发布当前笔记到 WordPress**。
3. 检查标题、状态、Slug、摘要、分类、标签和特色图片。
4. 切换到 **预览** 检查正文。
5. 点击 **发布**。

发布成功后，插件会写入 frontmatter：

```yaml
wordpress_id: 123
wordpress_url: https://example.com/my-post
wordpress_site: https://example.com
wordpress_status: publish
wordpress_last_sync: 2026-10-31T14:00:00.000Z
wordpress_remote_modified: 2026-10-31T22:00:00
```

下次打开同一篇笔记时，插件会识别已关联文章，按钮变为 **更新文章**。

### 更新文章

再次发布即可。插件使用 `wordpress_id` + `wordpress_site` 定位文章；如果 WordPress 端在 Note 的 `wordpress_last_sync` 之后被修改，会显示冲突提示，必须勾选确认才会覆盖。

如果笔记没有显式的 slug 或摘要，更新时会保留 WordPress 上已有的 slug 和摘要，避免意外改变固定链接或覆盖自定义摘要。发布窗口中仍可手动修改或清空摘要。

### 快速发布

命令面板运行 **快速发布当前笔记（使用默认设置）**：

- 不打开发布窗口。
- 使用笔记 frontmatter、站点默认值和当前设置。
- 如果是已关联文章，会尽量保留远端的格式、分类、标签、特色图片、评论/Pingback/置顶状态。
- 新建文章时不支持定时状态；需要定时请使用发布窗口。

### 预览

- 发布窗口中的 **预览** 标签页。
- 或命令 **预览当前笔记的 WordPress 效果**，直接打开预览标签页。

预览是近似效果，最终样式由 WordPress 主题决定。预览中的本地图片来自 Obsidian，只有正式发布时才会上传。

### 发布历史

命令 **查看 WordPress 发布历史**：

- 查看创建/更新时间、站点、文章 ID、状态和笔记路径。
- 打开文章或原笔记。
- 删除单条记录或清空历史。

历史只保存在本地插件数据中，不影响 WordPress 文章或笔记 frontmatter。

### 文件右键菜单

在文件列表中右键 Markdown 文件，选择 **发布到 WordPress**。

### 状态栏

启用后，状态栏显示：

- `WordPress: 未发布`
- `WordPress: 草稿`
- `WordPress: 已发布`
- `WordPress: 待审核`
- `WordPress: 私密`
- `WordPress: 已定时`

点击状态栏项可直接打开发布窗口。

---

## Frontmatter 参考

插件写入的键均可手动编辑。**除非明确知道后果，不要手动修改同步时间戳**。

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `wordpress_id` | number | WordPress 文章 ID；存在时更新而非新建 |
| `wordpress_site` | string | 文章所属站点根地址，用于匹配站点配置 |
| `wordpress_url` | string | 已发布文章 URL |
| `wordpress_status` | string | `draft` / `publish` / `pending` / `private` / `future` |
| `wordpress_last_sync` | ISO 时间 | 上次成功同步时间 |
| `wordpress_remote_modified` | WordPress 时间 | 上次同步时远端的 `modified` 值，用于冲突检测 |
| `wordpress_categories` | number[] | 分类 ID |
| `wordpress_tags` | string[] | 标签名称 |
| `wordpress_featured_media` | number | 特色图片媒体 ID |
| `wordpress_featured_image` | string | 特色图片来源（库路径或 URL），用于后续重传/复用 |
| `wordpress_slug` | string | WordPress 实际 slug |
| `wordpress_format` | string | WordPress 文章格式 |

### 可选的输入键

| 键 | 说明 |
| --- | --- |
| `title` / `wordpress_title` | 没有 H1 时的标题来源 |
| `excerpt` / `wordpress_excerpt` / `description` | 摘要 |
| `slug` / `wordpress_slug` | 优先使用 `wordpress_slug` |
| `cover` / `image` / `featured_image` / `featured` | 特色图片路径 |
| `tags` / `tag` | 预填 WordPress 标签 |

### 作为新文章发布

在同一站点上复制笔记后，删除以下键即可作为新文章：

```yaml
wordpress_id:
wordpress_url:
wordpress_last_sync:
wordpress_remote_modified:
```

保留 `wordpress_site` 可以让新笔记默认使用该站点。

### 解除关联

删除 `wordpress_id` 和 `wordpress_site` 后，笔记与 WordPress 文章解除关联；不会删除远端文章。

---

## 内容转换规则

发布时使用 Obsidian 自己的 Markdown 渲染器生成 HTML，因此尽量保持笔记在 Obsidian 中的语义。

### 会处理

- 代码块、行内代码
- 表格、任务列表、脚注
- 引用、标注（callout）的 HTML 结构
- 图片：`![[image.png]]`、`![](path)`、远程图片
- Wiki 链接：`[[Note]]`、`[[Note|别名]]`、`[[Note#标题]]`
- Markdown 内部链接：`[文字](Note.md)`
- Obsidian 注释 `%%...%%`（发布前移除）
- Frontmatter（不进入正文）

### Wiki 链接与内部链接

设置中的“双链处理”：

- **保留显示文字**：`[[Note|别名]]` → `别名`。
- **链接到已发布文章**：如果目标笔记 frontmatter 有 `wordpress_url`，生成指向该文章的链接；否则退化为显示文字。

非图片的笔记嵌入 `![[Note]]` 在 WordPress 中无法嵌入，会退化为显示文字，避免产生 `app://` 死链。

### 图片

- 本地图片必须启用“上传本地图片”。如果正文含本地图片但该设置关闭，发布会中止，避免把 `app://` 链接发到网站。
- 图片上传到 WordPress 媒体库，正文链接替换为媒体 URL。
- 媒体按“站点 + 文件路径 + 修改时间 + 大小”缓存，重复发布不会重复上传未修改的图片。
- 找不到的本地图片会被替换为替代文字，并在发布后显示警告。
- 远程图片默认保留热链；启用“同时上传远程图片”后才会下载并上传。
- 特色图片支持库内路径、远程 URL、正文第一张图，或自动使用首张已上传图片。
- 原始 HTML 中的本地 `<img src="...">` 不会自动上传；请使用 Markdown 或 Wiki 图片语法。

### 不保证支持

以下内容依赖 Obsidian 插件运行时，发布为普通 HTML 后可能不可用：

- Dataview / DataviewJS 查询
- Excalidraw、Canvas
- 依赖 Obsidian 插件的自定义代码块
- Mermaid 图（可能只保留代码块；可在 WordPress 安装 Mermaid 插件）
- 笔记嵌入、Hover 预览、Obsidian 特有的交互

发布前请使用预览检查。

---

## 多站点与重新关联

- 可以配置任意数量的 WordPress 站点。
- 发布窗口中的 **站点** 下拉框决定目标；默认优先使用笔记 `wordpress_site` 对应的站点，否则使用当前站点。
- 如果笔记关联到 A 站点，却选择 B 站点发布，会创建一篇新文章，并把 frontmatter 更新为 B 站点。发布窗口会显示提醒。
- 同一个站点上要创建副本：删除 `wordpress_id` 后发布。
- 更换域名后，修改站点配置里的 URL，并同步修改笔记中的 `wordpress_site`；否则会被视为不同站点。

---

## 安全与隐私

- 只连接你在设置中配置的 WordPress 站点。
- 使用 WordPress 应用程序密码，并通过 HTTP Basic 认证发送。
- **必须使用 HTTPS**；HTTP 会以明文传输凭据。
- 凭据以未加密形式保存在库的 `.obsidian/plugins/obsidian-wordpress-publisher/data.json`。
  - 不要把 `data.json` 提交到 Git。
  - 不要把包含该文件的库同步到不受信任的设备。
  - 怀疑泄露时，立即在 WordPress 后台撤销对应应用程序密码。
- 插件不发送遥测、统计或分析数据。
- 下载远程图片时不会附带 WordPress 凭据。
- 发布 HTML 前会移除 `<script>`、`<style>`、`<iframe>`、内联事件属性和 `javascript:` 链接。
- WordPress 自身仍会对内容做权限相关的过滤；最终安全边界由 WordPress 站点决定。

更多信息见 [SECURITY.md](SECURITY.md)。

---

## 常见问题

### 401 身份验证失败

- 确认用户名是 WordPress 登录名，不是邮箱。
- 确认使用的是**应用程序密码**，不是主密码。
- 应用密码可以包含空格；插件会自动去掉空格。
- 确认站点使用 HTTPS；WordPress 默认禁止在非 HTTPS 环境使用应用密码。
- 检查安全插件/主机是否剥离了 `Authorization` 头。
- 在 WordPress 中撤销旧密码并重新生成。

### 404 找不到 REST API

- 访问 `https://你的站点/wp-json/wp/v2/` 验证。
- 在 **设置 → 固定链接** 中重新保存一次（不要选“朴素”）。
- 站点地址是否包含子目录？
- 是否被安全插件、CDN 或主机 WAF 拦截？
- 多站点网络可能需要 `/wp-json/` 或子站点路径。

### 403 没有权限

- 当前角色是否具备 `publish_posts`、`upload_files`、`manage_categories`？
- 是否使用了只读/自定义角色？
- 安全插件是否限制了 REST 写操作？

### 图片上传失败

- 账号需要 `upload_files` 权限。
- 检查 WordPress **媒体** 设置和主机上传大小限制（413）。
- SVG 是否被站点禁止？WordPress 默认不支持 SVG，需要插件或主题放行。
- 文件名会转换为 ASCII 安全名称；仍会通过 `filename*` 保留原始名称。
- 如果图片在笔记中找不到，会被替换为替代文字，检查路径和附件是否存在。

### 发布后正文图片打不开

- 是否关闭了“上传本地图片”？关闭时插件会阻止包含本地图片的发布。
- 原始 HTML `<img>` 不会自动上传，请改用 Markdown/Wiki 图片。
- 远程图片是否允许热链？某些站点有防盗链。

### 一直提示远程被修改

- 如果你在 WordPress 后台修改过文章，这是预期保护。
- 勾选“我确认要覆盖远程修改”后再发布。
- 如果确认远端没有修改，可删除笔记中的 `wordpress_remote_modified`，让插件回退到时间戳比较，或直接删除 `wordpress_last_sync` 重置。
- 站点时区与电脑时区不同时，优先依赖 `wordpress_remote_modified` 精确比较。

### 定时发布时间不对

- 发布窗口中的日期时间按 **WordPress 站点时区** 解释。
- 在 WordPress **设置 → 常规** 中确认站点时区。
- 电脑时区与站点时区不同不会自动换算。

### 快速发布把定时文章变成草稿

- 新建笔记的快速发布不询问定时时间，会回退到站点默认状态。
- 已关联的定时文章会尽量保留远端定时时间。
- 需要精确控制时请使用发布窗口。

### 修改语言后命令名称没变

- 重启 Obsidian。命令名称在插件加载时注册，其他界面立即更新。

### 如何完全卸载

1. 在 Obsidian 中禁用并删除插件。
2. 可选：删除库中 `.obsidian/plugins/obsidian-wordpress-publisher/`。
3. 在 WordPress 后台撤销应用程序密码。
4. 已发布文章不受影响；笔记 frontmatter 也保留，方便以后重新关联。

---

## 开发

### 环境

- Node.js 20+
- npm 9+
- Obsidian 1.5+

### 本地开发

```bash
git clone https://github.com/spark-ai-boy/obsidian-wordpress-publisher.git
cd obsidian-wordpress-publisher
npm ci
npm run dev
```

`npm run dev` 会监听源码并生成 `main.js`，但不会自动复制到库。可以把仓库目录链接到测试库：

```bash
ln -s "$PWD" "/path/to/your/vault/.obsidian/plugins/obsidian-wordpress-publisher"
```

Windows（管理员命令提示符）：

```bat
mklink /J "C:\path\to\vault\.obsidian\plugins\wordpress-publisher" "C:\path\to\repo"
```

然后在 Obsidian 中重新加载插件。

### 常用命令

```bash
npm run dev        # 监听并生成 main.js（含 sourcemap）
npm run typecheck  # TypeScript 严格模式检查
npm run test       # Vitest 单元测试
npm run build      # 类型检查 + 生产构建
npm run check      # 类型检查 + 测试 + 构建
```

### 项目结构

```text
src/
  main.ts                 Obsidian 插件入口、命令、状态栏、事件
  types.ts                公共类型
  constants.ts            默认值、frontmatter 键、状态/格式
  i18n/                   中文、英文字典及语言检测
  ui/                     发布窗口、站点管理、设置页、历史、图片选择
  utils/                  URL、日期、Markdown、frontmatter、路径、错误
  wordpress/
    client.ts             WordPress REST 客户端
    publisher.ts          发布编排、冲突检测、frontmatter 写回
    media.ts              图片解析、上传和媒体缓存
    notes.ts              笔记读取与默认选项
    renderer.ts           Obsidian Markdown → HTML
    links.ts              Wiki/Markdown 内部链接转换
tests/                    Vitest 单元测试与 Obsidian 运行时桩
```

### 设计约束

- 所有网络请求通过 Obsidian `requestUrl`，兼容移动端并避免 CORS。
- 不引入运行时依赖（除 Obsidian 本身），保持插件体积小。
- 类型检查使用 `strict`；新增用户可见文案必须同时提供中文和英文。
- 涉及凭据的代码不得写日志、异常信息或 URL。
- 修改发布行为时请补充单元测试。

### 添加语言

1. 复制 `src/i18n/en.ts` 为新语言字典，并满足 `TranslationKey` 类型。
2. 在 `src/types.ts` 的 `LanguageSetting` / `ResolvedLanguage` 增加语言代码。
3. 更新 `src/i18n/index.ts` 的字典映射和语言检测。
4. 在设置页添加选项。

---

## 发布新版本

```bash
npm version patch   # 或 minor / major
git push --follow-tags
```

`npm version` 会运行 `scripts/version-bump.mjs`，同步 `package.json`、`manifest.json` 和 `versions.json`。推送 tag 后，GitHub Actions 会：

1. 校验 tag、`manifest.json`、`package.json`、`versions.json` 一致。
2. 安装依赖并构建。
3. 创建 GitHub Release，附带 `main.js`、`manifest.json`、`styles.css`。

---

## 贡献

欢迎提交 Issue 和 Pull Request。请先阅读：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)

提交问题时请勿粘贴应用程序密码、`data.json` 内容或包含凭据的请求头。

---

## 许可证

[MIT](LICENSE) © 2026 spark-ai-boy

WordPress 是 WordPress Foundation 的商标；Obsidian 是 Dynalist Inc. 的商标。本项目与二者无隶属关系。
