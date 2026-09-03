# Isolation model: env file is sourced inside envbox's subshell, so every
# export dies with it and real config files are never touched — cfgfile copies
# into a mktemp sandbox and each tool is pointed at the copy.
# ~/.$name.secrets is auto-sourced after the env file (may override it).
# ENVBOX_LOCK_RBW=1 forces rbw lock+unlock (agent TTL would otherwise silently
# skip the password prompt). ENVBOX_CONFIRM=1 requires typing the env name.
# Helpers live at file scope and ENVBOX_ROOT/$ENVBOX_ENVFILE are exported so a
# child shell can re-source its env file (zprofile does this to win over the
# ambient base/staging files it sources during startup).

_eb_rbw() {
  rbw unlocked &>/dev/null || rbw unlock || return 1
  if (( $# > 1 )); then
    rbw get --field $2 $1
  else
    rbw get $1
  fi
}

cfgfile() { # <target-path> <file | rbw:item[:field]>
  [[ -n $ENVBOX_ROOT ]] || { print -u2 "cfgfile: only valid inside envbox"; return 1 }
  local target=$1 source=$2 sandbox=$ENVBOX_ROOT/files${${1:A}}
  mkdir -p ${sandbox:h}
  if [[ $source == rbw:* ]]; then
    local item=${source#rbw:} field=
    [[ $item == *:* ]] && { field=${item#*:}; item=${item%%:*} }
    _eb_rbw $item ${field:+$field} >| $sandbox || return 1
  else
    cp $source $sandbox || return 1
  fi
  chmod 600 $sandbox
  (( ${+ENVBOX_MAP} )) && ENVBOX_MAP[${target:A}]=$sandbox
}

secret() { # <VAR> <literal | rbw:item[:field]>
  local var=$1 src=$2 val
  if [[ $src == rbw:* ]]; then
    local item=${src#rbw:} field=
    [[ $item == *:* ]] && { field=${item#*:}; item=${item%%:*} }
    val=$(_eb_rbw $item ${field:+$field}) || return 1
  else
    val=$src
  fi
  export $var=$val
}

envbox() {
  emulate -L zsh
  local name=$1
  local dir=${ENVBOX_DIR:-$HOME/.config/envbox.d}
  local envfile=$dir/$name.zsh

  [[ -n $name       ]] || { print -u2 "usage: envbox <name>"; return 2 }
  [[ -z $ENVBOX_ENV ]] || { print -u2 "envbox: already inside '$ENVBOX_ENV'"; return 1 }
  [[ -r $envfile    ]] || { print -u2 "envbox: unknown env '$name' ($envfile)"; return 1 }

  (
    local root=$(mktemp -d ${TMPDIR:-/tmp}/envbox.$name.XXXXXX)
    chmod 700 $root
    export ENVBOX_ROOT=$root
    typeset -gA ENVBOX_MAP

    source $envfile || { rm -rf $root; exit 1 }
    [[ -r $HOME/.$name.secrets ]] && source $HOME/.$name.secrets

    if [[ -n $ENVBOX_LOCK_RBW ]]; then
      rbw lock &>/dev/null
      rbw unlocked &>/dev/null || rbw unlock || { rm -rf $root; exit 1 }
    fi

    if [[ -n $ENVBOX_CONFIRM ]]; then
      local reply
      read -r "reply?Entering $name — type '$name' to continue: "
      [[ $reply == $name ]] || { rm -rf $root; exit 1 }
    fi

    local t s
    for t s in ${(kv)ENVBOX_MAP}; do
      case $t in
        $HOME/.kube/config)        export KUBECONFIG=$s ;;
        $HOME/.aws/config)         export AWS_CONFIG_FILE=$s ;;
        $HOME/.aws/credentials)    export AWS_SHARED_CREDENTIALS_FILE=$s ;;
        $HOME/.docker/config.json) export DOCKER_CONFIG=${s:h} ;;
      esac
    done

    export ENV=$name ENVBOX_ENV=$name ENVBOX_ENVFILE=$envfile
    zsh
    local rc=$?
    rm -rf $root
    exit $rc
  )
}
