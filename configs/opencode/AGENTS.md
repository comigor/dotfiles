# User-level agent instructions

## Task memory: Beads

This system has `bd` (Beads) installed for work tracking. Use it.

- **At session start** (if this is an existing project with `.beads/`):
  run `bd ready --json` to find the highest-priority unblocked work.
- **During work**: if you discover follow-up work that will take more
  than ~2 minutes, file a bead with `bd create`. Link dependencies with
  `bd link`.
- **At session end** ("land the plane"):
  1. Close completed beads with `bd close <id> --reason "<summary>"`.
  2. Run `bd sync` to export state to JSONL.
  3. Commit `.beads/` changes with the code.
- If the project has no `.beads/` directory, don't force it. Only initialize
  (`bd init`) when the user explicitly asks or when I mention wanting
  persistent task memory.

## Shell output: rtk

This system has `rtk` installed as an opencode plugin. It auto-rewrites
common shell commands (`git`, `cargo`, `pytest`, `docker`, etc.) to filter
output before it reaches context. You don't need to do anything — it's
transparent. Don't prefix commands with `rtk` manually; the plugin handles it.

If you want token savings analytics, run `rtk gain`.

## Orchestration: oh-my-opencode-slim

Specialized subagents are available. Delegate accordingly:
- Exploration / codebase search → Explorer
- External research / docs → Librarian
- Single-file implementation → Fixer
- UI / frontend → Designer
- Hard reasoning / architecture / debugging → Oracle
- Full strategic planning → let the Orchestrator coordinate

Categories (`quick`, `ultrabrain`, `visual-engineering`, `deep`) are also
available — use them when the task type is clear.

## Defaults

- No emoji in code or commit messages.
- Concise commit messages; imperative mood.
- Don't run `git push` without being asked.
- If a project has its own `AGENTS.md`, it takes precedence over this file.
- NEVER run git commands that can potentially delete code. git checkout, git reset, etc
- NEVER use echo/cat/sed to modify existing files. Always prefer your internal tools.
- NEVER run commands or tools on filesystem root. Always constrain yourself to project folder or, at most, to some other projects being referenced. But NEVER filesystem root.
- AVOID unnecessary comments. Comments should be used to explain why something is done, only if it's not obvious.
- NEVER guess the code will work. Always check lsp, compile, run tests, etc.
- NEVER use git worktrees. If there are untracked or staged changes, stash them before proceeding.
- AVOID using go workspace. It sucks. When you need to point to a local dependency, use replace directive in go.mod.
- AVOID over-engineering. Simple code is almost always better. Less code is almost always better.
- AVOID doing any change when the user only wants an answer. Example: when user asks "question: why this code was done this way?", "why is this variable here instead of there?" you should just answer them, but not "fix" the imaginaty problem. Sometimes user wants to understand the code, not to fix it.

RESPECT all those rules or go to jail.
