#!/usr/bin/env bash
set -euo pipefail

OWNER="${1:-7feeh7}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/evidence"

mkdir -p "$OUT"

REPOS=(
  "tech-challenge-oficina"
  "tech-challenge-serverless"
  "tech-challenge-infra-kubernetes"
  "tech-challenge-infra-database"
)

for REPO in "${REPOS[@]}"; do
  echo "Coletando evidencias de ${OWNER}/${REPO}..."
  gh api "repos/${OWNER}/${REPO}/branches/main/protection" > "${OUT}/${REPO}-branch-protection-main.json" 2>/dev/null || \
    echo '{"note":"branch protection nao configurada ou sem permissao"}' > "${OUT}/${REPO}-branch-protection-main.json"
  gh api "repos/${OWNER}/${REPO}/environments/producao" > "${OUT}/${REPO}-environment-producao.json" 2>/dev/null || true
  gh api "repos/${OWNER}/${REPO}/environments/producao/deployment-branch-policies" > "${OUT}/${REPO}-deployment-branch-policy.json" 2>/dev/null || true
  gh api "repos/${OWNER}/${REPO}/actions/secrets" > "${OUT}/${REPO}-repo-secrets-names.json" 2>/dev/null || true
  gh api "repos/${OWNER}/${REPO}/environments/producao/secrets" > "${OUT}/${REPO}-env-secrets-names.json" 2>/dev/null || true
done

echo "Evidencias salvas em ${OUT}/"
