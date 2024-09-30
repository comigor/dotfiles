# Add `~/bin` to the `$PATH`
export PATH="$HOME/bin:$PATH";

## https://esham.io/2018/02/zsh-profiling
# zmodload zsh/datetime
# setopt PROMPT_SUBST
# PS4='+$EPOCHREALTIME %N:%i> '
# logfile=$(mktemp zsh_profile.XXXXXXXX)
# echo "Logging to $logfile"
# exec 3>&2 2>$logfile
# setopt XTRACE

# Load the shell dotfiles, and then some:
# * ~/.path can be used to extend `$PATH`.
for file in ~/.{aliases,functions,extra,exports,fzf.zsh,nurc,cargo/env} /usr/share/doc/fzf/examples/key-bindings.zsh; do
	[ -r "$file" ] && [ -f "$file" ] && source "$file";
done;
unset file;

# unsetopt XTRACE
# exec 2>&3 3>&-
# /tmp/sortt.sh $HOME/$logfile
