#!/usr/bin/env bash
set -eo pipefail

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
    --exclude "brew.sh" \
    -avh --no-perms . ~;

git config --global user.email "igor@borges.dev"
git config --global user.name "Igor Borges"
git config --global user.signingkey "7AD24624"
git config --global core.excludesfile "~/.gitignore"

is_macos && {
    brew --version || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    brew install git zsh asdf jq awscli fzf bash-completion
    
    asdf --version && \
        asdf plugin-add lein https://github.com/miorimmax/asdf-lein.git && \
        asdf plugin-add clojure https://github.com/asdf-community/asdf-clojure.git && \
        asdf plugin-add flutter && \
        asdf plugin-add dart && \
        asdf plugin-add golang && \
        asdf plugin-add nodejs && \
        asdf plugin-add java
    
    asdf install
}

is_linux && {
    sudo apt install -y zsh jq awscli fzf git vim gcc libc6-dev libgl1-mesa-dev xorg-dev

    which kitty || {
        # install kitty
        curl -L https://sw.kovidgoyal.net/kitty/installer.sh | sh /dev/stdin
        cp ~/.local/kitty.app/share/applications/kitty.desktop ~/.local/share/applications/
        sed -i "s|Icon=kitty|Icon=/home/$USER/.local/kitty.app/share/icons/hicolor/256x256/apps/kitty.png|g" ~/.local/share/applications/kitty*.desktop
        sed -i "s|Exec=kitty|Exec=/home/$USER/.local/kitty.app/bin/kitty|g" ~/.local/share/applications/kitty*.desktop
    }

    chsh -s $(which zsh) $USER

    asdf --version || {
        git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.9.0 || true
    }
    source $HOME/.asdf/asdf.sh || true
    
    asdf --version && \
        asdf plugin-add lein https://github.com/miorimmax/asdf-lein.git && \
        asdf plugin-add clojure https://github.com/asdf-community/asdf-clojure.git && \
        asdf plugin-add flutter && \
        asdf plugin-add dart && \
        asdf plugin-add golang && \
        asdf plugin-add nodejs && \
        asdf plugin-add java
    
    asdf install
}

sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" || true

# Install zsh spaceship theme
ZSH_CUSTOM="$HOME/.tmp"
CLONE_PATH="$ZSH_CUSTOM/themes/spaceship-prompt"
THEME_DESTINATION="$HOME/.oh-my-zsh/themes/spaceship.zsh-theme"
git clone https://github.com/denysdovhan/spaceship-prompt.git "$CLONE_PATH" --depth=1 || true
ln -s "$CLONE_PATH/spaceship.zsh-theme" "$THEME_DESTINATION" || true

# Fonts
is_macos && {
    ls $HOME/Library/Fonts/JetBrainsMono* || {
        JETBRAINSMONO=$(mktemp -d)
        git clone git@github.com:JetBrains/JetBrainsMono.git $JETBRAINSMONO --depth=1
        ( cd "$JETBRAINSMONO/fonts/ttf"; cp *.ttf $HOME/Library/Fonts/ )
    }
}
is_linux && {
    mkdir -p $HOME/.local/share/fonts
    ls $HOME/.local/share/fonts/JetBrainsMono* || {
        JETBRAINSMONO=$(mktemp -d)
        git clone git@github.com:JetBrains/JetBrainsMono.git $JETBRAINSMONO --depth=1
        ( cd "$JETBRAINSMONO/fonts/ttf"; cp *.ttf $HOME/.local/share/fonts/ )
        sudo fc-cache -f -v || true
    }
}

# Final touches
is_codespaces && {
    git config --global --unset user.signingkey
    git config --global commit.gpgsign false
}

clear
zsh
