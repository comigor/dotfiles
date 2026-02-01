# ============================================================================
# Performance: Set these BEFORE oh-my-zsh loads
# ============================================================================
DISABLE_AUTO_UPDATE="true"
DISABLE_MAGIC_FUNCTIONS="true"
ZSH_DISABLE_COMPFIX="true"  # Skip compaudit security check

export ZSH=$HOME/.oh-my-zsh
ZSH_THEME="spaceship"

# Spaceship: only enable sections you actually use
SPACESHIP_PROMPT_ORDER=(
  time          # Time stamps
  user          # Username
  dir           # Current directory
  host          # Hostname
  git           # Git branch and status
  node          # Node.js version (comment out if not needed)
  exec_time     # Execution time of last command
  line_sep      # Line break
  jobs          # Background jobs
  exit_code     # Exit code of last command
  char          # Prompt character
)
SPACESHIP_RPROMPT_ORDER=()  # Disable right prompt entirely
SPACESHIP_TIME_SHOW=true
SPACESHIP_DIR_TRUNC_REPO=false
SPACESHIP_PROMPT_ASYNC=true
SPACESHIP_PROMPT_ADD_NEWLINE=true

# Autosuggest performance
ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE="20"
ZSH_AUTOSUGGEST_USE_ASYNC=1

# Minimal plugins - each one adds load time
plugins=(gitfast macos)

# Let oh-my-zsh handle compinit (don't call it twice)
source $ZSH/oh-my-zsh.sh

# VCS info for prompt (lighter than full git plugin)
autoload -U add-zsh-hook
autoload -Uz vcs_info
zstyle ':vcs_info:*' enable git
precmd() { vcs_info }

bindkey "^A" vi-beginning-of-line
bindkey "^E" vi-end-of-line

# Redo some exports
source "$HOME/.zprofile"

# ============================================================================
# Async loading of cosmo env (slow due to network/auth)
# ============================================================================
if [[ ! -d ~/.zsh-async ]]; then
  git clone --depth 1 -b 'v1.8.6' https://github.com/mafredri/zsh-async.git ~/.zsh-async 2>/dev/null
fi

if [[ -f ~/.zsh-async/async.zsh ]]; then
  source ~/.zsh-async/async.zsh
  async_init

  _cosmo_env_load() {
    local parent_path="$1"
    export PATH="$parent_path"
    command -v cosmo &>/dev/null && cosmo env
  }

  _cosmo_env_callback() {
    local stdout=$3
    [[ -n "$stdout" ]] && eval "$stdout"
    async_stop_worker cosmo_worker 2>/dev/null
  }

  async_start_worker cosmo_worker -n
  async_register_callback cosmo_worker _cosmo_env_callback
  async_job cosmo_worker _cosmo_env_load "$PATH"
fi
# zerobrew
export PATH="$HOME/.local/bin:/opt/zerobrew/prefix/bin:$PATH"
