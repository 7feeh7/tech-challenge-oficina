#!/usr/bin/env bash
#
# Remove tudo que o k8s-local.sh criou no cluster local.
# O metrics-server é mantido (é infraestrutura do cluster, não da aplicação).
#
#   bash scripts/k8s-local-down.sh
set -euo pipefail

kubectl delete namespace oficina --ignore-not-found
echo "Namespace 'oficina' removido. O metrics-server foi mantido em kube-system."
