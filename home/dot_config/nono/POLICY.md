# Sandbox policy for Pi (nono)

Every new binary that hits the sandbox is a policy question, not a bug. The
sandbox is a file, so the fix is always one line — the work is deciding *which*
line, and whether what the tool wants is a secret.

## The loop

    pi-nono-learn -- <command>          # dry run: what was denied, sorted
    pi-nono-learn --apply -- <command>  # write the safe ones
    pi-nono                             # carry on

`pi-nono-learn` runs the command under the sandbox, reads nono's diagnostic
footer (and the tool's own "Operation not permitted" messages when the footer
misses one), sorts every denied path, and writes only the safe bucket into
`pi-local-grants.json`, which `pi-local` extends.

Expect **two or three rounds** for a new tool: a binary that cannot start never
reaches the config file it would have been denied next.

## The four kinds of "wants"

| The tool wants | Grant | Never |
|---|---|---|
| a toolchain, runtime, cache or its own state dir | `filesystem.read` | — |
| a secret file (token, key, kubeconfig, cloud creds) | a **broker**, see below | `filesystem.read` by reflex |
| a socket to a running agent (ssh, gpg, docker, 1Password) | `filesystem.unix_socket` | the key material behind it |
| a host on the network | `network.allow_domain` | opening the network |

## Brokers: get the capability without the credential

| Need | Broker |
|---|---|
| an HTTP API with a token | `credential_capture` `cmd://<tool> auth token` + a `custom_credentials` route — the host CLI reads the token, the proxy injects it, the sandbox only ever sees a phantom. `pi-local-gh` is the worked example. |
| AWS APIs | `network.custom_credentials` + `aws_auth`: the proxy signs SigV4 on the host; no AWS key in the box. |
| an env var only | `env_credentials` from the system keystore, `op://`, `bw://`, `apple-password://`. |
| ssh / gpg / docker | `unix_socket` on the agent socket; the private key stays outside (already set up for ssh and gpg in `pi-local`). |

## The buckets `pi-nono-learn` uses

- **safe** — toolchain, runtime, cache, tool state (`~/.local/share/mise`,
  `~/.cache`, `~/bin`, `~/.pub-cache`, …). Applied by `--apply`.
- **review** — unknown paths. Printed, applied only with `--include-review`.
- **secret** — kubeconfig, cloud creds, keychains, ssh/gpg private material,
  gh/rbw/1Password state. Applied only with `--include-secrets`, and only
  after reading the broker note printed beside each one.
- **restricted** — paths nono permanently denies (`deny_credentials`). Never
  written automatically: they need `filesystem.bypass_protection` and a
  deliberate decision.

## Profiles

| Profile | What it is |
|---|---|
| `nolabs-ai/pi` | upstream pack: `~/.pi`, `~/.agents/skills`, runtimes, git config |
| `pi-local` | the daily driver: workdir + `~/Projects` rw, pi-bolt install, ssh/gpg signing material, extends `pi-local-grants` |
| `pi-local-grants` | **learned grants** — the file `pi-nono-learn` writes |
| `pi-local-gh` | `pi-local` + the github credential route (run via `pi-nono-gh`, which adds `--trust-proxy-ca`) |

`$HOME/Projects` is granted as a whole on purpose: a session that starts in one
repo can open another one under it later without restarting, because Seatbelt
cannot widen a running sandbox.

Check any single path without running anything:

    nono why --profile pi-local --path ~/.kube/config --op read
