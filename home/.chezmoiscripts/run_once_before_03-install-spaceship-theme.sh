#!/usr/bin/env bash
set -eo pipefail

ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
CLONE_PATH="$ZSH_CUSTOM/themes/spaceship-prompt"
THEME_DESTINATION="$HOME/.oh-my-zsh/themes/spaceship.zsh-theme"

if [ ! -d "$CLONE_PATH" ]; then
    git clone https://github.com/denysdovhan/spaceship-prompt.git "$CLONE_PATH" --depth=1
fi

if [ ! -L "$THEME_DESTINATION" ]; then
    ln -sf "$CLONE_PATH/spaceship.zsh-theme" "$THEME_DESTINATION"
fi
