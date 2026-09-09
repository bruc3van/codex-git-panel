---
name: git-panel
description: Open a local interactive Git panel when the user asks to open Git 面板, manually stage changes, or use a VS Code style source control UI in Codex.
---

# Git 面板

Resolve the requested checkout root using Git. If no directory is specified, use the current task repository. Do not initialize a repository without user intent. This skill opens a local webpage with direct Git controls.

Run `node "<plugin-root>/scripts/launch.mjs" "<checkout-root>"`, where plugin-root is two directories above this skill folder. Resolve it from this installed SKILL.md path, not a hard-coded source directory. Requires Node.js 20+ and Git on PATH.

The command returns a localhost URL with a session credential in its fragment. Use the Codex `open_in_codex` tool with browser target, that exact URL, and placement right. Discover the tool if necessary. If unavailable, give the user the local URL to open in their browser. Do not claim the panel opened if the tool reports queued; state the actual result.

Do not execute stage, commit, pull, push or discard merely to open the panel. These are performed by the user through the UI. No GitHub login or remote creation is required. The service binds only to loopback and one checkout. Preserve the fragment when opening, but do not send it to external websites.

MVP offers file-level staging/unstaging, tracked-file discard with confirmation, unified diff, staged-only commit, fetch, fast-forward-only pull, upstream push, and recent read-only history. No AI commit generation, partial staging, native sidebar injection, or conflict resolution UI. New installations are picked up in a new Codex task.
