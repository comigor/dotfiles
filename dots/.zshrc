export ZSH=$HOME/.oh-my-zsh

ZSH_THEME="spaceship"
SPACESHIP_TIME_SHOW=true

SPACESHIP_DIR_TRUNC_REPO=false
# SPACESHIP_PACKAGE_SHOW=false
# SPACESHIP_NODE_SHOW=false
# SPACESHIP_RUBY_SHOW=false
# SPACESHIP_ELM_SHOW=false
# SPACESHIP_ELIXIR_SHOW=false
# SPACESHIP_XCOODE_SHOW=false
# SPACESHIP_GOLANG_SHOW=false
# SPACESHIP_PHP_SHOW=false
# SPACESHIP_RUST_SHOW=false
# SPACESHIP_HASKELL_SHOW=false
# SPACESHIP_JULIA_SHOW=false
# SPACESHIP_DOCKER_SHOW=false
# SPACESHIP_DOCKER_CONTEXT_SHOW=false
SPACESHIP_AWS_SHOW=false
# SPACESHIP_VENV_SHOW=false
# SPACESHIP_CONDA_SHOW=false
# SPACESHIP_PYTHON_SHOW=false
# SPACESHIP_DOTNET_SHOW=false
# SPACESHIP_EMBER_SHOW=false
# SPACESHIP_KUBECTL_SHOW=false
# SPACESHIP_KUBECTL_CONTEXT_SHOW=false
# SPACESHIP_TERRAFORM_SHOW=false
SPACESHIP_PROMPT_ASYNC=true
SPACESHIP_PROMPT_ADD_NEWLINE=true
ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE="20"
ZSH_AUTOSUGGEST_USE_ASYNC=1

# ZSH configs
# Smarter completion initialization
autoload -Uz compinit
if [ "$(date +'%j')" != "$(stat -f '%Sm' -t '%j' ~/.zcompdump 2>/dev/null)" ]; then
    compinit
else
    compinit -C
fi

DISABLE_AUTO_UPDATE="true"
DISABLE_MAGIC_FUNCTIONS="true"
DISABLE_COMPFIX="true"

plugins=(gitfast macos) # zsh-autosuggestions zsh-syntax-highlighting)

source $ZSH/oh-my-zsh.sh

autoload -U add-zsh-hook
autoload -Uz vcs_info
zstyle ':vcs_info:*' enable git
precmd() {
    vcs_info
}

bindkey "^A" vi-beginning-of-line
bindkey "^E" vi-end-of-line

# Redo some exports
source "$HOME/.zprofile"
