---
name: git-panel
description: Open Git Panel (Git 面板) when the user requests a visual interface to review, stage, commit, or sync a local repository in Codex. Not for ordinary Git commands or plugin installation/configuration.
---

# Git 面板

1. Use the requested local directory, or the current task working directory; for a file, use its parent. Resolve the worktree with `git -C "<directory>" rev-parse --show-toplevel`. If it is not a repository, initialize only when the user requested it; otherwise ask whether to initialize that directory. Other Git errors are not a reason to initialize. A remote is optional.

2. Resolve `<plugin-root>` two directories above this installed skill folder. Start or reuse the service:

   ```sh
   node "<plugin-root>/scripts/launch.mjs" "<worktree-root>"
   ```

   Requires Node.js 20+ and Git. Use the installed script directly; do not inspect source or install dependencies unless startup fails.

3. Open the returned URL with `open_in_codex`: browser target, exact URL, `placement: "right"`. Discover the tool if needed. Preserve the URL's session fragment; never send it to an external service. If the tool is unavailable or fails, provide the local link. If queued, report queued rather than opened.

Opening the panel alone does not authorize staging, committing, discarding, switching branches, or remote operations. Leave those actions to the user in the panel unless separately requested.
