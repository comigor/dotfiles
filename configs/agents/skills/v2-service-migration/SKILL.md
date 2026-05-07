---
name: v2-service-migration
description: Migrate a Decade service repository from the v1 definition.yaml schema to v2 (chart routing block, per-env version files, org-deploy-v2 + org-promote workflows, dual-dispatch retrocompat). Use when adapting a service to deploy through the v2 gitops pipeline. Triggers include "migrate to v2", "v2 service migration", "adopt v2 schema", "switch deploy.yaml to v2", "add promote workflow", "deploy this service to prod" (when said about a v1 service).
---

# v2-service-migration

End-to-end migration of a Decade service repo from the v1 deploy pipeline to the v2 pipeline. Same steps already applied to `users`, `codec-server`, `notifications`, `email-client`, and `party`.

## What v2 is

| | v1 | v2 |
|---|---|---|
| Source of truth | `definition.yaml` (with `version`, `infrastructure: {namespace, chart, enableSecrets, replicas}`) | `definition.yaml` (no `version`, no `infrastructure`, has `chart:` block + `databases:`) + `definition.staging.yaml` + `definition.prod.yaml` |
| Gitops layout | `infra-apps@main:apps/<svc>/values.yaml` | `infra-apps@v2:domains/<domain>/<svc>/{definition,definition.<env>}.yaml` |
| Deploy workflow | `org-deploy.yaml@main` | `org-deploy-v2.yaml@main` |
| Prod promotion | n/a (single env) | `org-promote.yaml@main` (writes only `.version` to existing `definition.prod.yaml`) |
| Namespace | `infrastructure.namespace` (per-service) | `.domain` (domain-as-namespace) |
| Secrets | `infrastructure.enableSecrets` (toggleable) | always on |
| Image | `.image` top-level fallback | per-deployment `.image` (required) |

`org-deploy-v2` is **dual-dispatch**: every release simultaneously updates the v1 tree (`apps/<svc>/values.yaml` on `main`) and the v2 tree (`domains/<domain>/<svc>/` on `v2`). v1 ApplicationSets stay alive for retrocompat until they're explicitly retired.

## Pre-flight (decide BEFORE editing files)

Ask the user — don't guess:

1. **Domain.** Which domain in `infra-apps@v2/domains/` hosts the service? Current set: `argocd`, `crossplane-system`, `identity`, `istio-system`, `kafka`, `networking`, `observability`, `secrets`. The chart consumes `.domain` as the k8s namespace, so the domain must exist (or be created in the same migration).
2. **Per-deployment image.** Every entry in `deployments.{http,grpc}-services|workloads` must declare its own `image`. v2 chart removed the `.Values.image` top-level fallback. If a service relies on the fallback, you must edit each deployment entry.
3. **Databases.** If the service touches DynamoDB, collect both:
   - **Access levels** (`read`, `write`, `readWrite`) per table → service-side `databases:` block (Step 1, IAM only).
   - **Full table schemas** (hashKey, rangeKey, attributes, GSIs/LSIs, streams, kinesis destination) → infra-side `domains/<domain>/databases/definition.yaml` (Step 2, table provisioning).
   The historical source of truth for schemas is `decade-eng/infra:cmd/platform/main.go` (Pulumi `dynamodb.CreateDynamoTable` calls + the referenced Go/proto model with `dynamo:"...,hash"` / `index:"...,hash"` tags). Migrate every table the service owns out of Pulumi into the v2 `dynamo` chart.
4. **Secrets audit.** `grep -rn 'secretsManager\.GetSecret\|secrets\.SecretsManager\b' internal/`. The v2 chart loads `common-secrets` + `<svc>-secrets` via `envFrom: secretRef`, exposing every key as `SECRETS__<NAME>` env var. Any callsite reaching into Infisical-backed `SecretsManager.GetSecret(ns, key)` for runtime secrets must be flipped to `os.Getenv("SECRETS__<NAME>")` in Step 3. While auditing, also flag dead modules whose only purpose is to load a secret that's never consumed downstream (precedent: `users` removed `internal/components/crypto` in `2b1f379`).
5. **Verify v2 stack is live.** `infra-apps@v2/.github/workflows/register-app.yaml` (v2) and `github-actions/.github/workflows/{org-deploy-v2,org-promote}.yaml` must already be merged. (They were the v2-rollout PRs.)

