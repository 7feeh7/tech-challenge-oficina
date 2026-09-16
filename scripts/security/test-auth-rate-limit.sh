#!/usr/bin/env bash
# Teste de carga controlada contra POST /auth/cpf.
# Uso: AUTH_URL=https://.../auth/cpf bash scripts/security/test-auth-rate-limit.sh
set -euo pipefail

AUTH_URL="${AUTH_URL:-}"
CPF="${CPF:-52998224725}"
MAX="${MAX:-12}"

if [[ -z "$AUTH_URL" ]]; then
  echo "Defina AUTH_URL (ex.: SSM api_gateway_auth_url)"
  exit 1
fi

echo "Janela combinada: teste contra ${AUTH_URL}"
echo "CPF sintetico: ${CPF} — max ${MAX} requisicoes"

count_429=0
for i in $(seq 1 "$MAX"); do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$AUTH_URL" \
    -H "Content-Type: application/json" \
    -d "{\"cpf\":\"${CPF}\"}")
  echo "tentativa ${i}: HTTP ${code}"
  if [[ "$code" == "429" ]]; then
    count_429=$((count_429 + 1))
  fi
  sleep 0.2
done

if [[ "$count_429" -lt 1 ]]; then
  echo "FALHA: esperado pelo menos um HTTP 429 (rate limit CPF ou Gateway)"
  exit 1
fi

echo "OK: bloqueio observado (${count_429}x 429). Aguardar 5 min e repetir uma requisicao para recuperacao."
sleep 2
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$AUTH_URL" \
  -H "Content-Type: application/json" \
  -d "{\"cpf\":\"${CPF}\"}")
echo "pos-janela (2s): HTTP ${code} (401 ou 200 esperado, nao 429 persistente)"
