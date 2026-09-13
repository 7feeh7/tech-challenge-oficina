#!/usr/bin/env bash
# Seed de demonstração — execução MANUAL exclusiva (spec 009).
# Nunca invoque este script a partir de CI/CD, deploy.yml ou docker-compose.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="${ROOT}/scripts/seed-demo.sql"

echo "⚠️  Seed de demonstração — acionamento manual explícito."
echo "    Não faz parte do deploy automático."

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Uso:
  ./scripts/seed-demo.sh              # Postgres local via docker compose
  ./scripts/seed-demo.sh --url "$DATABASE_URL"  # Postgres remoto (psql instalado)

Variáveis opcionais (modo docker):
  POSTGRES_USER (default: oficina)
  POSTGRES_DB   (default: oficina)
EOF
  exit 0
fi

if [[ "${1:-}" == "--url" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "Erro: informe DATABASE_URL após --url" >&2
    exit 1
  fi
  psql "$2" -v ON_ERROR_STOP=1 -f "$SQL"
else
  POSTGRES_USER="${POSTGRES_USER:-oficina}"
  POSTGRES_DB="${POSTGRES_DB:-oficina}"
  docker compose -f "${ROOT}/docker-compose.yml" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f - < "$SQL"
fi

echo "✅ Seed demo aplicado. CPFs sintéticos:"
echo "   Ativo:   529.982.247-25  (demo.ativo@example.com)"
echo "   Inativo: 390.533.447-05  (401 genérico na auth CPF)"
echo "   OS demo: id 55555555-5555-4555-8555-555555555001 (EM_DIAGNOSTICO)"