## Step 1 — Reshape `definition.yaml`

Apply, in order:

- `apiVersion: v1` → `apiVersion: v2`
- Delete the top-level `version: X.Y.Z` line
- Delete the entire `infrastructure:` block
- Add `domain: <chosen-domain>` if absent
- Add the `chart:` block (always `bulkheads`+`infra-apps`+`v2` for service-style apps using the bulkheads chart):
  ```yaml
  chart:
    name: bulkheads
    repoURL: https://github.com/decade-eng/infra-apps
    targetRevision: v2
  ```
- Add a `databases:` block if applicable (top-level, sibling of `deployments`). **This is service-side IAM only** — actual table provisioning lives in Step 2:
  ```yaml
  databases:
    <table-name>:
      type: dynamo
      access: readWrite
  ```
- Verify each deployment entry has `image:` set (required under v2)

What stays unchanged: `name`, `description`, `runners`, `setup`, `authorization`, `artifacts`, `deployments` (chart consumes `.deployments.*` directly — same key, same shape).

## Step 2 — Provision DynamoDB tables (`infra-apps@v2/domains/<domain>/databases/`)

Skip this step if the service has no DynamoDB tables.

The v2 stack provisions DynamoDB through a separate `dynamo` chart (one ApplicationSet per domain), distinct from the per-service `bulkheads` chart. Tables for **all** services in a domain are co-located in `domains/<domain>/databases/`.

### 2.1 — Discover the schema

For each table the service uses:

1. Find its declaration in `decade-eng/infra:cmd/platform/main.go` (look for `dynamodb.CreateDynamoTable` with `TableName: "<table>"`). Note `EnableStreams`, `StreamViewType`, `KinesisStreamArn` if set.
2. Resolve the `Model:` reference to its Go struct or `.proto`. Extract:
   - The field tagged `dynamo:"<col>,hash"` → `hashKey`
   - Any `dynamo:"<col>,range"` → `rangeKey`
   - Every `index:"<name>,hash"` (and `,range`) → GSI definitions
   - The `type` of each key field (`S` for string/uuid/enum, `N` for numeric, `B` for bytes)
3. If the service has no IAM policy in `infra/cmd/platform/main.go` AND no `dynamodb.DynamoDBModule(...)` registration in its repo, it owns no tables — skip this step entirely (e.g. `email-client`).

### 2.2 — Author/extend `domains/<domain>/databases/definition.yaml`

If the file doesn't exist yet, create it with the chart block:

```yaml
chart:
  name: dynamo
  repoURL: https://github.com/decade-eng/infra-apps
  targetRevision: v2

tables:
  <table-name>:
    attributes:
      - name: hash_key
        type: S
      - name: <gsi-key-1>
        type: S
    hashKey: hash_key
    globalSecondaryIndexes:
      - name: <gsi-name-1>
        hashKey: <gsi-key-1>
        projectionType: ALL
```

If it already exists (another service in the same domain already migrated), append your tables under the existing `tables:` map. Don't duplicate or reorder existing entries.

Optional fields (only add when the legacy Pulumi declaration had them):
- `rangeKey: <col>` — composite primary key
- `streamEnabled: true` + `streamViewType: NEW_IMAGE|NEW_AND_OLD_IMAGES|...` — DynamoDB Streams
- `kinesisDestination: { streamName: <name> }` — Kinesis CDC fan-out
- GSI `rangeKey:` — composite GSI

Template: `templates/databases-definition.yaml`. Working precedent: `infra-apps@v2/domains/identity/databases/definition.yaml` (covers hashKey-only, hashKey+rangeKey, multiple GSIs, streams + kinesis).

### 2.3 — Create the env stub files

Same shape as service env files but typically empty (env-specific overrides are rare for tables):

```bash
touch domains/<domain>/databases/definition.staging.yaml
touch domains/<domain>/databases/definition.prod.yaml
```

Both files must exist for the dynamo ApplicationSet to reconcile, even when empty.

### 2.4 — Commit to `infra-apps@v2`

These changes go directly to `infra-apps@v2` (not the service repo). Open a separate PR against that repo, or fold into the same PR if you're touching `infra-apps@v2` already (e.g. for Step 5's domain bootstrap).

