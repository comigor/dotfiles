#!/usr/bin/env bash
set -euo pipefail

function is_macos {
    [[ "$OSTYPE" == "darwin"* ]]
}

function is_linux {
    [[ "$OSTYPE" == "linux-gnu"* ]]
}

function is_codespaces {
    [[ "$CODESPACES" == "true" ]]
}

rsync --exclude ".git/" \
    --exclude ".DS_Store" \
    --exclude ".macos" \
    --exclude ".ubuntu" \
    --exclude "bootstrap.sh" \
    --exclude "README.md" \
    --exclude "LICENSE-MIT.txt" \
    --exclude "igor.zsh-theme" \
    --exclude "brew.sh" \
    --exclude "sublime" \
    --exclude "vscode" \
    --exclude "kitty.conf" \
    -avh --no-perms . ~;

git config --global user.email "igor@borges.dev"
git config --global user.name "Igor Borges"
git config --global user.signingkey "7AD24624"
git config --global core.excludesfile "~/.gitignore"

# mkdir -p "$HOME/.oh-my-zsh/themes"
# cp "igor.zsh-theme" "$HOME/.oh-my-zsh/themes/"

# Install zsh spaceship theme
ZSH_CUSTOM="$HOME/.tmp"
CLONE_PATH="$ZSH_CUSTOM/themes/spaceship-prompt"
THEME_DESTINATION="$HOME/.oh-my-zsh/themes/spaceship.zsh-theme"
git clone https://github.com/denysdovhan/spaceship-prompt.git "$CLONE_PATH" --depth=1 || true
ln -s "$CLONE_PATH/spaceship.zsh-theme" "$THEME_DESTINATION" || true

is_macos && {
    mkdir -p "$HOME/Library/Application Support/Code - Insiders/User"
    rm -f $HOME/Library/Application\ Support/Code\ -\ Insiders/User/*.json
    ln -s $PWD/vscode/* "$HOME/Library/Application Support/Code - Insiders/User"
}
# is_linux && {
#     # TODO: Move vscode settings to right place
# }
is_codespaces && {
    REPO_NAME=$(basename "$(ls -d '$HOME/workspace/*' | head -n 1)")
    mkdir -p "$HOME/workspace/$REPO_NAME/.vscode"
    ln -s "$PWD/vscode/*" "$HOME/workspace/$REPO_NAME/.vscode" || true
}

curl -L 'https://github.com/robbyrussell/oh-my-zsh/compare/master...comigor:magic-patch.patch' > /tmp/magic.patch
( cd "$HOME/.oh-my-zsh"; git apply /tmp/magic.patch || true )

# Fonts
is_macos && {
    JETBRAINSMONO=$(mktemp -d)
    git clone git@github.com:JetBrains/JetBrainsMono.git $JETBRAINSMONO
    ( cd "$JETBRAINSMONO/ttf"; cp *.ttf $HOME/Library/Fonts/ )
}
is_linux && {
    cd /tmp
    wget https://download.jetbrains.com/fonts/JetBrainsMono-2.001.zip
    unzip -o JetBrainsMono-2.001.zip -d "$HOME/.local/share/fonts"
    sudo fc-cache -f -v || true
}

# Final touches
is_codespaces && {
    git config --global --unset user.signingkey
    git config --global commit.gpgsign false
}

clear
zsh
