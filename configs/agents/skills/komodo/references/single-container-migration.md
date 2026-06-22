# Single-container vvorms (current state, 2026-06) + the stale-cache gotcha

`brick_vvorms` was migrated from a two-channel split (nginx static frontend +
Colyseus backend, two domains) to ONE container: the Colyseus server serves its
own built client on port 2567. This is the current production state.

## Current wiring

`stacks/brick/vvorms.yaml` — single service:
- service `vvorms` → `image: vvorms-server:latest`, `pull_policy: never`,
  `PORT=2567`, healthcheck `wget http://localhost:2567/healthz`.
- ONE pangolin route: `vvorms.borges.dev` → :2567.
- The old `vvorms-api.borges.dev` domain and the nginx static service are GONE.
- The client connects **same-origin** (derives ws/wss from `window.location`),
  so there is NO `VITE_COLYSEUS_URL` build arg anymore.

`komodo/resources/main.toml`:
- `[[stack]] brick_vvorms` → `environment = ""` (no FOLDERS_APPS).
- `[[build]] vvorms_server` → builds the app repo's root multi-stage Dockerfile
  (stage 1 builds the client with vite, stage 2 = server + COPY --from=client
  /app/dist). Carries `extra_args = ["--no-cache"]` (see gotcha below).
- The legacy `[[repo]] vvorms` static-build hook was REMOVED. There is no more
  `on_pull` / PullRepo channel for this stack.

## Correct deploy-after-merge procedure (single container)

There is now ONE channel. PullRepo is irrelevant for vvorms.

```python
# 1. Rebuild the image at app HEAD (client + server in one multi-stage build)
execute RunBuild   {"build":"vvorms_server"}     # poll GetUpdate -> Complete
# 2. Force a fresh container (see "stale latest" note) — DeployStack alone may
#    no-op because the :latest tag + pull_policy:never means docker sees no change
execute DestroyStack {"stack":"brick_vvorms"}
execute DeployStack  {"stack":"brick_vvorms"}
# 3. Verify live (single origin serves BOTH client and game server)
#   curl https://vvorms.borges.dev            -> 200, serves assets/index-<hash>.js
#   curl https://vvorms.borges.dev/healthz    -> {"ok":true}
#   curl -X POST https://vvorms.borges.dev/matchmake/ -> 200  (Colyseus, same-origin)
```

## GOTCHA #1 — Docker layer cache ships a STALE client bundle (cost ~1h)

Symptom: RunBuild reports `success` and tags the image with the new commit
(`built_hash: <newsha>`), the container recreates with tiny uptime, the site is
200 — but the served `assets/index-<hash>.js` filename NEVER changes across
merges, so new client code isn't live.

Root cause: the multi-stage Dockerfile's stage-1 `RUN npm run build` gets
**CACHED** by BuildKit. Komodo's `built_hash` label tracks the git checkout, NOT
whether layers actually rebuilt — so it lies. Pull the build's `GetUpdate` logs
and count `CACHED` lines: if `[client …] RUN npm run build` shows `CACHED`, the
bundle is stale.

Verify independently: have OpenCode (brick) do a CLEAN clone of app HEAD and run
`npm ci --ignore-scripts && GIT_HASH=$(git rev-parse --short HEAD) npm run build`,
then compare `dist/assets/index-*.js` to what's served live. Mismatch = stale.
(Note: `unset NODE_ENV` before `npm ci` or it skips devDeps and tsc/vite vanish.)

### Fix — `extra_args = ["--no-cache"]` on the build (durable, in main.toml)

- `no_cache = true` is NOT a field in this Komodo version's build schema. Adding
  it to main.toml makes RunSync say "No Changes / nothing to do" and a direct
  `UpdateBuild` API write silently drops it. It does nothing. Don't use it.
- The builder is the **legacy docker builder** (`use_buildx = false`), so
  `extra_args = ["--no-cache"]` passes `--no-cache` straight to `docker build`.
  This works: CACHED step count drops from ~9 to ~1 and `✓ built in Ns` appears
  in the `npm run build` log. The vvorms image is small (~1 min cold), so the
  blanket no-cache cost is acceptable and guarantees correctness.
- Must live in `main.toml` (not just an API write) to survive RunSync
  reconciliation — a managed build gets its config reset to the repo's on every
  sync, so an API-only `extra_args` would be wiped by the next merge's sync.

## GOTCHA #2 — version badge shows "dev"

`vite.config.ts` bakes `GIT_HASH` into the bundle for the in-app version badge,
falling back to `process.env.GIT_HASH` → Dockerfile default `GIT_HASH=dev`.
Komodo's `vvorms_server` build does NOT pass a `GIT_HASH` build arg, so the badge
reads "dev". Cosmetic only. To fix properly, Komodo would need to inject
`build_args = "GIT_HASH=<short-sha>"` per build — but Komodo can't easily
template the live SHA into a static build arg, so this is left as "dev" for now.