## Step 3 — Migrate secret reads from `SecretsManager` to env vars

The v2 `bulkheads` chart wires every container with:

```yaml
envFrom:
  - secretRef: { name: common-secrets }     # shared across the domain
  - secretRef: { name: <svc>-secrets }      # service-specific
```

So every k8s Secret key surfaces as a `SECRETS__<KEY>` env var inside the container (the `SECRETS__` prefix is the contract; nested keys use `__` as separator, e.g. `SECRETS__SENDGRID__API_KEY`). Services no longer authenticate to Infisical at startup — runtime secrets just read `os.Getenv`.

### 3.1 — Convert callsites

For each `secretsManager.GetSecret(ctx, "<ns>", "<path>/<KEY>")`:

```go
// Before (v1)
secret, err := secretsManager.GetSecret(ctx, "frontier-k8s", "common-secrets/SENDGRID_API_KEY")
apiKey := secret.Value

// After (v2)
const EnvSendgridAPIKey = "SECRETS__SENDGRID__API_KEY"  // export the constant for traceability
apiKey := os.Getenv(EnvSendgridAPIKey)
```

Drop the `lc.Append(fx.Hook{OnStart: loadSecrets})` boilerplate — env vars are already populated by the time `main()` runs.

If after conversion the service has **zero** remaining `SecretsManager` consumers, also delete `secrets.SecretsModule()` from `internal/app.go`. If even one consumer remains (PKI, KeyPairProvider, etc.), keep it.

### 3.2 — Update tests

Set the env vars in `TestMain` **before** `m.Run()` and **before** any fx container is built:

```go
func TestMain(m *testing.M) {
    if err := os.Setenv("SECRETS__TEMPORAL_ENCRYPTION_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="); err != nil {
        panic(err)
    }
    if err := os.Setenv("SECRETS__TEMPORAL_WORKERS_PRIVATE_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="); err != nil {
        panic(err)
    }
    code := m.Run()
    os.Exit(code)
}
```

Then prune the now-unused `secretsmock.MockSecretsModule(...)` block from your fx mock module. Common entries to delete when their consumers moved to env vars:
- `frontier-k8s/common-secrets/TEMPORAL_WORKERS_PRIVATE_KEY`
- `frontier-k8s/common-secrets/TEMPORAL_ENCRYPTION_KEY`
- `frontier-k8s/common-secrets/KAFKA_WORKERS_PRIVATE_KEY`

Also drop the `pki`/`kafka-pki` named-secrets-manager `fx.Decorate` blocks **only if** the corresponding production consumer is gone (notifications could drop them; users still needed them).

If you removed `secrets.SecretsModule()` from `internal/app.go`, also remove `secretsmock.MockSecretsModule(...)` and any manual `KeyPairProvider.AddKey(...)` invocations from tests — without `SecretsModule`, those mocks decorate a type the fx graph no longer constructs.

### 3.3 — Provisioning the actual k8s Secret

The chart only references `<svc>-secrets`; it doesn't author it. Provisioning happens out-of-band (typically via the secrets domain / `external-secrets` / Crossplane). Verify the secret exists in the target namespace **before** the first prod release, otherwise the deployment will fail with `CreateContainerConfigError: secret "<svc>-secrets" not found`.

### 3.4 — Sanity-check non-secret config

While editing config code, also rename any leftover flat `[sendgrid] sendgrid_api_key = ...` style keys to nested `[sendgrid] sandbox_mode = ...` (per email-client `5a3ec17`). The `SECRETS__` env-var convention uses `__` as separator and naturally maps to nested config; mixing flat config keys with nested env vars causes confusion later.

## Step 4 — Create env files

`definition.staging.yaml`:
```yaml
version: <current version, no 'v' prefix — e.g. 0.5.13>
environment: staging
```

`definition.prod.yaml`:
```yaml
version: <same version as staging at onboarding>
environment: prod
```

**Both files MUST exist before the first `Promote` workflow run.** `org-promote` deliberately refuses to author the prod file from scratch (preserves any prod-specific overrides the engineer adds later — replicas, resources, etc.).

Templates: see `templates/definition.staging.yaml` and `templates/definition.prod.yaml`.

