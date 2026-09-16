#!/usr/bin/env bash
# Verifica que testes de sanitizacao passam.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "Executando testes de sanitizacao (API)..."
yarn test src/shared/observability/log-sanitizer.spec.ts --silent

echo "OK — padroes CPF, e-mail, JWT e Bearer cobertos por testes unitarios."
