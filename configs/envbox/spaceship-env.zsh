# Custom spaceship section: current envbox environment ($ENV).
# Sync (variable read only) so no pinentry can ever fire from a prompt hook.
# prod gets %K{background} embedded in content; the section wrapper only
# manages foreground colors, so the content string must close its own bg (%k).

SPACESHIP_ENV_SHOW="${SPACESHIP_ENV_SHOW=true}"
SPACESHIP_ENV_ASYNC="${SPACESHIP_ENV_ASYNC=false}"
SPACESHIP_ENV_PREFIX="${SPACESHIP_ENV_PREFIX=""}"
SPACESHIP_ENV_SUFFIX="${SPACESHIP_ENV_SUFFIX="$SPACESHIP_PROMPT_DEFAULT_SUFFIX"}"
SPACESHIP_ENV_SYMBOL="${SPACESHIP_ENV_SYMBOL=""}"

spaceship_env() {
  [[ $SPACESHIP_ENV_SHOW == false || -z $ENV ]] && return
  local color=green content=$ENV
  if [[ $ENV == *prod* ]]; then
    color=white
    content="%K{124} ${${(U)ENV}} %k"
  fi
  spaceship::section::v4 \
    --color "$color" \
    --prefix "$SPACESHIP_ENV_PREFIX" \
    --suffix "$SPACESHIP_ENV_SUFFIX" \
    --symbol "$SPACESHIP_ENV_SYMBOL" \
    "$content"
}
