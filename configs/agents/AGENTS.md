# User-level agent instructions

## Defaults

- No emoji in code or commit messages.
- Concise commit messages; imperative mood.

- When stuck, instead of smartly and bindly trying to fix the issue, take a step back, breathe, and approach the problem from a different and more holistic and macro perspective. At this point, it's crucial to go back to the user and get a clear understanding of the problem/ask questions.

- NEVER `git push` without being asked.
- NEVER `git commit` or `git push` on main/master branch.
- NEVER run git commands that can potentially delete code. git checkout, git reset, etc
- NEVER use echo/cat/sed to modify existing files. Always prefer your internal tools.
- NEVER run commands or tools on filesystem root. Always constrain yourself to project folder or, at most, to some other projects being referenced. But NEVER filesystem root.
- NEVER comment out code to "fix" linter (like `//nolint:`). Fix the lint root cause instead.
- NEVER guess the code will work. Always check lsp, compile, run tests, etc.
- NEVER use git worktrees. If there are untracked or staged changes, stash them before proceeding.

- AVOID unnecessary comments. Comments should be used to explain why something is done, only if it's not obvious.
- AVOID using go workspace. It sucks. When you need to point to a local dependency, use replace directive in go.mod.
- AVOID over-engineering. Simple code is almost always better. Less code is almost always better.
- AVOID doing any change when the user only wants an answer. Example: when user asks "question: why this code was done this way?", "why is this variable here instead of there?" you should just answer them, but not "fix" the imaginaty problem. Sometimes user wants to understand the code, not to fix it.

RESPECT all those rules or go to jail.

## Shell output: rtk

This system has `rtk` installed — a CLI proxy that filters and summarizes
command output before it reaches context, saving tokens. Prefer running
supported commands through it: `rtk git …`, `rtk grep …`, `rtk test`,
`rtk diff`, `rtk log …`, `rtk docker …`, `rtk kubectl …`, etc.

Note: some agents auto-rewrite these commands transparently (e.g. opencode
via its plugin), so manual prefixing isn't needed there. When no such
integration exists, invoke `rtk` explicitly.

Run `rtk gain` for token savings analytics.
