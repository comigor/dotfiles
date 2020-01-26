export ZSH=$HOME/.oh-my-zsh

ZSH_THEME="spaceship"
SPACESHIP_TIME_SHOW=true

SPACESHIP_PACKAGE_SHOW=false
SPACESHIP_NODE_SHOW=false
SPACESHIP_RUBY_SHOW=false
SPACESHIP_ELM_SHOW=false
SPACESHIP_ELIXIR_SHOW=false
SPACESHIP_XCOODE_SHOW=false
SPACESHIP_GOLANG_SHOW=false
SPACESHIP_PHP_SHOW=false
SPACESHIP_RUST_SHOW=false
SPACESHIP_HASKELL_SHOW=false
SPACESHIP_JULIA_SHOW=false
SPACESHIP_DOCKER_SHOW=false
SPACESHIP_DOCKER_CONTEXT_SHOW=false
SPACESHIP_AWS_SHOW=false
SPACESHIP_VENV_SHOW=false
SPACESHIP_CONDA_SHOW=false
SPACESHIP_PYENV_SHOW=false
SPACESHIP_DOTNET_SHOW=false
SPACESHIP_EMBER_SHOW=false
SPACESHIP_KUBECTL_SHOW=false
SPACESHIP_KUBECTL_VERSION_SHOW=false
SPACESHIP_KUBECONTEXT_SHOW=false
SPACESHIP_TERRAFORM_SHOW=false

plugins=(gitfast osx)

source $ZSH/oh-my-zsh.sh

autoload -U add-zsh-hook
autoload -Uz vcs_info
zstyle ':vcs_info:*' enable git
precmd() {
    vcs_info
}

# Redo some exports
for file in ~/.{exports,fzf.zsh}; do
	[ -r "$file" ] && [ -f "$file" ] && source "$file";
done;
unset file;
