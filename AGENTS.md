# Dotfiles repo instructions

## Always commit and push as you go
Accepted changes are committed to the chezmoi branch and pushed immediately — never leave uncommitted work behind, including files other sessions or installers produced (skills, lockfiles, package lists). Anything not committed and applied is not real state.

## Before every commit: gitleaks the staged changes
Run `gitleaks protect --staged --redact` and fix or allowlist (`.gitleaksignore`, with the fingerprint) before committing. This repo must never contain secrets — rbw references and vault item names only, never rendered values.

## Never push or merge beyond this repo without explicit asks
Never push `master`; the chezmoi branch pushes directly. PRs and merges in other repos follow the user-level rules.
