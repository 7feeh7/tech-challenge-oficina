#!/usr/bin/env bash
# Valida links HTTP(S) estáticos do documento de entrega (spec 009).
# Não testa api_gateway_url dinâmico nem links a preencher (_..._).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOC="${ROOT}/docs/entrega/entrega-fase3.md"
FAIL=0

check_url() {
  local url="$1"
  local code
  if ! code="$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time 20 "$url" 2>/dev/null)"; then
    echo "FAIL curl  $url"
    FAIL=1
    return
  fi
  if [[ "$code" =~ ^(200|301|302|403)$ ]]; then
    echo "OK  $code  $url"
  else
    echo "FAIL $code  $url"
    FAIL=1
  fi
}

echo "Verificando links GitHub em ${DOC}..."
mapfile -t URLS < <(grep -oE 'https://github.com/[^ )]+' "$DOC" | sort -u)

for url in "${URLS[@]}"; do
  check_url "$url"
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "Alguns links falharam. Corrija antes de exportar o PDF." >&2
  exit 1
fi

echo "Todos os links GitHub verificados."
