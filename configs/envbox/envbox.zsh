bwunlock() {
  unset BW_SESSION FNOX_BW_SESSION
  local session
  session=$(python3 "$HOME/.config/envbox/vault.py" unlock) || return 1
  export BW_SESSION=$session
}

cfgfile() {
  [[ -n $ENVBOX_ROOT ]] || { print -u2 "cfgfile: only valid inside envbox"; return 1 }
  local target=$1 source=$2 sandbox=$ENVBOX_ROOT/files${${1:A}}
  mkdir -p ${sandbox:h}
  cp -f $source $sandbox || return 1
  chmod 600 $sandbox
  (( ${+ENVBOX_MAP} )) && ENVBOX_MAP[${target:A}]=$sandbox
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
    umask 077
    local root=$(mktemp -d ${TMPDIR:-/tmp}/envbox.$name.XXXXXX) || exit 1
    trap 'rm -rf "$root"' EXIT
    export ENVBOX_ROOT=$root
    typeset -gA ENVBOX_MAP
    unset ENVBOX_CONFIRM BW_SESSION FNOX_BW_SESSION
    unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
    unset AWS_DEFAULT_PROFILE AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN AWS_ROLE_SESSION_NAME
    unset AWS_CONTAINER_CREDENTIALS_RELATIVE_URI AWS_CONTAINER_CREDENTIALS_FULL_URI
    unset AWS_CONTAINER_AUTHORIZATION_TOKEN AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE

    source $envfile || exit 1

    if [[ -n $ENVBOX_CONFIRM ]]; then
      local reply
      read -r "reply?Entering $name — type '$name' to continue: "
      [[ $reply == $name ]] || exit 1
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
    export FNOX_PROFILE=$name
    python3 "$HOME/.config/envbox/vault.py" exec "$name" zsh
  )
}
