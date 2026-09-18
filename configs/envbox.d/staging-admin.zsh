[[ -n $ENVBOX_ENV ]] || bwunlock || return 1
ENVBOX_CONFIRM=1
eval "$(cosmo --env staging env)" || true

export ENVIRONMENT=staging-admin
export AWS_PROFILE=decade-staging

cfgfile ~/.aws/config ~/.config/envbox.d/aws-config.staging-admin
cfgfile ~/.kube/config ~/.config/envbox.d/kubeconfig.staging
