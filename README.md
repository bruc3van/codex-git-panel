# Codex Git Panel

**在 Codex 工作流中，手动查看差异、暂存文件、提交版本和同步远端。**

中文 · [English](README.en.md)

Git Panel 是一个本地 Codex 插件。让 Codex 打开面板后，你可以直接点击操作 Git；也可以配置全局「打开方式」，从文件或文件夹进入所属仓库，无需每次发送提示词。适合检查 AI 修改、整理一次提交，也适合为笔记、文档和个人项目保留本地版本。

![Git Panel 浅色界面：已暂存文件、工作区差异和提交历史](docs/images/git-panel-light.png)

## 功能

| 场景 | 支持的操作 |
| --- | --- |
| 检查改动 | 区分已暂存与未暂存文件，查看带行号的统一差异，预览新文件 |
| 整理提交 | 按文件暂存、取消暂存，确认后放弃已跟踪文件的未暂存修改 |
| 保存版本 | 输入说明提交，支持 `Ctrl + Enter`，按仓库保留未发送的提交说明 |
| 回看历史 | 查看近期提交及其差异，区分当前提交和上游位置 |
| 切换分支 | 工作区干净时，切换到已有的本地分支 |
| 同步远端 | Fetch、仅快进 Pull、推送到已配置的上游，显示待拉取/待推送数量 |
| 本地版本管理 | 初始化文件夹，在没有 GitHub 账号或远端的情况下查看、暂存和提交 |
| 使用习惯 | 浅色、深色、跟随系统；可调整列表宽度及历史区域高度；Windows 默认应用打开文件 |

<details>
<summary>查看深色界面</summary>

![Git Panel 深色界面](docs/images/git-panel-dark.png)

</details>

## 让 Codex 安装并配置

需要 **Node.js 20+、Git，以及支持插件的 Codex 客户端**。全局「打开方式」还需要桌面客户端支持 `desktop.custom_file_handlers`。Windows 已完成启动器运行验证；macOS/Linux 包含浏览器启动支持，尚未完成运行验证。面板目前以中文为主，部分 Git 操作使用英文标签。

将下面整段提示词复制到 Codex：

```text
请帮我安装并配置 https://github.com/bruc3van/codex-git-panel 。

1. 阅读仓库 README，检查本机 Node.js 20+、Git 和 Codex 插件能力。将仓库克隆到稳定的用户目录；如已安装，复用现有目录并保留本地修改。
2. 插件根目录是 plugins/git-panel。按当前 Codex 支持的本地插件/marketplace 机制完成安装和启用，保留其他插件配置，不要把整个仓库误当成插件根目录。
3. 同时自动配置全局「打开方式 → Git Panel」：备份用户级 config.toml（遵循 CODEX_HOME），添加或更新 desktop.custom_file_handlers.git-panel。使用实际 Node 可执行文件的绝对路径作为 command，稳定源码目录中 scripts/open.mjs 的绝对路径作为 args，web/icon.svg 的绝对路径作为 icon；设置 label = "Git Panel"、input = "path"、supports_ssh = false。不要引用会随版本变化的安装缓存路径，不要重复添加同名 TOML 表，也不要修改我的默认编辑器偏好。
4. 验证配置能解析、所有路径存在、插件已安装，并验证启动器正确绑定指定仓库。安装过程不要暂存、提交、推送或初始化我的工作目录；初始化测试使用临时目录。
5. 配置完成后，明确引导我保存正在进行的工作，完全退出并重新打开 Codex 客户端，再新建一个任务加载插件。不要直接强制关闭客户端，也不要把尚未重启验证的菜单称为已生效。
6. 告诉我重启后如何用「打开方式 → Git Panel」、自然语言提示词，以及输入 / 或 $ 搜索并选择 git-panel Skill 来打开面板。说明打开方式使用系统默认浏览器，Skill 优先使用 Codex 内置浏览器；若客户端不支持打开方式配置，保留 Skill 安装并说明限制。
```

安装插件与配置打开方式是两个步骤，这段提示词会引导 Codex 一起完成。打开方式属于用户级配置，可用于不同本地项目，不需要逐项目添加 Action。完成后请**完全退出并重新打开 Codex，再新建任务**。

## 三种打开方式

### 1. 原生「打开方式」菜单

配置并重启后，在 Codex 中找到本地文件的 **Open in / 打开方式 → Git Panel**。如果客户端提供文件夹或项目目录的 Open in 入口，也可选择目录。

启动器会定位所属 Git 仓库，在**系统默认浏览器**打开面板。支持子目录、中文和空格路径，以及 linked worktree。此入口无需模型调用，也无需将 Git Panel 设为默认编辑器。它位于打开方式菜单，不会在「审查、终端、浏览器、文件」中新增面板类型。

### 2. 对 Codex 说一句话

```text
打开当前仓库的 Git 面板。
```

也可以指定目录：

```text
打开 <本地仓库路径> 的 Git 面板，我要手动检查并提交更改。
```

Skill 会启动服务，并优先通过 Codex 工具在内置浏览器中打开；客户端没有该工具时返回本地链接。打开面板本身不会执行提交或同步。

