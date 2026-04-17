# Igor's dotfiles

![Screenshot of my shell prompt](https://i.imgur.com/EkEtphC.png)

Managed with [chezmoi](https://chezmoi.io/).

## Quick start

On a fresh machine:

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply comigor
```

This installs chezmoi, clones this repo, prompts for your name/email/GPG key, and applies everything.

## Updating

```bash
chezmoi update
```

## What's managed

| Category | Files |
|---|---|
| Shell | `.zshrc`, `.zprofile`, `.aliases`, `.functions`, `.exports`, `.extra` |
| Git | `.gitconfig` (templated), `.gitignore`, `.gitattributes` |
| Terminals | Ghostty, Kitty |
| Editors | Zed |
| Tools | mise, pypoetry, karabiner (macOS), GPG agent (macOS) |
| Secrets | `.secrets`, `.frontierrc` (via Bitwarden) |
| Other | `.curlrc`, `.wgetrc`, `.inputrc`, `.screenrc`, `.editorconfig`, `.hushlogin`, `.Xmodmap`, `.tool-versions` |

## OS support

Templates handle differences between macOS, Linux, Codespaces, and WSL. Files that only apply to one OS are excluded via `.chezmoiignore`.

## Secrets (Bitwarden)

Secret files (`.secrets`, `.frontierrc`) are stored as Bitwarden Secure Notes and pulled at apply time.

Setup:
```bash
bw login
export BW_SESSION=$(bw unlock --raw)
chezmoi apply
```

Store your secrets in Bitwarden items named `dotfiles/secrets` and `dotfiles/frontierrc`, then edit the templates in `home/private_dot_secrets.tmpl` and `home/private_dot_frontierrc.tmpl` to reference them.

## Bootstrap scripts

chezmoi runs these automatically on first apply (in order):

| Script | What it does |
|---|---|
| `00-install-packages-darwin` | Homebrew + core packages (macOS) |
| `01-install-packages-linux` | apt + core packages (Linux) |
| `02-install-oh-my-zsh` | oh-my-zsh |
| `03-install-spaceship-theme` | Spaceship prompt theme |
| `04-install-mise` | mise + language runtimes |
| `05-install-docker-linux` | Docker (Linux) |
| `06-install-python` | uv (Python installer) |

## Common commands

```bash
chezmoi diff              # preview changes before applying
chezmoi apply             # apply changes to $HOME
chezmoi edit ~/.zshrc     # edit a managed file
chezmoi add ~/.some-file  # start managing a new file
chezmoi cd                # cd into the source directory
chezmoi git status        # run git in the source dir
```

## Repository structure

```
.
├── .chezmoiroot              # points chezmoi at home/
├── home/
│   ├── .chezmoi.toml.tmpl    # chezmoi config (prompts for name/email/gpg)
│   ├── .chezmoiignore        # OS-specific file exclusions
│   ├── .chezmoiscripts/      # run_once install scripts
│   ├── dot_zshrc             # -> ~/.zshrc
│   ├── dot_zprofile          # -> ~/.zprofile
│   ├── dot_aliases           # -> ~/.aliases
│   ├── dot_exports           # -> ~/.exports
│   ├── dot_extra.tmpl        # -> ~/.extra (templated for OS)
│   ├── dot_functions.tmpl    # -> ~/.functions (templated for OS)
│   ├── dot_gitconfig.tmpl    # -> ~/.gitconfig (templated)
│   ├── dot_config/           # -> ~/.config/*
│   ├── private_dot_secrets.tmpl    # -> ~/.secrets (Bitwarden)
│   └── private_dot_frontierrc.tmpl # -> ~/.frontierrc (Bitwarden)
├── brew.sh                   # legacy Homebrew script (reference only)
├── dell.sh                   # legacy Dell/Ubuntu script (reference only)
└── bootstrap.sh              # legacy bootstrap (replaced by chezmoi)
```

## Originally based on

[Mathias Bynens' dotfiles](https://github.com/mathiasbynens/dotfiles), heavily customized over the years.