## Step 5 — Update `.github/workflows/`

Three changes to the workflows directory:

1. **Switch `deploy.yaml`** — one line:
   ```yaml
   uses: decade-eng/github-actions/.github/workflows/org-deploy-v2.yaml@main
   ```
   (was `org-deploy.yaml@main`)

2. **Add `promote.yaml`** — use the template at `templates/promote.yaml`. Triggered by `workflow_dispatch` (typically by an argo-rollouts canary→stable webhook, but also runnable manually).

3. **Delete `preview.yaml` and `delete-preview.yaml`** — these reference `org-preview.yaml` / `org-delete-preview.yaml`, which the v2 pipeline no longer ships. Per-PR sandbox previews are not part of the v2 model. Remove both files outright:
   ```bash
   git rm .github/workflows/preview.yaml .github/workflows/delete-preview.yaml
   ```
   If either is missing in the service repo, skip silently — some services were created after the previews were already retired.

What stays unchanged: `pr.yaml`, `bump-dependency.yaml`, `claude.yml` / `claude-code-review.yml`, and any other repo-specific automation (e.g. release-drafter).

## Step 6 — Mark generated files in `.gitattributes`

Drop in the template at `templates/gitattributes` as `.gitattributes` at the repo root. It tags buf-generated code, generated SDK trees, embedded swagger bundles, and lockfiles with `linguist-generated=true` so GitHub:
- collapses them in PR diffs by default (still expandable),
- excludes them from the repo's language statistics.

```bash
cp /path/to/skill/templates/gitattributes .gitattributes
```

The template is byte-identical to `decade-eng/party:.gitattributes` — that's the working precedent. If in doubt, diff against party's file.

The template uses broad folder patterns (`packages/**`, `clients/**`, `pkg/**`, `static/**`) followed by hand-written exceptions at the bottom (gitattributes resolution: later wins). Audit those exceptions for your repo:

- `packages/**/db/**` — hand-written DynamoDB structs with `dynamo:` tags. Keep visible (this is your schema source of truth — the file we read in Step 2.1).
- `static/static_assets.go` — hand-written `//go:embed` wrapper. Keep visible.
- `packages/**/{package.json,tsconfig.json,README.md}`, `clients/**/{...}` — hand-written SDK metadata.

If your repo has additional hand-written files inside an otherwise-generated tree (e.g. a hand-rolled enum mapping next to `.pb.go` files), append more `linguist-generated=false` overrides at the bottom. Verify by browsing one of your largest generated files on a feature branch in GitHub — it should appear collapsed in the diff.

## Step 7 — Validate locally

```bash
yajsv -s /path/to/github-actions/schema/definition.schema.json definition.yaml
```

Expected: `definition.yaml: pass`. If yajsv isn't installed:
```bash
curl -sSL https://github.com/neilpa/yajsv/releases/download/v1.4.1/yajsv.darwin.arm64 -o /tmp/yajsv && chmod +x /tmp/yajsv
```
(or `yajsv.linux.amd64` / `yajsv.darwin.amd64`).

If validation fails, the PR's `parse` job will fail with the same error — fix locally first.

## Step 8 — Open PR(s)

Two PRs typically:

1. **Service repo** — single feature branch off `main`. PR body should list:
   - The `definition.yaml` changes (apiVersion, version removed, infrastructure removed, chart, domain, databases)
   - The two new env files
   - Workflow changes: `deploy.yaml` switch + `promote.yaml` added + `preview.yaml`/`delete-preview.yaml` deleted
   - `.gitattributes` added (collapses generated code in PR diffs)
   - The secrets-to-env-vars conversion (Step 3) with a list of converted keys
   - `yajsv pass` confirmation + `go test ./...` green
   - The domain choice rationale

