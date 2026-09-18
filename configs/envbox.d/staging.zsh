eval "$(cosmo --env staging env)" || true

export ENVIRONMENT=staging

cfgfile ~/.aws/config ~/.config/envbox.d/aws-config.staging
cfgfile ~/.kube/config ~/.config/envbox.d/kubeconfig.staging
