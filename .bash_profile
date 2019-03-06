# Add `~/bin` to the `$PATH`
export PATH="$HOME/bin:$PATH";

# Ruby shit here because I don't want it polluting my ZSH
eval "$(rbenv init -)"

[ -r "$HOME/.nurc" ] && [ -f "$HOME/.nurc" ] && source "$HOME/.nurc";
