# Add `~/bin` to the `$PATH`
export PATH="$HOME/bin:$PATH";

# zmodload zsh/datetime
# setopt PROMPT_SUBST
# PS4='+$EPOCHREALTIME %N:%i> '
# logfile=$(mktemp zsh_profile.XXXXXXXX)
# echo "Logging to $logfile"
# exec 3>&2 2>$logfile
# setopt XTRACE

# Load the shell dotfiles, and then some:
# * ~/.path can be used to extend `$PATH`.
# * ~/.extra can be used for other settings you don’t want to commit.
for file in ~/.{exports,aliases,functions,extra,nurc}; do
	[ -r "$file" ] && [ -f "$file" ] && source "$file";
done;
unset file;

# unsetopt XTRACE
# exec 2>&3 3>&-
# /tmp/sortt.sh $HOME/$logfile
