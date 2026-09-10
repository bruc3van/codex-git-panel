# Codex Git Panel

**Review diffs, stage files, commit changes, and sync remotes in your Codex workflow.**

[中文](README.md) · English

Git Panel is a local Codex plugin with an interactive Git interface. Use a prompt or Skill to open it in Codex’s built-in browser, then operate Git yourself. Use it to review AI changes, prepare a commit, or keep local versions of notes, documents, and personal projects.

![Git Panel in light mode: staged files, working tree diff, and commit history](docs/images/git-panel-light.png)

## Features

| Task | What you can do |
| --- | --- |
| Review changes | Browse staged and unstaged files, unified diffs with line numbers, and new-file previews |
| Prepare commits | Stage or unstage individual files; discard unstaged changes to tracked files after confirmation |
| Save a version | Commit with a message or `Ctrl + Enter`; keep a message draft per repository |
| Browse history | Inspect recent commits and their diffs, with current and upstream commit markers |
| Switch branches | Switch to an existing local branch when the working tree is clean |
| Sync remotes | Fetch, fast-forward-only Pull, upstream Push, and ahead/behind counts |
| Work locally | Ask Codex to initialize a folder, then review, stage, and commit in the panel without a GitHub account or remote |
| Customize the view | Light, dark, or system theme; resizable file and history panes; open files in default Windows apps |

<details>
<summary>View dark mode</summary>

![Git Panel in dark mode](docs/images/git-panel-dark.png)

</details>

## Install with Codex

Requirements: **Node.js 20+, Git, and a Codex client with plugin support**. Runtime behavior has been verified on Windows; Linux server tests have also passed in WSL Ubuntu; macOS has not been runtime-verified. The panel currently uses mostly Chinese UI text with some English Git action labels.

Copy this entire prompt into Codex:

```text
Please install and enable the plugin at https://github.com/bruc3van/codex-git-panel for me.

1. Read the repository README and check Node.js 20+, Git, and Codex plugin support. Clone the repository into a stable user directory, or reuse an existing installation while preserving local changes.
2. The plugin root is plugins/git-panel. Install and enable it using the local plugin/marketplace mechanism supported by this Codex version. Preserve other plugin settings; do not treat the repository root as the plugin root.
3. Verify plugin installation, the launcher path, and that the service binds to the intended repository. Do not stage, commit, push, or initialize my working directories during installation.
4. After installation, guide me to start a new task to load the plugin. If the client still does not recognize it, guide me to save ongoing work, fully quit and reopen Codex, and start a new task. Do not force-close the client.
5. Explain how to use a natural-language prompt or the / or $ picker to select the git-panel Skill and open the panel in Codex's built-in browser on the right. If the browser tool is unavailable, provide a local link and explain the limitation.
```

After installation, **start a new task** to load the Skill. If it is missing, save ongoing work, fully quit and reopen Codex, and start a new task.

## Open the panel

### 1. Ask Codex

```text
Open the Git panel for the current repository.
```

Or specify a repository:

```text
Open the Git panel for <local-repository-path> so I can review and commit changes manually.
```

The Skill starts the service and prefers Codex's built-in browser through the available app tool. If that tool is unavailable, it returns a local link. Opening the panel does not commit or sync changes.

### 2. The slash menu or Skill picker

