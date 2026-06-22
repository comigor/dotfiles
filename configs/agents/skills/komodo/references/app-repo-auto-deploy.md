# vvorms auto-deploy on app-repo merge (procedure + GitHub webhook)

Pushing to the vvorms APP repo (comigor/vvorms) does NOT auto-deploy. Unlike
the cloud GitOps repo (which has the `cloud_sync_deploy` procedure webhook),
the app repo needs its own webhook -> Komodo procedure that does
RunBuild -> DestroyStack -> DeployStack.

## The procedure (lives in cloud repo main.toml, managed by sync)

`[[procedure]] name = "vvorms_build_deploy"` with 3 stages:
1. RunBuild   build=vvorms_server
2. DestroyStack stack=brick_vvorms   (needed: :latest + pull_policy:never no-ops otherwise)
3. DeployStack  stack=brick_vvorms
Carries `config.webhook_secret = "<32-char secret>"`.

Add the block after `cloud_sync_deploy` in main.toml (delegate edit to
opencode-http), then `RunSync {sync:cloud}` to create the procedure resource.
Get its id from `ListProcedures`.

## GitHub webhook listener URL — THE BRANCH SEGMENT IS REQUIRED

Komodo 1.19.x route (from source `bin/core/src/api/listener/router.rs`):
```
/listener/github/procedure/{id_or_name}/{branch}
```
**Omitting `/{branch}` returns HTTP 405** (cost me a debugging detour). Use the
real branch (`main`) or the literal `__ANY__` to fire on any branch.

Full URL example:
```
https://komodo.borges.dev/listener/github/procedure/<PROC_ID>/main
```

Verify the whole chain WITHOUT touching GitHub by POSTing a signed fake push:
```python
import json,hmac,hashlib,urllib.request
body=json.dumps({"ref":"refs/heads/main","repository":{"full_name":"comigor/vvorms"},
                 "head_commit":{"id":"probe"}}).encode()
sig="sha256="+hmac.new(SECRET.encode(),body,hashlib.sha256).hexdigest()
# POST to the URL with headers X-GitHub-Event: push, X-Hub-Signature-256: sig
# 200 = chain works; it actually kicks off the build+deploy.
```
RunProcedure {procedure:"vvorms_build_deploy"} also runs it directly to test.

## GOTCHA — Komodo's GitHub token can't create the webhook

The `comigor` git_provider token in Komodo core config
(`/shared/config/komodo/config.core.toml` on bee) is a fine-grained PAT scoped
for `git clone` only. `POST /repos/comigor/vvorms/hooks` returns
**403 "Resource not accessible by personal access token"** (no admin:repo_hook).
No other token in the homelab (brick/opencode) has hook scope either.

=> The webhook must be created MANUALLY in GitHub UI (or by the user with a
token that has admin:repo_hook). Settings -> Webhooks -> Add webhook:
- Payload URL: the `/listener/github/procedure/<id>/main` URL
- Content type: application/json
- Secret: the procedure's webhook_secret
- Events: Just the push event
Komodo verifies the HMAC-SHA256 sig against webhook_secret, checks the branch,
then runs the procedure.

## Reading Komodo core config (secret + git token)

Komodo core runs as a container on BEE (not self-managed). Webhook secret and
the comigor GitHub token live in `/shared/config/komodo/config.core.toml`:
`webhook_secret = "..."` and `[[git_provider]] accounts = [{username, token}]`.
SSH: `ssh -F /opt/data/home/.ssh/config bee` (HOME=/opt/data).
