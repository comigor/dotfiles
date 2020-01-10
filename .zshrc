export ZSH=$HOME/.oh-my-zsh

ZSH_THEME="spaceship"
SPACESHIP_KUBECONTEXT_SHOW=false
SPACESHIP_PACKAGE_SHOW=false
SPACESHIP_NODE_SHOW=false

plugins=(gitfast osx)

source $ZSH/oh-my-zsh.sh

autoload -U add-zsh-hook
add-zsh-hook -Uz chpwd (){
    if [[ "$PWD" = *mini-meta-repo* ]];  then
        asdf local flutter 1.9.6-dev
        export FLUTTER_ROOT="$HOME/.asdf/installs/flutter/1.9.6-dev"
        export PATH="$FLUTTER_ROOT/bin:$PATH"
    fi
}