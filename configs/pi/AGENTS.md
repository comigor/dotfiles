# User-level agent instructions

## Pi packages

- After installing, removing or updating a Pi package (`pi-bolt install`, `pi-bolt uninstall`, `pi-bolt update --extensions`), run `pi-bolt compile`. A change leaves the previous extension set baked into the binary, so a removed package keeps being referenced — `pi-bolt doctor` reports it as "no longer installed" — until the next compile. It takes ~15-40 s, and the build before is kept: `pi-bolt update --rollback` restores it.

## Subagent models (`pi-fabric`)

- Omitting `model` on `agents.spawn` / `agents.run` uses `openrouter/z-ai/glm-5.3-flash` (`fabric.json` `agents.model`), never Main's frontier model.
- Pick the lowest `models.aliases` tier that fits the task: `scout` (read-only exploration, research fan-out, log/doc digestion), `worker` (focused PRs, refactors, tests), `reviewer` (code/spec review or harder multi-file edits), `oracle` (hard architecture/security deadlocks only).
