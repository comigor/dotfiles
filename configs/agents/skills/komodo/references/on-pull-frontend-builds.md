# on_pull frontend builds (split-channel stacks)

Some stacks in `comigor/cloud` serve a **backend image** + a **static frontend
from a host volume**, where the frontend is rebuilt by the Repo resource's
`on_pull` hook — NOT by the stack image and NOT by DeployStack.

Worked example: `brick_vvorms` (game at vvorms.borges.dev).

> NOTE (2026-06): `brick_vvorms` itself has since been MIGRATED to a single
> container (the Colyseus server now serves its own client) — see
> `references/single-container-migration.md`. The two-channel wiring below is
> retained as a template for OTHER split stacks, not as the current vvorms state.

## How the stack is wired

`stacks/brick/vvorms.yaml`:
- service `vvorms`  → `image: nginx`, volume
  `${FOLDERS_APPS}/vvorms:/usr/share/nginx/html` (FRONTEND, static files on host)
- service `vvorms-server` → `image: vvorms-server:latest`, `pull_policy: never`
  (BACKEND, built locally on brick by Komodo build `vvorms_server`)

Public routes via pangolin labels:
- `vvorms.borges.dev`        → nginx :80   (frontend)
- `vvorms-api.borges.dev`    → server :2567 (backend, `/healthz`)

## The two update channels

| Channel | What updates it | What does NOT |
|---------|-----------------|---------------|
| Backend image `vvorms-server:latest` | Komodo build `vvorms_server` (`RunBuild`) then `DeployStack` | — |
| Frontend `/DATA/AppData/vvorms` (= `${FOLDERS_APPS}/vvorms`) | **`PullRepo` on the `vvorms` Repo** (runs `on_pull`) | `DeployStack` (it only recreates nginx serving the SAME old files) |

The `vvorms` Repo's `on_pull` command (from `GetRepo({repo:"vvorms"}).config.on_pull`):

```
docker run --rm \
  -v $PWD:/app \
  -v /DATA/AppData/vvorms:/dist \
  -w /app \
  -e VITE_COLYSEUS_URL=https://vvorms-api.borges.dev \
  node:22-alpine sh -c "apk add --no-cache git && git config --global --add safe.directory /app && npm ci && npm run build && rm -rf /dist/* && cp -r dist/* /dist/"
```

So PullRepo: checks out HEAD → npm ci → vite build → wipes & repopulates the
nginx host dir.

## Correct "is vvorms up to date?" procedure

```python
# 1. Is the BACKEND current?
GetRepo({"repo":"vvorms"})   # .info.latest_hash, .info.latest_message
GetBuild({"build":"vvorms_server"})  # .info.built_hash  -> must == repo HEAD

# 2. Refresh the FRONTEND (this is the step that's easy to miss)
r = execute PullRepo {"repo":"vvorms"}
upd_id = r["_id"]["$oid"]
# poll until Complete, then read the "On Pull" stage stdout:
#   should show "✓ built in Ns" + new dist/assets/index-<hash>.js
GetUpdate({"id": upd_id})

# 3. Restart nginx so it serves fresh files cleanly (avoid any caching)
execute RestartStack {"stack":"brick_vvorms","services":["vvorms"]}
#   NOTE: right after restart the frontend 502s for ~10-20s; retry the curl.

# 4. Verify live
#   curl https://vvorms.borges.dev | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'
#     -> must match the hash printed in the On Pull build log
#   curl -o/dev/null -w '%{http_code}' https://vvorms-api.borges.dev/healthz -> 200
```

## Gotchas observed

- `deployed_hash` on the STACK tracks the compose file in `comigor/cloud`
  (`stacks/brick/vvorms.yaml`), NOT the app repo `comigor/vvorms`. A stack
  showing deployed_hash==latest_hash can still serve a stale UI.
- `GetUpdate` logs: the `On Pull` stage is where the npm/vite build lives.
  vite prints its progress to STDERR (asset-shake warnings, chunk-size warning)
  and the success line `✓ built in Ns` to STDOUT — check both.
- Auto-deploy gap: the `cloud_sync_deploy` procedure was in `state: Failed`,
  so merges to `comigor/vvorms` were NOT auto-shipping the frontend. If a stack
  relies on a webhook+procedure to fire PullRepo on merge and that procedure is
  Failed, frontend changes silently never go live — run PullRepo manually and
  fix the procedure.
- The bee→brick SSH hop has no key (igor@10.0.0.20 Permission denied), so you
  can't inspect brick containers by hopping through bee. Use the Komodo API
  (GetUpdate logs, ListStackServices) + public-URL curls to verify instead.