## GOTCHA #3 — "stale latest" no-op deploy

`image: vvorms-server:latest` + `pull_policy: never`: after RunBuild replaces the
`:latest` image, `DeployStack` (`compose up -d`) can decide nothing changed and
leave the OLD container running (tell: container uptime stays large). Always
`DestroyStack` then `DeployStack` to guarantee the new image is picked up, or
confirm via `/healthz` uptime resetting to a few seconds.

## GOTCHA #4 — "merge didn't deploy" is often a FAILED BUILD, not a deploy lag

Pushing to vvorms `main` does NOT auto-build/deploy (no webhook wired on the
`vvorms_server` build). Every merge needs the manual sequence above. But before
assuming "Komodo just hasn't run yet," ALWAYS check the build actually succeeded
— a green-looking redeploy can silently ship the OLD image when the new build
failed.

Triage in this exact order when a merge isn't live:
```python
# 1. What's actually served vs what Komodo built vs repo HEAD
GetStack {"stack":"brick_vvorms"}     -> info.deployed_hash, latest_hash
GetBuild {"build":"vvorms_server"}    -> info.built_hash, info.state
#    curl https://vvorms.borges.dev | grep assets/index-<hash>.js  (live bundle)
#    curl https://vvorms.borges.dev/healthz -> uptime (large uptime = stale container)
# 2. If built_hash lags repo HEAD, RunBuild and CHECK success:
RunBuild {"build":"vvorms_server"}    -> poll GetUpdate{id} until Complete
#    READ u["success"] — if False, the image was NOT replaced. Do NOT DeployStack
#    a failed build (you'll just redeploy the same stale image and "confirm" it).
# 3. Only on success: DestroyStack -> DeployStack -> verify bundle hash changed.
```
The `GetUpdate` log's "Docker Build" stage carries the real compiler error in
its stdout/stderr (search for `ERROR`, `E401`, `did not complete successfully`).
`u["success"]: False` with `built_hash` unchanged is the unambiguous tell.

## GOTCHA #5 — CodeArtifact-poisoned package-lock.json breaks `npm ci` with E401

Symptom: the Docker build's `RUN npm ci` stage fails with
`npm error code E401 / Unable to authenticate, your authentication token seems
to be invalid` — even though every dependency is public. This recurs because the
repo owner's LOCAL npm is routed through a private AWS CodeArtifact mirror, so
any `npm install` they run rewrites `resolved` URLs in `package-lock.json` from
`registry.npmjs.org` to
`https://frontier-<acct>.d.codeartifact.<region>.amazonaws.com/npm/npm/...`.
`npm ci` is strict — it fetches exactly those URLs, and CodeArtifact requires an
auth token the image build doesn't have → E401. (Already happened twice on
vvorms: commit `f257ae1` cleaned it, then a later "formatter" commit re-poisoned
it.)

Diagnose: have OpenCode `grep -c codeartifact package-lock.json server/package-lock.json`
on the app repo HEAD. Any hits = poisoned. Also `git log --oneline <lastgood>..HEAD`
and look for an install/format commit that touched the lockfile.

Fix (sed-only is usually enough — integrity sha512 is content-based and the
public tarballs are identical, so hashes stay valid):
```bash
sed -i 's#https://frontier-[0-9]*\.d\.codeartifact\.[a-z0-9-]*\.amazonaws\.com/npm/npm/#https://registry.npmjs.org/#g' package-lock.json
# repeat for server/package-lock.json if it also has hits
# VERIFY before commit (this is exactly what the image build runs):
rm -rf node_modules && npm ci --ignore-scripts   # must exit 0, root AND server/
grep -c codeartifact package-lock.json            # must be 0
```
If `npm ci` then fails on an integrity mismatch, fall back to a full regen:
`rm package-lock.json && npm install --ignore-scripts --registry=https://registry.npmjs.org/`.
Delegate the edit+verify+push to the `opencode-http` skill (it has the SSH agent
forwarded), then come back and RunBuild→Destroy→Deploy.

Permanent prevention (offer it): a repo-local `.npmrc` pinning
`registry=https://registry.npmjs.org/` overrides the owner's global CodeArtifact
config for this repo only, so future `npm install`s can't re-poison the lockfile.

## Pangolin leftover

After dropping the `vvorms-api` label, `vvorms-api.borges.dev` returns 502 (not a
clean 404) — Pangolin still holds the resource with a dead upstream. Cosmetic;
the domain is unused. Clean up the Pangolin resource if it bothers you.
