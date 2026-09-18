[[ -n $ENVBOX_ENV ]] || bwunlock || return 1
eval "$(cosmo --env prod env)" || true

export ENVIRONMENT=prod
export AWS_PROFILE=decade-prod

cfgfile ~/.aws/config ~/.config/envbox.d/aws-config.prod
cfgfile ~/.kube/config ~/.config/envbox.d/kubeconfig.prod
