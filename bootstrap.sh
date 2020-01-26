#!/usr/bin/env bash
set -euo pipefail

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

mkdir -p "$HOME/.oh-my-zsh/themes"
cp "igor.zsh-theme" "$HOME/.oh-my-zsh/themes/"

mkdir -p "$HOME/Library/Application Support/Code - Insiders/User"
rm -f $HOME/Library/Application\ Support/Code\ -\ Insiders/User/*.json
ln -s $PWD/vscode/* "$HOME/Library/Application Support/Code - Insiders/User"

curl -L 'https://github.com/robbyrussell/oh-my-zsh/compare/master...comigor:magic-patch.patch' > /tmp/magic.patch
( cd "$HOME/.oh-my-zsh"; git apply /tmp/magic.patch || true )

# Fonts
FIRACODE=$(mktemp -d)
git clone git@github.com:powerline/fonts.git $FIRACODE
( cd "$FIRACODE/FiraMono"; cp *.otf $HOME/Library/Fonts/ )

JETBRAINSMONO=$(mktemp -d)
git clone git@github.com:JetBrains/JetBrainsMono.git $JETBRAINSMONO
( cd "$JETBRAINSMONO/ttf"; cp *.ttf $HOME/Library/Fonts/ )

clear
zsh
