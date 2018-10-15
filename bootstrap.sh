#!/usr/bin/env bash

cd "$(dirname "${BASH_SOURCE}")";

git pull origin master;

function customDoIt() {
	git config --global user.email "igor@borges.me"
	git config --global user.name "Igor Borges"
	git config --global user.signingkey "7AD24624"
	git config --global core.excludesfile "~/.gitignore"

	mkdir -p "$HOME/.oh-my-zsh/themes"
  cp "igor.zsh-theme" "$HOME/.oh-my-zsh/themes/"

  mkdir -p "$HOME/Library/Application Support/Sublime Text 3/Packages/User"
	cp -R "sublime/" "$HOME/Library/Application Support/Sublime Text 3/Packages/User/"

	mkdir -p "$HOME/.config/kitty"
	cp "kitty.conf" "$HOME/.config/kitty/"

	mkdir -p "$HOME/Library/Application Support/Code/User"
	cp -R "vscode/" "$HOME/Library/Application Support/Code/User/"

	curl 'https://github.com/robbyrussell/oh-my-zsh/compare/master...Igor1201:magic-patch.patch' > /tmp/magic.patch
	( cd "$HOME/.oh-my-zsh"; git apply /tmp/magic.patch )
}

function doIt() {
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

	customDoIt;

	source ~/.zprofile;
}

doIt;
unset doIt;
unset customDoIt;
