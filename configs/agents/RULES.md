# Hard rules

- NEVER `git commit` or `git push` on main/master branch.
- NEVER run git commands that can delete code (checkout, reset, clean) without explicit allowance.
- NEVER use git worktrees. Stash untracked/staged changes instead.
- NEVER use echo/cat/sed to modify existing files; use internal tools.
- NEVER run commands on filesystem root; stay in the project folder.
- NEVER suppress linters with comment directives (`//nolint:`); fix the root cause.
- NEVER guess code works; verify (lsp, compile, run tests).
- No emoji in code or commit messages.
- NEVER narrate behavior the code already shows in comments, or reference the session/plan/process (`// Phase A`, `// per review`, `// as we discussed`).
