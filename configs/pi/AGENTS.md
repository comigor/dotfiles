# User-level agent instructions

## Pi packages

- After installing, removing or updating a Pi package (`pi-bolt install`, `pi-bolt uninstall`, `pi-bolt update --extensions`), run `pi-bolt compile`. A change leaves the previous extension set baked into the binary, so a removed package keeps being referenced — `pi-bolt doctor` reports it as "no longer installed" — until the next compile. It takes ~15-40 s, and the build before is kept: `pi-bolt update --rollback` restores it.

## Subagents (`pi-fabric`)

- Always pass `agent: "<profile>"` on `agents.spawn` / `agents.run` (omitting `agent` and `model` drops to raw `glm-5.3-flash` with no profile guardrails):
  - `scout` — read-only local codebase, call-graph, and contract mapping (`scout` alias, `readOnly: true`).
  - `researcher` — primary-source web, spec, and upstream repo investigation (`scout` alias; override `model: "reviewer"` for hard synthesis).
  - `worker` — focused single-slice PRs, Rego/proto updates, refactors, and targeted tests (`worker` alias).
  - `builder` — multi-file or cross-layer features, native/WebView bridges, state machines, and prototypes (`builder` alias).
  - `reviewer` — read-only adversarial spec and coding-standards review (`reviewer` alias, `readOnly: true`).
  - `oracle` — read-only architecture, security, and deadlock arbitration (`oracle` alias, `readOnly: true`).
- **Detached launch & confinement:** Launch `worker`, `builder`, and `researcher` via detached `agents.spawn` (yield the turn or use `background: true` on `fabric_exec`, never foreground `agents.run` / `agents.wait`) so Main stays free to answer mid-run child questions. Pass the exact target checkout as `cwd` (never a parent directory) and `writableRoots` when target paths are known; attach `agents.observe({ id, delivery: "wake" })` on multi-step runs.
- **Child escalations (`Subagent → Main → User`):** When woken by a child's `root`-held decision (`decisions.list({ status: "open", holder: "root" })`), answer with `decisions.answer({ id, text | optionId })` if settled by repo evidence or prior user instructions; if it requires user judgement, credentials/OTPs, or environment/device mutation, ask the user (or `decisions.escalate({ id, reason })`) before answering.