2. **`infra-apps@v2`** (only if Step 2 ran or domain didn't exist) — adds `domains/<domain>/databases/{definition,definition.staging,definition.prod}.yaml` and/or `domains/<domain>/values.yaml`. **Merge this first** so the dynamo ApplicationSet provisions tables before the service deploys and tries to read/write them.

The service-repo migration PR is a normal release PR — give it a `patch` label so the merge fires the v2 deploy and seeds gitops with the first v2 entry. The v1 retrocompat dispatch will simultaneously refresh `apps/<svc>/values.yaml` on `infra-apps@main`.

## What happens on merge

1. `org-deploy-v2`'s `parse` job validates the v2 layout (fails if `definition.staging.yaml` is missing).
2. `version-bump` action runs against `definition.staging.yaml` (not `definition.yaml`!).
3. Tag `vX.Y.Z` created, artifacts built.
4. `sync-infrastructure` step **dual-dispatches** `register-app`:
   - `infra-apps@v2` → writes `domains/<domain>/<svc>/{definition.yaml, definition.staging.yaml}` verbatim.
   - `infra-apps@main` → writes synthesized v1 `values.yaml` + `values.staging.yaml` (namespace hardcoded to `apps`, `bulkheads:` ← `.deployments`, `chart:` ← `.chart.name`, etc.).
5. Both ApplicationSets reconcile to the new version.

After staging canary→stable in argo-rollouts, the `Promote` workflow:
1. Reads `.version` from `definition.staging.yaml`.
2. Sets `.version` (only) on the existing `definition.prod.yaml` via `yq eval -i`.
3. Commits `Promote <name> to prod at vX.Y.Z [skip ci]` (the `[skip ci]` prevents re-triggering deploy).
4. Dispatches `register-app(env=prod)` with only the prod env file (base `definition.yaml` unchanged).

## Common pitfalls

1. **Forgetting to switch `deploy.yaml`.** v1 + v2 service shape is incompatible — v1's `version-bump` defaults to `definition.yaml`, won't find `.version`, falls back to artifact files (package.json/config.toml), bumps that version, and writes it BACK into `definition.yaml`. Result: schema-invalid file, untouched staging. github-actions/main has a defensive guard (in v1 `org-deploy.yaml`) that aborts the run with an `::error::` annotation when `apiVersion: v2` is detected — but it's still better not to trigger it.

2. **Top-level `image` removed without per-deployment image set.** Helm rendering fails with empty image. Always check every entry in `deployments.{http,grpc}-services|workloads`.

3. **Authoring only `definition.staging.yaml`.** First `Promote` run fails because `definition.prod.yaml` is required to exist (org-promote won't fabricate it). Always commit both at onboarding.

4. **Bootstrap-by-copy temptation.** Never `cat > definition.prod.yaml <<EOF ... EOF` and never `yq eval '.environment = "prod"' definition.staging.yaml > definition.prod.yaml`. Both overwrite the whole file and would clobber prod-specific overrides on subsequent runs. The contract: each env file is owned by its workflow (org-deploy-v2 for staging, org-promote for prod) and only that workflow writes it. `register-app` itself never bootstraps either env file.

5. **Domain doesn't exist in `infra-apps@v2`.** If you're putting a service into a not-yet-created domain, also commit `domains/<domain>/values.yaml` to `infra-apps@v2`:
   ```yaml
   name: "<domain>"
   namespace: "<domain>"
   ```
   (optional `additionalNamespaces:` if needed). Without it, the parent `prod.yaml` ApplicationSet has nothing to expand into a domain ApplicationSet, and the service won't be picked up.

6. **Bumping the wrong file.** `org-deploy-v2` passes `definition-path: definition.staging.yaml` to the existing `version-bump` action (the action already accepts that input — no code change in github-actions needed). If for some reason version-bump bumps `definition.yaml` instead, the `deploy.yaml` switch was missed.

7. **Service deploys before its tables exist.** If you add a service-side `databases:` block but forget to provision the table in `domains/<domain>/databases/`, the IAM policy points at a table that doesn't exist and the service fails on first DynamoDB call. Always merge the `infra-apps@v2` databases PR (Step 2) before — or at the same time as — the service migration PR.

8. **Conflating Pulumi-source tables with v2 tables.** While `infra-apps@v2/domains/<domain>/databases/` is taking ownership, the legacy Pulumi declaration in `decade-eng/infra:cmd/platform/main.go` is still active. Don't delete it in the same PR — that's a separate cutover (the new dynamo chart must successfully reconcile and adopt the existing table first; teardown of the Pulumi declaration comes later, ideally in a follow-up PR).

9. **Missing `index:` tag on the model.** If a Go struct has a field intended as a GSI but only `dynamo:"col"` (no `index:"name,hash"`), the legacy Pulumi run never created the GSI. Don't invent GSIs in the v2 definition that didn't exist in production — match what's actually deployed. Cross-check by inspecting the live table in AWS if in doubt.

10. **`os.Setenv` after fx container build.** Setting `SECRETS__*` env vars *inside* a test (after `app.New(...)` has already constructed the app) is a no-op for the already-resolved deps. Always seed in `TestMain` before `m.Run()`. Same applies to `init()` functions in test files — those can race with package-level fx wiring.

11. **Removing `SecretsModule()` while a consumer still wired.** If you delete `secrets.SecretsModule()` from `internal/app.go` but some module still depends on `secrets.SecretsManager` (PKI, KeyPairProvider, named manager), fx fails at startup with `missing type: secrets.SecretsManager`. Audit `grep -rn 'secrets\.SecretsManager\|secrets\.KeyPairProvider' internal/` first — `users` kept `SecretsModule()` for exactly this reason while still migrating other secrets to env vars.

12. **`<svc>-secrets` k8s Secret missing in the target namespace.** Pod fails to start with `CreateContainerConfigError: secret "<svc>-secrets" not found`. The chart references but doesn't author the secret — provisioning is out-of-band. First prod deploy is the moment to verify it exists.

13. **Inconsistent `__` vs `_` in env var names.** The `SECRETS__` contract uses double underscore as nesting separator. `SECRETS__SENDGRID__API_KEY` (good) vs `SECRETS_SENDGRID_API_KEY` (broken — single underscore is a literal part of one segment). When converting Infisical key paths like `common-secrets/SENDGRID_API_KEY`, prefer `SECRETS__SENDGRID__API_KEY` for nested config. When the legacy key is flat (`TEMPORAL_ENCRYPTION_KEY`), keep it flat: `SECRETS__TEMPORAL_ENCRYPTION_KEY`.

## File templates

See:
- `templates/definition.staging.yaml`
- `templates/definition.prod.yaml`
- `templates/promote.yaml`
- `templates/domain-values.yaml` (only when the domain doesn't exist yet)
- `templates/databases-definition.yaml` (only when the service owns DynamoDB tables — see Step 2)
- `templates/gitattributes` (drop at repo root as `.gitattributes` — see Step 6)

## Reference: precedents

The exact same flow shipped for these services:
- `decade-eng/users` (domain: `identity`) — full migration including DynamoDB tables (`users`, `credentials`, `clients`, `settings`, `sessions`, `user-verification-codes`). Kept `secrets.SecretsModule()` because PKI/UserKeys still consumed via `SecretsManager`. See commit `2b1f379` for the dead-code removal pattern (`internal/components/crypto`).
- `decade-eng/codec-server` (domain: `secrets`).
- `decade-eng/notifications` (domain: `communications`) — single-table migration (`notifications`, hashKey + 2 GSIs). Cleanest example of full Step 3 (env-var secrets): commit `1e041e9` removes `SecretsModule()` from `internal/app.go`, replaces `secretsmock.MockSecretsModule(...)` with `os.Setenv` in `test/helpers_test.go`, drops PKI fx decorators.
- `decade-eng/email-client` (domain: `communications`) — Step 3 split across commits `bae5971` (temporal secrets → env vars) and `5a3ec17` (sendgrid API key → `SECRETS__SENDGRID__API_KEY`, plus `[sendgrid]` config rename).
- `decade-eng/party` (domain: `identity`) — first service to ship `.gitattributes` (Step 6). The template at `templates/gitattributes` is a verbatim copy of `party/.gitattributes`; treat that file as the canonical reference for which paths are generated vs hand-written.

Read either service repo's `definition.yaml` + env files + workflows for a working service-side example.
Read `infra-apps@v2/domains/identity/databases/definition.yaml` for a working tables example covering hashKey-only, hashKey+rangeKey, multiple GSIs, streams + kinesis.
Read `infra-apps@v2/charts/bulkheads/templates/workload/deployment.yaml` (and the `http-service` / `grpc-service` rollouts) to confirm the `envFrom: { secretRef: common-secrets, <svc>-secrets }` contract Step 3 relies on.
