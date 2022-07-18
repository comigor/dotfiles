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

function symlink_files () {
    (
        cd dots/
        find . -type f -exec ln -sf "$PWD/{}" "$HOME/{}" \;
    )
}

symlink_files

git config --global user.email "igor@borges.dev"
git config --global user.name "Igor Borges"
git config --global user.signingkey "7AD24624"
git config --global core.excludesfile "~/.gitignore"

# Required stuff
is_linux && {
    sudo apt install -y zsh jq awscli fzf git vim flatpak gcc gettext libc6-dev libgl1-mesa-dev xorg-dev ca-certificates curl gnupg lsb-release
    sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" || true
    echo "$SHELL" | grep zsh || {
        chsh -s $(which zsh) $USER
    }
    sudo apt remove -y geary 'libreoffice*' || true
    sudo apt autoremove
}

# Install zsh spaceship theme
ZSH_CUSTOM="$HOME/.tmp"
CLONE_PATH="$ZSH_CUSTOM/themes/spaceship-prompt"
THEME_DESTINATION="$HOME/.oh-my-zsh/themes/spaceship.zsh-theme"
git clone https://github.com/denysdovhan/spaceship-prompt.git "$CLONE_PATH" --depth=1 || true
ln -s "$CLONE_PATH/spaceship.zsh-theme" "$THEME_DESTINATION" || true

# MacOS
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

    ls $HOME/Library/Fonts/JetBrainsMono* || {
        JETBRAINSMONO=$(mktemp -d)
        git clone git@github.com:JetBrains/JetBrainsMono.git $JETBRAINSMONO --depth=1
        ( cd "$JETBRAINSMONO/fonts/ttf"; cp *.ttf $HOME/Library/Fonts/ )
    }
}

# Linux (with selection)
is_linux && {
    CHOICES=$(whiptail --separate-output --checklist "Choose software to install" 22 80 15 \
        "keyboard_mod" "CAPS_LOCK mod to US, intl., with dead keys" ON \
        "kitty" "Kitty (installer)" ON \
        "docker" "Docker (new repository)" ON \
        "asdf" "ASDF (+ pre-configured software)" ON \
        "zerotier" "Zerotier (APT)" ON \
        "parsec" "Parsec (flatpak)" ON \
        "chrome" "Chrome (flatpak)" ON \
        "vscode-insiders" "VSCode Insiders (flatpak)" ON \
        "vlc" "VLC (flatpak)" ON \
        "jetbrains-mono" "JetBrains Mono Font" ON \
        "nubank" "Nubank Stuff" OFF 3>&1 1>&2 2>&3)

    if [ ! -z "$CHOICES" ]; then
        for CHOICE in $CHOICES; do
            echo "Installing ${CHOICE}..."
            case "$CHOICE" in
            "keyboard_mod")
                sudo perl -0777 -i.bak -pe 's/(US, intl\., with dead keys)(\).*?\n)/\1, igor\2    key <CAPS> { [ dead_grave, dead_tilde ] };\n/s' /usr/share/X11/xkb/symbols/us
                ;;
            "kitty")
                which kitty || {
                    curl -L https://sw.kovidgoyal.net/kitty/installer.sh | sh /dev/stdin
                    cp ~/.local/kitty.app/share/applications/kitty.desktop ~/.local/share/applications/
                    sed -i "s|Icon=kitty|Icon=/home/$USER/.local/kitty.app/share/icons/hicolor/256x256/apps/kitty.png|g" ~/.local/share/applications/kitty*.desktop
                    sed -i "s|Exec=kitty|Exec=/home/$USER/.local/kitty.app/bin/kitty|g" ~/.local/share/applications/kitty*.desktop
                }
                ;;
            "docker")
                sudo mkdir -p /etc/apt/keyrings
                curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --yes --dearmor -o /etc/apt/keyrings/docker.gpg
                echo \
                    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
                    $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                sudo apt-get update
                sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
                sudo groupadd docker || true
                sudo usermod -aG docker $USER || true
                ;;
            "asdf")
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
                ;;
            "zerotier")
                sudo apt install -y zerotier-one
                ;;
            "parsec")
                flatpak install --user flathub com.parsecgaming.parsec
                ;;
            "chrome")
                flatpak install --user flathub com.google.Chrome
                sed -i \
                    -e 's; com.google.Chrome; com.google.Chrome --enable-features=WebUIDarkMode --force-dark-mode;g' \
                    -e 's;flatpak run;flatpak run --filesystem=~/.pki/nssdb;g' \
                    "$HOME/.local/share/flatpak/exports/share/applications/com.google.Chrome.desktop"
                ;;
            "vscode-insiders")
                flatpak install --user flathub org.freedesktop.Sdk/x86_64/21.08
                flatpak remote-add --user flathub-beta https://flathub.org/beta-repo/flathub-beta.flatpakrepo || true
                flatpak install --user flathub-beta com.visualstudio.code.insiders
                ;;
            "vlc")
                flatpak install --user flathub org.videolan.VLC
                ;;
            "jetbrains-mono")
                mkdir -p $HOME/.local/share/fonts
                ls $HOME/.local/share/fonts/JetBrainsMono* || {
                    JETBRAINSMONO=$(mktemp -d)
                    git clone git@github.com:JetBrains/JetBrainsMono.git $JETBRAINSMONO --depth=1
                    ( cd "$JETBRAINSMONO/fonts/ttf"; cp *.ttf $HOME/.local/share/fonts/ )
                    sudo fc-cache -f -v || true
                }
                ;;
            "nubank")
                sudo apt install -y libnss3-tools openfortivpn
                flatpak install --user flathub us.zoom.Zoom
                flatpak install --user flathub com.jetbrains.IntelliJ-IDEA-Community

                mkdir -p "$HOME/.var/app/com.jetbrains.IntelliJ-IDEA-Community/config/JetBrains/IdeaIC2022.1/"
                echo 'idea.config.path=${user.home}/.config/JetBrains/Idea' >> "$HOME/.var/app/com.jetbrains.IntelliJ-IDEA-Community/config/JetBrains/IdeaIC2022.1/idea.properties"

                mkdir -p "$HOME/.config/JetBrains/Idea/keymaps/"
                cp IDEAKeymap.xml "$HOME/.config/JetBrains/Idea/keymaps/"

                echo
                echo "Now copy Nu dotfiles and install nucli"
                ;;
            *)
                echo "Unsupported item $CHOICE!" >&2
                exit 1
                ;;
            esac
        done
    fi
}

# Final touches
is_codespaces && {
    git config --global --unset user.signingkey
    git config --global commit.gpgsign false
}

echo
echo "Check log above for possible errors, and then open a new terminal"
