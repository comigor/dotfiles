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
  shell/                # aliases, exports, zprofile, zshrc
  git/                  # gitignore, gitattributes
  gnupg/
  zed/
  ...
```

## Originally based on

[Mathias Bynens' dotfiles](https://github.com/mathiasbynens/dotfiles), heavily customized over the years.
