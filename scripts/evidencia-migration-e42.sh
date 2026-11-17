#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
E42_MIG="20261117180000_resolucoes_consumo_manuais"
E42_DIR="prisma/migrations/${E42_MIG}"
BACKUP_DIR="$(mktemp -d)"
SQL_EVIDENCIA="SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('resolucoes_consumo_manuais','consumos_aplicados_os','projecoes_financeiras') ORDER BY tablename, indexname;"
SQL_FKS="SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'resolucoes_consumo_manuais'::regclass;"
SQL_NOTNULL="SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name IN ('consumos_aplicados_os','resolucoes_consumo_manuais') AND column_name IN ('event_id','tipo_fato','fato_ocorrido_em') ORDER BY table_name, column_name;"

rodar_consultas() {
  yarn prisma db execute --stdin <<EOF
${SQL_EVIDENCIA}
EOF
  yarn prisma db execute --stdin <<EOF
${SQL_FKS}
EOF
  yarn prisma db execute --stdin <<EOF
${SQL_NOTNULL}
EOF
}

cenario() {
  local nome="$1"
  local porta="$2"
  local incremental="$3"
  echo "========== Cenário ${nome} (porta ${porta}, incremental=${incremental}) =========="
  docker rm -f "pg-e42-${nome}" >/dev/null 2>&1 || true
  docker run -d --name "pg-e42-${nome}" \
    -e POSTGRES_PASSWORD=pgtest \
    -e POSTGRES_DB=e42_${nome} \
    -p "${porta}:5432" \
    postgres:16-alpine >/dev/null
  sleep 4
  export DATABASE_URL="postgresql://postgres:pgtest@127.0.0.1:${porta}/e42_${nome}?schema=public"
  if [ "$incremental" = "true" ]; then
    mv "${E42_DIR}" "${BACKUP_DIR}/"
    yarn prisma migrate deploy
    local diff_antes
    diff_antes=$(yarn prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code 2>&1) || true
    if ! echo "$diff_antes" | grep -q "resolucoes_consumo_manuais"; then
      echo "FALHA: baseline incremental deve indicar tabela E42 pendente"
      exit 1
    fi
    mv "${BACKUP_DIR}/${E42_MIG}" "${E42_DIR}/"
    yarn prisma migrate deploy
  else
    yarn prisma migrate deploy
  fi
  yarn prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
  echo "migrate diff: exit 0"
  rodar_consultas
  docker rm -f "pg-e42-${nome}" >/dev/null
}

cenario "A-vazio" 55432 false
cenario "B-incremental" 55433 true
rmdir "${BACKUP_DIR}" 2>/dev/null || true
echo "Evidência migration E42 concluída sem SQL corretivo manual."