ENVBOX_LOCK_RBW=1

export ENVIRONMENT=prod
export AWS_PROFILE=decade-prod

cfgfile ~/.aws/config ~/.config/envbox.d/aws-config.prod
cfgfile ~/.kube/config ~/.config/envbox.d/kubeconfig.prod