Type `/` in the composer, search for `git-panel`, select the installed Skill, and send your request. You can also type `$` to find and select it. Use the name shown by your client; no Skill file path is needed. If it is missing, check that the plugin is enabled and start a new task after restarting. See [Codex slash commands](https://learn.chatgpt.com/docs/reference/slash-commands).

Both pickers invoke the Skill through Codex; they are not model-free system shortcuts.

## Start tracking a local folder

Codex performs initialization at your request, then opens the panel in its built-in browser:

```text
Initialize <folder-path> as a local Git repository and open the Git panel. Do not create a remote or commit anything yet.
```

Initialization does not stage files, create commits, or add a remote. A directory inside an existing repository uses that repository. Git author name and email must be configured before your first commit. Local operations remain available without a remote; remote buttons are disabled when their requirements are not met.

## Commit and sync

1. Select a file to inspect its diff. Use `+` / `−` to stage or unstage files.
2. Enter a message and click **Commit**, or press `Ctrl + Enter` in the message field.
3. **If files are staged, only staged changes are committed. If nothing is staged, all changes are staged and committed.** Stage files first when you want a partial selection. If a commit fails after automatic staging, those changes remain staged.
4. When the working tree is clean and commits are ahead of upstream, the primary button becomes **Push**. Sync requires an existing upstream. Pull only fast-forwards; handle divergence, conflicts, and ongoing merges/rebases in a terminal first.

## Command-line launcher

Run this from the cloned repository, replacing the placeholder with a repository path:

```sh
node plugins/git-panel/scripts/launch.mjs "<repository>"
```

This starts or reuses the service and prints a local URL without opening a browser. When invoked through the Skill, Codex uses that URL to open its built-in browser on the right.

## Troubleshooting

- **Skill missing:** Check that the plugin is enabled and start a new task. If it is still missing, fully quit and reopen Codex.
- **Panel does not open:** Run `launch.mjs` in a terminal to see the error and check that Node.js and Git are available. If the built-in browser tool is unavailable, open the returned local URL manually.
- **A file will not open in its default app:** The panel's file-opening action currently supports Windows only and blocks scripts, executables, and shortcuts.
- **Authentication, signing, or Git hook errors:** The panel uses your local Git configuration. Complete interactive credential or signing setup in a terminal first.
- **Update or uninstall:** Update the source checkout, ask Codex to reinstall the plugin, and start a new task. Restart if the client does not recognize it. Use Codex plugin management to uninstall.

Partial-hunk staging, side-by-side diffs, branch creation, conflict resolution UI, and AI commit-message generation are not currently included. Commit diffs compare against the first parent.

## Multiple projects and service lifecycle

Different repositories or worktrees use separate addresses. Panels for the same worktree share its files and index, so changes affect each other. A new service prevents overlapping Git operations within that service; external editors and terminals are not locked.

Upgrading the plugin reuses a running service. Close its pages and let it expire, then reopen to load the new version. Services started before this lifecycle feature cannot expire or reuse instances across versions; stop those manually after confirming no operation is running. Avoid operating the same repository through both old and new services. On macOS/Linux, the launcher recovers a current-user socket only after confirming it has no listener. If recovery itself is killed, the error identifies a `.recovery` lock; remove it only after all related launch processes have exited. Stop older Unix services before upgrading because the runtime directory has changed.

## Local service and development

The service listens only on `127.0.0.1`, binds each instance to one worktree, and protects its API with a random session credential and Host/Origin checks. Do not share launch URLs containing session credentials. The new launcher reuses one service per worktree across plugin installation paths, with a process-level singleton guard for concurrent starts. Visible panels refresh state and the current diff every 5 seconds; background pages send lightweight keepalive requests. After about 10 minutes without page requests, the service exits when no Git operation or request is running. Reopen through the Skill if the browser has frozen a tab for an extended period. Runtime records are stored in `%LOCALAPPDATA%/CodexGitPanel`, or the user home directory when that variable is unset. Unix uses `$XDG_RUNTIME_DIR/CodexGitPanel`, falling back to `~/.local/share/CodexGitPanel`, with directory mode 0700 and new record mode 0600. Use the PID in the matching record to stop a service.

```sh
npm start
npm test
```

Runtime dependencies are Node.js and Git. Tests use temporary repositories for Git operations, HTTP boundaries, concurrent startup, reuse across plugin paths, and idle shutdown; they do not commit or push your working repositories. Plugin source lives in `plugins/git-panel`, with tests in `tests`.

At widths up to 600px, the preview fills the content area; close it to return to the list. Each file group renders up to 500 entries with a notice; automatic stage-all commits still include the full list. Diffs over 2000 lines or 250KB use plain text. Git output over 4MB produces an actionable error. `Ctrl + Enter` in the message field invokes the current primary action, including Push.

Unix sockets use a private `/tmp/codex-gp-<uid>` directory to stay below platform socket path limits.

## License

This project is licensed under the [MIT License](LICENSE).
