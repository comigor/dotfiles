---
name: komodo
description: Drive the Komodo orchestrator (sync, deploy, manage variables) for this homelab repo via its HTTP API. Use whenever a task involves Komodo - applying stack changes after a commit, creating/updating Komodo variables, redeploying a stack on bee/brick/oracle, inspecting stack state, triggering RunSync or DeployStack, or anything referencing the Komodo UI at komodo.borges.dev.
---

# Komodo API skill

This repo is a GitOps tree consumed by Komodo (https://komodo.borges.dev). Stacks
live under `stacks/<host>/*.yaml`, and `komodo/resources/main.toml` is the source
of truth for what Komodo manages. Pushing to `master` does **not** auto-deploy:
you must trigger Komodo to sync and redeploy. This skill is how an agent does
that without clicking around the UI.

## Credentials

Always read these from the environment - never hard-code:

```
KOMODO_HOST       # default: https://komodo.borges.dev
KOMODO_API_KEY    # K-...
KOMODO_API_SECRET # S-...
```

If they're missing, ask the user once. Don't echo the secret back.

## Endpoints

Komodo exposes three POST endpoints. Body is always
`{"type": "<RequestName>", "params": {...}}`. Auth via headers
`X-Api-Key` and `X-Api-Secret`.

| Endpoint  | Purpose                                      |
| --------- | -------------------------------------------- |
| `/read`   | Queries: `ListStacks`, `GetStack`, `ListVariables`, `GetVersion`, etc. |
| `/write`  | Mutations on Komodo state: `CreateVariable`, `UpdateVariableValue`, `DeleteVariable`, etc. |
| `/execute`| Side effects: `RunSync`, `DeployStack`, `RunBuild`, `RunProcedure`, etc. |

Confirm reachability with `GetVersion` before doing anything destructive.

## Reusable Python helper

Prefer Python over chained curls - it's easier to keep secrets out of logs and
to handle JSON cleanly. Drop this inline in a heredoc and pipe the call list:

```bash
python3 <<'PY'
import json, os, urllib.request, urllib.error, sys

HOST = os.environ.get("KOMODO_HOST", "https://komodo.borges.dev").rstrip("/")
H = {
    "X-Api-Key": os.environ["KOMODO_API_KEY"],
    "X-Api-Secret": os.environ["KOMODO_API_SECRET"],
    "Content-Type": "application/json",
}

def call(endpoint, type_, params=None, timeout=120):
    body = json.dumps({"type": type_, "params": params or {}}).encode()
    req = urllib.request.Request(f"{HOST}/{endpoint}", data=body, headers=H, method="POST")
    try:
        return json.loads(urllib.request.urlopen(req, timeout=timeout).read())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:1000]}

# example
print(call("read", "GetVersion"))
PY
```

For one-off curl probes:

```bash
curl -sf -X POST "$KOMODO_HOST/read" \
  -H "X-Api-Key: $KOMODO_API_KEY" \
  -H "X-Api-Secret: $KOMODO_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type":"GetVersion","params":{}}'
```

## Recipes

### List/inspect stacks

```python
call("read", "ListStacks")                                     # all stacks
call("read", "GetStack", {"stack": "bee_memtly"})              # one stack
call("read", "ListVariables")                                  # all variables
```

`GetStack` returns `info.deployed_hash` (the git SHA Komodo has applied) and
`info.state`. **Caveat:** `info.state` is often `null` for a few minutes after
a deploy - don't poll on it alone. Poll on `deployed_hash` matching your
expected commit, then sanity-check state.

### Create / update / delete variables

```python
call("write", "CreateVariable",
     {"name": "MEMTLY_ADMIN_PASSWORD", "value": "...", "is_secret": True})

call("write", "UpdateVariableValue",
     {"name": "MEMTLY_TITLE", "value": "Marina & Igor"})

call("write", "DeleteVariable", {"name": "MEMTLY_TEST_PROBE"})
```

- Use `is_secret: True` for credentials, encryption keys, tokens. Secret
  values are masked in `ListVariables`.
- Variable names referenced in `main.toml` use the form `[[VAR_NAME]]` -
  Komodo interpolates them when rendering a stack's `environment` block.
- A stack's compose file uses standard `${VAR}` references, populated from
  the `environment` block in `main.toml`, which in turn pulls from Komodo
  variables via `[[VAR]]`. Three layers: compose `${}` <- main.toml <-
  Komodo variables `[[]]`.

### Sync resources from this repo

After pushing to `master`, Komodo's view of `main.toml` is stale until it
re-syncs. `RunSync` re-reads the repo and reconciles managed resources.

```python
call("execute", "RunSync", {"sync": "cloud"})
```

The sync resource is named `cloud` (see the `[[resource_sync]] name = "cloud"`
entry in `main.toml`). `RunSync` returns immediately with `status: InProgress`;
give it ~5-10 s before issuing dependent operations.

### Deploy a stack

```python
call("execute", "DeployStack", {"stack": "bee_memtly"})
```

This pulls the latest compose file, re-renders env, and `docker compose up -d`s
on the target server. Komodo also has `BatchDeployStackIfChanged` (see the
`cloud_sync_deploy` procedure in `main.toml`) which is what the GitHub webhook
triggers - skipping unchanged stacks. For a one-off deploy of a stack you just
modified, `DeployStack` is more direct.

### End-to-end "deploy my changes" flow

```
1. Edit stacks/<host>/<service>.yaml (and if adding a new stack, register it
   in komodo/resources/main.toml with file_paths, environment, etc.).
2. (If new variables are needed) call("write", "CreateVariable", ...) for each.
3. git commit + git push origin master.
4. call("execute", "RunSync",     {"sync": "cloud"})
5. sleep ~5 s
6. call("execute", "DeployStack", {"stack": "<stack_name>"})
7. Poll call("read", "GetStack", {"stack": "<stack_name>"}) until
   info.deployed_hash matches the commit you pushed.
8. Verify via SSH or HTTP that the container is healthy.
```

Steps 4 and 6 can be skipped if the stack uses `auto_update = true` AND the
GitHub webhook is wired (most stacks here are wired) - in that case a push to
master fires `cloud_sync_deploy`, which does sync + selective deploy. But
explicit calls are faster than waiting on the webhook and remove ambiguity.

### Editing main.toml or stack YAMLs — DELEGATE TO OPENCODE

**Do not try to clone `comigor/cloud` locally.** This agent's host has no
GitHub SSH key, no `gh` CLI, and no credential helper configured — every
attempt will fail at `git clone`. Trying to "just edit the string in memory"
from `GetResourceSync.info.remote_contents` and push it back is also wrong:
there is no Komodo write endpoint that accepts raw TOML and commits to the
repo (`WriteSyncFileContents` requires file_path + contents but does NOT push
to git — it writes to Komodo's local checkout which gets overwritten on the
next `RunSync`).

The correct path for any repo edit is to **load the `opencode-http` skill and
delegate the edit there**. OpenCode on brick has the SSH agent socket forwarded
and can clone/edit/commit/push `comigor/cloud` cleanly. Then come back here
and run `RunSync` + (optional) `DeployStack` to apply.

Pattern:
```
1. (this skill) Inspect current state — ListStacks, GetStack, GetResourceSync,
   so you know exactly what block to remove/edit and can write a precise
   instruction for OpenCode.
2. (opencode-http skill) Delegate the edit: clone/edit/commit/push with a
   commit message and report back the new HEAD SHA.
3. (this skill) call("execute", "RunSync", {"sync": "cloud"}); sleep 10 s.
4. (this skill) Confirm: GetResourceSync.info.last_sync_hash == new SHA.
5. (this skill) DeployStack on any stack you changed (or destroy is implicit
   when the [[stack]] block is removed — sync alone deletes the resource).
```

The same applies to compose files under `stacks/<host>/*.yaml`, Dockerfiles
under `builds/`, and the sync's own `main.toml`. Always delegate the repo
write.

### Trigger a build

```python
call("execute", "RunBuild", {"build": "custom_openchamber"})
```

### "Make sure stack X is up to date after a repo merge" — CHECK FOR on_pull HOOKS

A stack can ship code through **two independent channels**, and `DeployStack`
only refreshes one of them. Before declaring a stack current, identify how each
service gets its code:

1. **Backend via Komodo Build** — service `image: <name>:latest` built by a
   `[[build]]` from the app repo. Update path: `RunBuild` (or it auto-builds on
   the build's own poll) → `DeployStack` to pull the fresh image. Check
   alignment: `GetBuild.info.built_hash` == repo HEAD.
2. **Frontend via Repo `on_pull` hook** — service mounts a host directory
   (`volumes: ${FOLDERS_APPS}/<svc>:/usr/share/nginx/html`) and the **Repo
   resource** (not the Stack) carries an `on_pull` command that runs the
   frontend build and copies `dist/*` into that host dir. Update path:
   **`PullRepo` on the Repo resource** — `DeployStack` does NOTHING for this
   half. After PullRepo, restart the nginx/static service so it serves the
   fresh files cleanly.

**Pitfall (cost me a wrong "it's up to date"):** a static frontend served from
a host volume by a vanilla `nginx` image looks current in `ListStackServices`
(`image: nginx`, deployed_hash matches) even when the actual UI bundle on disk
is stale. The deployed_hash tracks the *compose file* in the cloud repo, not the
app repo. Always inspect `GetRepo.config.on_pull` for the app's Repo resource;
if it runs an npm/vite build into a `/dist` mount, the frontend updates on
PullRepo, full stop.

Verify the right thing shipped: run `PullRepo`, poll the returned update via
`GetUpdate({id})` until `status == "Complete"`, and read the `On Pull` stage's
stdout — a successful Vite build prints `✓ built in Ns` and the new asset
filenames. Then `curl` the public URL and grep the served `index.html` for the
new `assets/index-<hash>.js` to confirm nginx is serving it. See
`references/on-pull-frontend-builds.md` for the worked vvorms recipe.

### Run a procedure

```python
call("execute", "RunProcedure", {"procedure": "cloud_sync_deploy"})
```

## Public routing = Pangolin via Docker labels (NOT nginx/Traefik/Caddy)

Public hostnames in this homelab are routed by **Pangolin**, configured with
**Docker labels on the compose service** — there is no standalone nginx vhost
file, no Traefik labels, no Caddy config in the repo. To route
`<name>.borges.dev` to a container port, the service carries:

```yaml
    labels:
      - pangolin.public-resources.<name>.name=<name>
      - pangolin.public-resources.<name>.full-domain=<name>.borges.dev
      - pangolin.public-resources.<name>.protocol=http
      - pangolin.public-resources.<name>.targets[0].method=http
      - pangolin.public-resources.<name>.targets[0].port=<container_port>
    networks:
      - pangolin            # external network named "pangolin"
```

Pangolin/newt watches these labels and creates the public resource. When a
migration plan hands you an "nginx config" for a domain, that's just an example
shape — the actual change in this repo is editing/moving the Pangolin label.
Pitfall: removing the label from compose does NOT always reap the already-created
Pangolin resource, so a decommissioned `<name>-api.borges.dev` can keep
answering 502 (stale upstream) rather than 404. Delete the Pangolin resource if
you need it truly gone.

## Adding a NEW public root domain (Cloudflare + Pangolin)

Splits into two halves. **DNS is fully scriptable from here; Pangolin org-domain
registration is NOT** (needs admin access this host lacks).

- **Cloudflare DNS**: the `CF_API_TOKEN` Komodo var edits DNS across all account
  zones via the standard CF v4 API. For a fresh apex, Pangolin OSS only supports
  a **wildcard** domain, which wants **A records to the Pangolin server IP**
  (oracle = `144.22.246.72`), grey-cloud/DNS-only so Pangolin does TLS. Create
  both `<domain>` and `*.<domain>` A records. (All `*.borges.dev` public records
  are grey-cloud CNAMEs to `oracle.borges.dev`, which is A->144.22.246.72.)
- **Pangolin**: the `full-domain=<host>` label only binds if the domain is
  already registered + verified as a Pangolin **org domain**
  (`PUT /org/:orgId/domain`, type `wildcard`). The mgmt API is 401 unauth, NO
  admin key is in Komodo (only `*_PANGOLIN_NEWT_*` tunnel creds, which don't
  count), and there's no SSH to oracle. So you'll hit a wall — ask the user to
  either create a Pangolin API key (store as `PANGOLIN_API_KEY`) or register the
  domain in the dashboard themselves, then flip/extend the stack's labels.
- **Interim**: offer a Cloudflare redirect rule `newdomain -> existing.borges.dev`
  to make the domain live instantly while Pangolin access is sorted.

Full worked recipe (vvorms.com), exact zone IDs, CF API calls, and the access
gap: `references/new-public-domain-cloudflare-pangolin.md`.

## Deploying OpenAI-compatible AI apps (BYOK Anthropic) — pattern

Many self-hosted apps (Karakeep, Linkwarden, etc.) take an `OPENAI_BASE_URL` +
`OPENAI_API_KEY` pair for AI features. **Anthropic ships an OpenAI-compatible
endpoint at `https://api.anthropic.com/v1/`** — point the app there with a plain
`sk-ant-...` key (reuse an existing `[[*_ANTHROPIC_API_KEY]]` vault var; the
same key works for both native Anthropic and the OpenAI-compat surface). Use
Anthropic model IDs directly: prefer **`claude-haiku-4-5`** for cheap
high-volume tagging/classification (the older `claude-3-5-haiku-latest` ID went
stale and silently failed Karakeep's inference jobs — bumping to
`claude-haiku-4-5` fixed it), `claude-sonnet-*` when quality matters. If a model
ID 404s on the compat surface, fall back to the dated form
(e.g. `claude-haiku-4-5-20251001`).

Caveat: **Anthropic has NO embeddings endpoint.** Leave any `EMBEDDING_*` var
unset — the app keeps full-text search but loses semantic/vector search. If the
user wants embeddings too, split it: tagging/summaries on Anthropic, embeddings
pointed at a local model (e.g. bee's llama-router) via the app's separate
embedding base-URL var.

**Model ID for Karakeep inference: use `claude-haiku-4-5`** (the user prefers the
latest Haiku ID, NOT the older `claude-3-5-haiku-latest`). Set BOTH
`INFERENCE_TEXT_MODEL` and `INFERENCE_IMAGE_MODEL` in the `web` service env. The
wrong/old model ID makes every inference background job fail silently against
Anthropic's compat surface — symptom is "AI not working" with healthy-looking
container. Verify the fix by re-running inference (Karakeep admin → re-run on all
bookmarks, route `admin.reRunInferenceOnAllBookmarks`) and tailing the `web`
service log for `[inference][N] Completed successfully`.

**Pulling Karakeep (or any stack) container logs via Komodo:** `GetStackLog`
params are `{stack, services:[...], tail}` — `services` is a REQUIRED LIST
(omitting it returns HTTP 422 "missing field services"). Karakeep inference only
logs when bookmarks are added or re-run; idle logs are dominated by
`HEAD /api/health` pings, so grep those out. After a fresh deploy, "failed AI
jobs" the user sees in the UI are usually STALE entries from before the fix —
check job timestamps against the redeploy time before assuming a new failure.

End-to-end recipe used for `brick_karakeep` (multi-service app + Pangolin):
1. Pull the app's env contract from DeepWiki (`mcp_deepwiki_ask_question` on the
   app repo) — get exact var names, required services, web port.
2. `CreateVariable` for app-specific secrets (e.g. `<APP>_NEXTAUTH_SECRET`,
   `<APP>_MEILI_MASTER_KEY`) via `is_secret: True`. Reuse existing vault vars
   for the Anthropic key + folders + DNS_DOMAIN.
3. Delegate the repo edit to opencode-http: it writes `stacks/<host>/<app>.yaml`
   (web service on BOTH internal + external `pangolin` network; helper services
   internal-only; Pangolin labels mirroring an existing stack like
   `dawarich.yaml`) and adds the `[[stack]]` block to main.toml. **Tell it to
   read a sibling brick/oracle compose first and mirror label key style + the
   `external: true` pangolin net exactly** — don't let it invent label shapes.
4. `RunSync({sync:"cloud"})`; confirm `last_sync_hash` == pushed SHA and the new
   stack name appears in `ListStacks`.
5. `DeployStack` — image pulls make `ListStackServices` state read `None` for
   minutes; trust `ListStacks` `info.state`/`status` (`running(3)`) instead.
6. Verify the public route with `curl -sk -L`; first-run apps often `307` to a
   `/signin`/setup page returning `200` — that's a healthy boot, not an error.
   The `cloud_sync_deploy` `brick_*` wildcard auto-picks new brick stacks, so no
   boot-redeploy list edit is needed (that list is bee-only).

## Migration recipes (references/)

- `references/on-pull-frontend-builds.md` — keeping a SPLIT stack (backend image
  + static frontend from a host volume via the Repo `on_pull` hook) up to date.
  PullRepo refreshes the frontend; DeployStack does not.
- `references/single-container-migration.md` — the INVERSE: collapsing a
  two-container split into ONE service when the server learns to serve its own
  built client. Pre-flight checks, cloud-repo edits, the
  RunSync→RunBuild→DestroyStack→DeployStack apply sequence, and same-origin
  verification curls. ALSO carries the "merge didn't deploy" triage (a failed
  build silently redeploys the stale image — always read `GetUpdate.success`)
  and the recurring CodeArtifact-poisoned `package-lock.json` E401 fix.

## Repo conventions to respect

- Stack file naming: `stacks/<host>/<service>.yaml`. Host is `bee`, `brick`,
  or `oracle`.
- Every new stack must have a `[[stack]]` block in `komodo/resources/main.toml`
  with `server`, `linked_repo = "cloud"`, `run_directory`, `file_paths`,
  and an `environment` block listing the Komodo `[[VAR]]` references.
- Don't put `[[VAR]]` inside compose files - they're only resolved by Komodo
  at render time inside `main.toml`'s `environment`. Compose files use plain
  `${VAR}`.
- `auto_update = true` is the norm and lets the daily 03:00 procedure pull
  newer images. Set `deploy = true` on top-level if you want Komodo to
  auto-deploy on first sync.
- `webhook_enabled = false` on every stack: the per-stack webhook is unused
  in favor of the single `cloud_sync_deploy` procedure webhook.
- `komodo.skip` label on a service protects it from Komodo lifecycle actions
  (used for gluetun, qbittorrent, etc.).
- Storage lives in `${FOLDERS_APPS}` (small/state) or
  `${FOLDERS_LARGE_STORAGE}` (media/big data).

See `AGENTS.md` at repo root for the broader contract.

## Editing main.toml / stack compose files

This machine generally does NOT have a clone of `comigor/cloud` and no SSH
agent or `gh` CLI. Don't try `git clone https://github.com/comigor/cloud`
- the repo is private and the clone will fail. For any change to
`komodo/resources/main.toml` or anything under `stacks/`, delegate the
edit to the brick OpenCode container via the `opencode-http` skill: it
has the SSH agent socket forwarded and lives in `/workspace/cloud`.

The division of labor is:

- **opencode-http**: clone/edit/commit/push the repo (and report back the
  new commit SHA).
- **komodo (this skill)**: after the push lands, drive Komodo via API
  (`RunSync` -> wait -> `DeployStack` / `PullRepo` / etc.) to apply it.

A useful pre-flight for the OpenCode prompt: pull `main.toml` via
`GetResourceSync({sync:"cloud"})` first, find the exact block to edit
(e.g. by searching for `name = "bee_<service>"`), and quote that text
verbatim in the prompt so OpenCode does an unambiguous edit. The
`remote_contents` returned by `GetResourceSync` is the current
master-branch version Komodo sees, including comments.

## End-to-end "delete a stack" flow

Concrete recipe (worked for `bee_goclaw`):

1. `DestroyStack` -> stops + removes containers on the target host.
2. Delegate to opencode-http: edit `komodo/resources/main.toml` to drop
   the `[[stack]]` block (and any references in `[[action]]` blocks like
   `boot_redeploy_bee`'s `const stacks = [...]` list). Push to master.
3. `RunSync({sync:"cloud"})` -> because the sync is `managed = true`,
   Komodo removes the stack resource that's no longer in main.toml.
   Same applies to `[[build]]` / `[[repo]]` blocks: dropping them from
   main.toml + RunSync deletes the corresponding Komodo resource. You
   do NOT need a separate `DeleteStack` / `DeleteBuild` API call.
4. Verify `ListStacks` no longer returns the name.

## Repo resource state troubleshooting

`Repo` resources go to `state = "Failed"` after a single failed
`PullRepo`, and `RefreshRepoCache` does NOT clear it. Common causes I've
hit:

- **"repo has no server attached"**: the `[[repo]]` block in main.toml
  lacks a `server = "<bee|brick|oracle>"` line under `[repo.config]`.
  Komodo cannot clone without somewhere to clone to. Fix the TOML, push,
  RunSync, then `PullRepo` once successfully -> state clears to `Ok`.
- **"Resource is busy"**: a previous build / pull is still running.
  Just retry `PullRepo` after a few seconds.

The `cloud` repo specifically had no server attached for a long time -
its only consumer was the `cloud` ResourceSync (which doesn't need a
server-attached Repo, it pulls into core). If you see `cloud` in
`Failed` state, the fix is to add `server = "bee"` and pull once.

## Pitfalls I learned the hard way

- **`info.state` is null** for several minutes post-deploy. Poll `deployed_hash`
  instead, fall back to SSHing the host (`docker ps --filter name=<svc>`).
- **`RunSync` is async**. Issuing `DeployStack` before sync finishes can
  redeploy the *previous* commit. `time.sleep(5-10)` between is enough in
  practice; for safety, poll `ListStacks` until the new stack name appears
  (when introducing a brand-new stack) or `deployed_hash` advances.
- **App-level settings persist in app DBs**. Many apps (Memtly, Whoami, etc.)
  only import settings from env on the very first container boot. Setting
  `DATABASE_SYNC_FROM_CONFIG=true` (Memtly) or its equivalent forces re-import
  on every boot and keeps GitOps as the source of truth.
- **`[[VAR]]` reference but variable not created** -> the stack will fail to
  deploy with a missing-secret error. Always `ListVariables` and confirm,
  or `CreateVariable` first, before pushing the new `main.toml`.
- **`is_secret: true` is permanent for the variable** - the value is masked
  in subsequent `ListVariables` responses. Save the value somewhere if you
  need it again.
- **Don't push secrets via this API into the repo**. Komodo variables stay in
  Komodo's DB; the repo only references them by name.
- **`Repo` resource with `server_id=""` will always show `state=Failed`** in
  `ListRepos` after any `PullRepo` attempt — error: "repo has no server
  attached". This is by design for repos that are pure metadata for a sync
  (e.g. the `cloud` repo entry is referenced by the `cloud` ResourceSync but
  never cloned to a server itself). It's a cosmetic state-indicator bug, not
  a real failure. Verify by checking the corresponding `ResourceSync.state`
  is `Ok` — that's what actually matters. Do not try to "fix" it with
  `RefreshRepoCache` (no-op) or by retrying `PullRepo` (always fails). If
  it bothers you, attach a server or delete the Repo resource.
- **Deleting a stack: two ways, do both in order.** To fully remove
  `<stack>`: first `call("execute", "DestroyStack", {"stack": "<stack>"})`
  to take down containers/network on the host, then have OpenCode remove
  the `[[stack]]` block from `main.toml` and push, then `RunSync` to drop
  the Komodo resource. Skipping the DestroyStack leaves orphan containers
  running on the host with no Komodo control. Skipping the toml edit means
  Komodo will recreate the stack on the next sync.
- **`info.state` discrepancies between `GetStack` and `ListStacks`.** A
  freshly redeployed stack often shows `state: None` in `GetStack` for a
  few minutes while `ListStacks` already says `running`. Trust `ListStacks`
  + `ListStackServices` (which returns per-container `state`/`status`) for
  realtime health; reserve `GetStack` for `deployed_hash` and config.

## Quick health check

Run this once at the start of a Komodo session:

```bash
python3 <<'PY'
import json, os, urllib.request
H = {"X-Api-Key": os.environ["KOMODO_API_KEY"],
     "X-Api-Secret": os.environ["KOMODO_API_SECRET"],
     "Content-Type": "application/json"}
host = os.environ.get("KOMODO_HOST", "https://komodo.borges.dev").rstrip("/")
for ep, t in [("read","GetVersion"), ("read","ListServers")]:
    r = urllib.request.Request(f"{host}/{ep}",
        data=json.dumps({"type":t,"params":{}}).encode(),
        headers=H, method="POST")
    print(t, "->", urllib.request.urlopen(r, timeout=15).read().decode()[:200])
PY
```

If `ListServers` returns the expected hosts (`bee`, `brick`, `oracle`), you're
authenticated and ready.
