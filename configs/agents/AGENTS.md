# User-level agent instructions

## Defaults

- No emoji in code or commit messages.
- Concise commit messages; imperative mood.
- Comments default to NONE. Write one ONLY to explain a non-obvious *why* the code itself can't show (a constraint, a gotcha, a reason a reader would otherwise get wrong) — and then one line, max. Concretely:
  - NEVER restate a symbol's name, signature, or return. `// ListSessions returns the owner's sessions` on `func ListSessions(...)` is banned. Go's "doc every exported symbol" convention does NOT apply here — skip it.
  - NEVER restate a global/project convention locally. `// authz is enforced at the border` is true everywhere; repeating it on one function is noise.
  - NEVER narrate behavior the code already shows (`// newest first, subjects omitted`), and NEVER reference our session/plan/process (`// Phase A ...`, `// per review`, `// as we discussed`, `// I'm testing ...`).
  - Litmus before writing any comment: if a competent reader gets the same fact from the code in a few seconds, delete it. Unsure → delete.

- When stuck, instead of smartly and bindly trying to fix the issue, take a step back, breathe, and approach the problem from a different and more holistic and macro perspective. At this point, it's crucial to go back to the user and get a clear understanding of the problem/ask questions.

- NEVER `git commit` or `git push` on main/master branch.
- NEVER run git commands that can potentially delete code without a good reason/allowance. git checkout, git reset, etc
- NEVER use echo/cat/sed to modify existing files. Always prefer your internal tools.
- NEVER run commands or tools on filesystem root. Always constrain yourself to project folder or, at most, to some other projects being referenced. But NEVER filesystem root.
- NEVER comment out code to "fix" linter (like `//nolint:`). Fix the lint root cause instead.
- NEVER guess the code will work. Always check lsp, compile, run tests, etc.
- NEVER use git worktrees. If there are untracked or staged changes, stash them before proceeding.

- AVOID using go workspace. It sucks. When you need to point to a local dependency, use replace directive in go.mod.
- AVOID over-engineering. Simple code is almost always better. Less code is almost always better.
- AVOID defensive programming. Validate inputs at the boundary (config parsing, settings loading, request decoding) and fail loudly there. Downstream code should assume inputs are valid — never re-check for states the boundary already guaranteed. A nil-check or empty-string-check deep in the call stack for a value that was already validated upstream is useless noise: if it fires, the boundary is broken (fix the boundary, don't patch downstream); if it never fires, it's dead code. Silent degradation (returning without the header, defaulting to empty, skipping the step) is the worst outcome — it hides the bug instead of surfacing it. Fail fast, fail loud.
- AVOID doing any change when the user only wants an answer. Example: when user asks "question: why this code was done this way?", "why is this variable here instead of there?" you should just answer them, but not "fix" the imaginaty problem. Sometimes user wants to understand the code, not to fix it. The user could also write [QUESTION], then you answer.

RESPECT all those rules or go to jail.

## Subagent delegation (context hygiene)

When a `.scratch/<feature>/` PRD and issues exist (Matt Pocock loop), implement
issues via the `tdd-worker` subagent (fresh context, absolute PRD + issue paths
in the brief) instead of inline — `/implement-issue` does the full
worker → reviewer round. Only subagent reports belong in the main session;
keep grilling/PRD/issue-writing here. Parallelize read-only subagents
(scout/reviewer/researcher) freely; run implementation workers sequentially —
no worktrees.

## Shell output: rtk

This system has `rtk` installed — a CLI proxy that filters and summarizes
command output before it reaches context, saving tokens. Prefer running
supported commands through it: `rtk git …`, `rtk grep …`, `rtk test`,
`rtk diff`, `rtk log …`, `rtk docker …`, `rtk kubectl …`, etc.

Note: some agents auto-rewrite these commands transparently (e.g. opencode
via its plugin), so manual prefixing isn't needed there. When no such
integration exists, invoke `rtk` explicitly.

Run `rtk gain` for token savings analytics.
