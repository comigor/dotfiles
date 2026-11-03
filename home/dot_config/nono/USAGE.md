# Using nono here

nono 0.81.0, macOS Seatbelt. Profiles and the launchers are chezmoi-managed;
see `POLICY.md` beside this file for the policy decisions themselves.

## Every day

    cd ~/Projects/infra
    pi-nono                       # Pi-Bolt inside the sandbox

Workdir is read-write, `~/Projects` is read-write, so a second repo can be
opened later in the session without restarting. Everything else under `$HOME`
is denied: `~/.ssh` private keys, keychains, browser data, other repos, dotfiles.

    pi-nono-gh                    # same sandbox + gh (see "gh" below)

Any pi-bolt flag passes through: `pi-nono -c`, `pi-nono --model …`.

## One command, sandboxed

    nono run --profile pi-local --allow-cwd -- make test
    nono run --profile pi-local --allow-cwd --read ~/some/ref -- grep -r TODO .
    nono wrap --profile pi-local --allow-cwd -- ./build.sh   # no supervisor process

`--allow-cwd` is needed because non-interactive runs refuse to assume the
workdir; interactive `nono run` asks instead.

An interactive shell in the same sandbox:

    nono shell --profile pi-local --allow-cwd

## Long runs: detach and come back

    nono run --detached --name migrate --profile pi-local --allow-cwd -- pi-bolt
    nono ps                       # list sessions
    nono attach migrate           # or the session id
    # Ctrl-] then d to detach without stopping it
    nono inspect migrate          # pids, profile, workdir, rollback id, tool counts
    nono logs migrate
    nono stop migrate             # clean shutdown of the supervisor

Detaching does not pause anything. A session that hits an approval boundary
waits for an attached operator instead of auto-granting.

## "Why can't it read this?"

From inside the sandbox (the agent can do this itself):

    nono why --self --path "$HOME/.kube/config" --op read
    cat "$NONO_CAP_FILE"          # the capability manifest in force

From outside, before launching:

    nono why --profile pi-local --path ~/.kube/config --op read
    nono profile show pi-local    # fully resolved profile (repeat -v for more)
    nono profile diff pi-local pi-local-gh

## A new binary is blocked

    pi-nono-learn -- <command>            # what was denied, sorted into buckets
    pi-nono-learn --apply -- <command>    # write the safe ones into pi-local-grants.json

Run it in a normal shell: from inside the sandbox the profiles directory is
read-only by design, so it writes a draft to `~/.config/nono/profile-drafts/`
instead and tells you to `nono profile promote` it. Two or three rounds is
normal — a binary that cannot start never reaches the config file it would be
denied next.

## Profiles

    nono profile list                     # built-in, pack and user profiles
    nono profile groups                   # 29 policy groups (deny_credentials, node_runtime, …)
    nono profile init my-agent --extends pi-local
    nono profile validate my-agent
    nono profile promote <draft>          # apply a draft from profile-drafts/

Layering here: `nolabs-ai/pi` → `pi-local-grants` (learned) → `pi-local` → `pi-local-gh`.
Arrays merge additively across `extends`, so a learned line never clobbers a
hand-written one.

## Network

Allowed by default. Scope it per run:

    nono run --profile pi-local --allow-cwd --allow-domain api.github.com -- gh api /user
    nono run --profile pi-local --allow-cwd --block-net -- make test

Then there is the supervised proxy, which enforces domain allowlists and can
inject credentials (`--credential github`). `pi-local-gh` is the worked example:
the host `gh` reads the token, the proxy swaps it in, the sandbox only sees a
phantom. `gh` is a Go binary, so the proxy CA has to be trusted per session —
that is what `--trust-proxy-ca` does, and why it lives in its own launcher.

## Credentials, in order of preference

1. Proxy route with `cmd://` capture — token never enters the sandbox.
       `credential_capture: { github: { command: ["/opt/homebrew/bin/gh","auth","token"] } }`
2. Agent socket — ssh and gpg are already wired this way in `pi-local`.
3. `env_credentials` from the system keystore, `op://` (1Password),
   `bw://` (Bitwarden), `apple-password://` (Apple Passwords).
4. A plain `filesystem.read` grant — only for things you accept the agent holding.

## Audit and undo

    nono audit list                       # every sandboxed command, by directory
    nono audit show <id> --json
    nono audit verify <id>                # recompute the hash chain
    nono rollback list | show <id> --diff | restore <id> --dry-run | restore <id>

**Rollback does not work with the workspace-root grant.** It tracks every
writable path, and `~/Projects` is over its 2 GiB budget:

    nono: Snapshot error: Rollback budget exceeded: 2147818389 bytes tracked (limit: 2147483648 bytes)

and the command then does not run at all. Use git for undo in these sessions; if
you want nono's snapshots, launch a scoped session without the `~/Projects`
grant (for example `nono run --profile nolabs-ai/pi --allow-cwd -- pi-bolt`).

## Packs

    nono search pi
    nono pull nolabs-ai/pi                 # already installed; provides the pi profile + skill
    nono list
    nono update

## Do not

- Do not `colima delete` to apply the narrowed mounts: that destroys the VM
  disk and every docker image and volume. Two stop/starts is the whole trick.
- Do not grant nono's own state (`~/.config/nono`, `~/.local/state/nono`): it
  holds the audit log and the policy. `pi-nono-learn` refuses those by design.
- Do not retry a denied call expecting it to work; there is no approval path
  from inside the sandbox on macOS.