### 3. 斜杠菜单或 Skill 选择器

在对话输入框输入 `/`，继续搜索 `git-panel` 并选择已安装的 Skill，然后发送打开面板的请求；也可以输入 `$` 搜索并选择它。以客户端实际显示的名称为准，不需要输入 Skill 文件路径。若未出现，检查插件是否启用，并在重启后新建任务。参见 [Codex 斜杠指令说明](https://learn.chatgpt.com/docs/reference/slash-commands)。

这两种选择器均由 Codex 执行 Skill，并非绕过模型的系统快捷键。

## 为文件夹建立本地版本记录

Windows 下，通过打开方式选择尚未纳入 Git 的目录时，会弹窗显示目标路径。选择 **Yes** 后初始化并打开面板，选择 **No** 则取消。若选择的是文件，目标为其所在目录。

初始化不会自动暂存、提交或添加远端。目录位于已有仓库内时，使用所属仓库，不创建嵌套仓库。也可以明确告诉 Codex：

```text
请将 <文件夹路径> 初始化为本地 Git 仓库并打开 Git 面板，暂不创建远端，也不要自动提交。
```

首次提交需要本机配置 Git 用户名与邮箱。没有远端仍可使用本地功能，远端按钮会按仓库状态禁用。

## 提交与同步

1. 点击文件查看差异，使用 `+` / `−` 选择本次提交的文件。
2. 填写说明，点击 **Commit** 或在说明框按 `Ctrl + Enter`。
3. **已有暂存文件时，只提交暂存内容；没有暂存文件时，会暂存全部更改并提交。** 若只想提交部分文件，请先暂存它们。若自动暂存后提交失败，暂存内容会保留。
4. 工作区干净且有待推送提交时，主按钮切换为 **Push**；同步需要已有上游配置。Pull 仅允许快进，分叉、冲突和正在进行的合并/变基需要先在终端处理。

## 命令行与配置参考

在克隆的本仓库目录中执行，将占位路径替换为实际路径：

```sh
# 在默认浏览器打开文件或目录所属仓库
node plugins/git-panel/scripts/open.mjs "<file-or-directory>"

# 明确初始化本地目录（无需弹窗确认），随后打开
node plugins/git-panel/scripts/open.mjs --init "<directory>"

# 只启动服务并输出 URL，供内置浏览器或其他入口使用
node plugins/git-panel/scripts/launch.mjs "<repository>"
```

<details>
<summary>全局打开方式配置示例</summary>

让 Codex 按本机实际路径填入用户级 `config.toml`：

```toml
[desktop.custom_file_handlers.git-panel]
label = "Git Panel"
icon = "<absolute-path-to-plugin>/web/icon.svg"
command = "<absolute-path-to-node>"
args = ["<absolute-path-to-plugin>/scripts/open.mjs"]
input = "path"
supports_ssh = false
```

`absolute-path-to-plugin` 指稳定源码目录中的 `plugins/git-panel`。Windows 路径可用正斜杠，或用 TOML 单引号避免反斜杠转义。已有同名配置时更新该表，重启客户端后加载。参见[官方配置说明](https://learn.chatgpt.com/docs/config-file/config-advanced#add-custom-file-handlers)。

</details>

## 常见问题

- **找不到菜单入口：** 完全退出并重启 Codex，检查客户端版本、Node 路径及 TOML 配置。配置文件有效不代表当前客户端已支持此菜单。
- **点击后没有打开：** 在终端运行 `open.mjs` 查看错误。Git 和 Node 需在本机可用；macOS 使用 `open`，Linux 使用 `xdg-open`。非 Windows 平台初始化请先执行 `git init` 或使用 `--init`。
- **文件无法用默认应用打开：** 面板内的文件打开功能目前仅支持 Windows，且不允许通过该入口执行脚本、程序或快捷方式。
- **认证、签名或 Git hook 出错：** 使用本机 Git 配置；需要交互的凭据或签名流程请先在终端完成。
- **升级与卸载：** 更新稳定源码目录后，让 Codex 重新安装插件并检查打开方式路径；重启后新建任务。移除全局入口时删除该处理器表并重启，插件需另行卸载。

当前不提供分块暂存、并排 diff、创建分支、冲突解决界面或 AI 提交说明生成。历史差异按第一父提交比较。

## 本地运行与开发

服务只监听 `127.0.0.1`，每个实例绑定一个工作区，以随机会话凭据及 Host/Origin 校验保护接口。启动 URL 含会话凭据，请勿分享。关闭浏览器不会终止服务；启动器会复用同一脚本路径和仓库的存活实例。运行记录位于 `%LOCALAPPDATA%/CodexGitPanel`，未设置该变量时使用系统临时目录；可按记录中的 PID 停止对应服务。

```sh
npm start
npm test
```

运行时只依赖 Node.js 与 Git。测试使用临时仓库覆盖 Git 操作、初始化、路径定位和 HTTP 边界，不对用户仓库提交或推送。源代码位于 `plugins/git-panel`，测试位于 `tests`。
