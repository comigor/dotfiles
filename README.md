# comigor's dotfiles

Managed with [chezmoi](https://chezmoi.io/). Secrets via [Bitwarden](https://bitwarden.com/).

## Quick start

On a fresh machine:

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply comigor
```

This installs chezmoi, clones this repo, prompts for your name/email/GPG key/repo path, and applies everything.

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
| Secrets | `.secrets`, `.frontierrc` (via Bitwarden) |
| Other | `.curlrc`, `.wgetrc`, `.inputrc`, `.screenrc`, `.editorconfig`, `.hushlogin`, `.Xmodmap`, `.tool-versions` |

## How it works

Most files are **symlinked** from `$HOME` back into this repo, so edits in either place are reflected immediately. Only files that need per-machine differences use chezmoi templates (copied, not symlinked):

| Type | Files | Edit workflow |
|---|---|---|
| Symlinks | aliases, exports, zshrc, zprofile, all `.config/*`, gitignore, gitattributes, etc. | Edit anywhere |
| Templates | `.gitconfig`, `.extra`, `.functions` | Edit in `home/`, run `chezmoi apply` |
| Secrets | `.secrets`, `.frontierrc` | Stored in Bitwarden, pulled at apply time |

## Secrets (Bitwarden)

```bash
bw login
export BW_SESSION=$(bw unlock --raw)
chezmoi apply
```

Secrets are stored as Bitwarden Secure Notes named `dotfiles/secrets` and `dotfiles/frontierrc`.

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
  private_dot_frontierrc.tmpl # -> ~/.frontierrc (Bitwarden)
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
