[[ -n $ENVBOX_ENV ]] || bwunlock || return 1
ENVBOX_CONFIRM=1
eval "$(cosmo --env prod env)" || true

export ENVIRONMENT=prod-admin
export AWS_PROFILE=decade-prod

cfgfile ~/.aws/config ~/.config/envbox.d/aws-config.prod-admin
cfgfile ~/.kube/config ~/.config/envbox.d/kubeconfig.prod-admin
