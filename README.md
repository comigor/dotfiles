# comigor's dotfiles

Managed with [chezmoi](https://chezmoi.io/). Secrets via [Bitwarden](https://bitwarden.com/).

## Install

Fresh machine:

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply comigor
exec zsh -l
```

Existing checkout, including WSL repair:

```bash
chezmoi init --source . --apply --promptDefaults && exec zsh -l
```

This installs chezmoi, clones or uses this repo, writes shell symlinks, runs bootstrap scripts, and starts zsh. Secret-backed files are opt-in so a fresh shell does not need Bitwarden first.

## Updating

```bash
chezmoi update
```

## What's managed

| Category | What |
|---|---|
| Shell | zsh, oh-my-zsh, spaceship prompt, aliases, functions, exports |
| Git | `.gitconfig` (templated per OS), `.gitignore`, `.gitattributes` |
| Terminal | Ghostty |
| Editor | Zed |
| AI agents | Pi-Bolt (`pi-bolt`) sharing Pi's `~/.pi/agent`; custom Pi Inbox relay extension with central Plannotator UI, installed per machine |
| Tools | mise, opencode, karabiner (macOS), GPG agent (macOS) |
| Secrets | Base/staging files and ephemeral prod/admin profiles via fnox + Bitwarden |
| Other | `.curlrc`, `.wgetrc`, `.inputrc`, `.screenrc`, `.editorconfig`, `.hushlogin`, `.Xmodmap`, `.tool-versions` |

## How it works

Most files are **symlinked** from `$HOME` back into this repo, so edits in either place are reflected immediately. Only files that need per-machine differences use chezmoi templates (copied, not symlinked):

| Type | Files | Edit workflow |
|---|---|---|
| Symlinks | aliases, exports, zshrc, zprofile, all `.config/*`, gitignore, gitattributes, etc. | Edit anywhere |
| Templates | `.gitconfig`, `.extra`, `.functions` | Edit in `home/`, run `chezmoi apply` |
| Secrets | `.secrets`, `.staging.secrets` | Bitwarden hidden fields, rendered by fnox at apply time |

## AI agents (Pi-Bolt)

[Pi-Bolt](https://github.com/opensec-git/Pi-Bolt) is Pi with an ahead-of-time
compiled executable. It uses Pi's agent directory, so `~/.pi/agent` is symlinked
to [`configs/pi/`](configs/pi) and holds the shared `settings.json`, `models.json`
and `keybindings.json`. Only those files are tracked; auth, sessions, model
cache, npm packages and git checkouts stay machine-local via the directory's
`.gitignore`.

Pi-Bolt-only packages live under `piBolt.packages` with `packagesOverlay: true`,
so a stock `pi` sharing the same directory neither installs nor loads them. The
OpenSec extensions ([opensec-pi-subagents](https://www.npmjs.com/package/opensec-pi-subagents),
[opensec-pi-todo](https://www.npmjs.com/package/opensec-pi-todo),
[opensec-pi-fff](https://www.npmjs.com/package/opensec-pi-fff)) replace the
upstream `pi-subagents` package and are pinned there. `run_once_after_09`
installs Pi-Bolt with `PIBOLT_EXTENSIONS=no`; `run_onchange_after_61` reconciles
the declared packages whenever `settings.json` changes.

Pi-Bolt installs the **JIT variant** for the platform (the install script picks
`arm64-jit` or `x64-jit` and reinstalls if the current build is JIT-off), so
heavy run-time extensions like `pi-lens` and `pi-fff` run fast; `pi-bolt update`
keeps the variant. PiG and omp remain as options: `PIG_USE_PI_DIRS` points PiG at
this shared directory (its old `configs/pig` tree was removed), and the
`configs/omp` symlinks remain. The jev-guard plugin and its bootstrap were
removed, as was the omp-memory dream LaunchAgent (`~/.omp-memory` data is left
in place).

**omp-memory** (long-term memory: observes turns, dreams them into preferences,
principles, project pages and skills, recalls them each session) runs in Pi-Bolt
from a checkout of `decade-eng/omp-extensions` in `~/Projects`.
[`configs/pi/packages/omp-memory`](configs/pi/packages/omp-memory) is a local
package under `piBolt.packages` that sets its environment (store
`~/.omp-memory`, shared with omp; GLM-5.3-Flash on Modal) and loads it. Use
`/recall status`, `/recall dream`, `/recall questions`. `pi-local-grants` lets
the nono sandbox write the store.

## Secrets (fnox + Bitwarden)

```bash
eval "$(mise activate bash)"
eval "$(mise hook-env -s bash)"
bw login --quiet
bw sync --nointeraction
bwunlock
DOTFILES_APPLY_SECRETS=1 chezmoi apply
bw lock --quiet
unset BW_SESSION
```

`bwunlock` uses the existing `pinentry-rbw-macos` authentication prompt and exports a session in the current shell. The master password reaches `bw` through stdin. Run it again after screen lock invalidates the session.

`configs/envbox/fnox.toml` maps environment variables to hidden fields on the existing Bitwarden items, using UUIDs. Profiles are `base`, `staging`, `staging-admin` (inherits staging), `prod`, and `prod-admin` (inherits prod). Required fields fail closed; daemon caching is disabled by the loader. Keycloak aliases reference the same fields as their Skycloak counterparts.

`staging-admin` adds `ZED_ENDPOINT` and `ZED_TOKEN` from the hidden fields on `dotfiles/staging-admin-secrets`; regular staging does not receive them.

Base and staging profiles are rendered into private `~/.secrets` and `~/.staging.secrets` files by chezmoi. Privileged profiles are resolved at entry, in memory:

```sh
envbox prod
envbox prod-admin
envbox staging-admin
exit
```

Prod/admin entry requires fresh authentication; admin entry also requires typing its name. Fnox injects the selected profile into the child shell. Other tier variables and inherited AWS credential overrides are cleared; shell startup does not reload staging over privileged values. AWS/Kubernetes config files remain sandboxed copies. The child shell receives no `BW_SESSION`/`FNOX_BW_SESSION`. `envbox staging` remains ungated and reads the rendered staging file.

There are no persistent prod/admin secret files: `.chezmoiremove` removes the obsolete files. The screen-lock watcher locks `bw` and the retained `rbw` SSH agent, but cannot erase secrets already loaded into a running shell or base/staging files.

**Accepted limitation:** fnox 1.35.2's native Bitwarden provider passes the vault session as `bw --session ...`, exposing it to local process inspection during resolution. Envbox is environment scoping, not an OS or per-tier vault authorization sandbox.

The helper's [security model](https://github.com/pppobear/pinentry-rbw-macos#security-model) uses application-enforced macOS authentication, not a Keychain `.userPresence` access control. It is not protection against malicious code already running as the same user.

## OS support

Templates handle differences between macOS, Linux, Codespaces, and WSL. OS-only files are excluded via `.chezmoiignore`.

## Bootstrap scripts

Run automatically on first `chezmoi apply`:

| Script | What |
|---|---|
| `00` | Homebrew + core packages (macOS) |
| `01` | apt + core packages (Linux) |
| `02` | oh-my-zsh |
| `03` | Spaceship prompt theme |
| `04` | mise + language runtimes |
| `05` | Docker (Linux) |
| `06` | uv (Python) |
| `09` | Pi-Bolt JIT build (`PIBOLT_EXTENSIONS=no`; packages are declared in `configs/pi/settings.json`) |
| `10` | Plannotator (local plan review + Inbox) |
| `11` | Enable Plannotator's Pi Inbox tool and start the Inbox once |
| `61` | Reconcile Pi-Bolt packages (`run_onchange`, reruns when `settings.json` changes) |

## Common commands

```bash
chezmoi diff              # preview changes
chezmoi apply             # apply to $HOME
chezmoi cd                # cd into source dir
chezmoi managed           # list all managed files
```

## Repository structure

```
.chezmoiroot            # tells chezmoi source is in home/
home/
  .chezmoi.toml.tmpl    # config: prompts for name/email/gpg/repo path
  .chezmoiignore        # OS-specific exclusions
  .chezmoiscripts/      # run_once install scripts
  dot_extra.tmpl        # -> ~/.extra (templated)
  dot_functions.tmpl    # -> ~/.functions (templated)
  dot_gitconfig.tmpl    # -> ~/.gitconfig (templated)
  symlink_dot_*         # -> ~/.<file> (symlinks to configs/)
  dot_config/
    symlink_*           # -> ~/.config/<dir> (symlinks to configs/)
  dot_gnupg/
    symlink_*           # -> ~/.gnupg/gpg-agent.conf (symlink)
  private_dot_secrets.tmpl    # -> ~/.secrets (Bitwarden)
  private_dot_frontierrc.tmpl # -> ~/.frontierrc (macOS cosmo shell integration; skipped on WSL)
configs/                # actual config file contents (symlink targets)
  ghostty/
  karabiner/
  mise/
  opencode/
  pi/                   # ~/.pi/agent: settings, models, keybindings (Pi-Bolt)
  shell/                # aliases, exports, zprofile, zshrc
  git/                  # gitignore, gitattributes
  gnupg/
  zed/
  ...
```

## Originally based on

[Mathias Bynens' dotfiles](https://github.com/mathiasbynens/dotfiles), heavily customized over the years.
