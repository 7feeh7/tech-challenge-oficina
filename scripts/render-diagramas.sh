#!/usr/bin/env bash
# Exporta diagramas Mermaid de docs/diagramas/ para SVG (opcional, para PDF/README offline)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/diagramas/rendered"
mkdir -p "$OUT"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx não encontrado; pule renderização ou instale Node.js."
  exit 0
fi

DIAGRAMS=(
  componentes-nuvem
  sequencia-auth-cpf
  sequencia-abertura-os
  diagrama-aplicacao
  diagrama-serverless
  diagrama-infra-kubernetes
  diagrama-infra-database
)

for name in "${DIAGRAMS[@]}"; do
  src="$ROOT/docs/diagramas/${name}.md"
  tmp="$OUT/${name}.mmd"
  # Extrai primeiro bloco mermaid do markdown
  awk '/^```mermaid$/,/^```$/' "$src" | sed '1d;$d' > "$tmp"
  npx --yes @mermaid-js/mermaid-cli@11 -i "$tmp" -o "$OUT/${name}.svg" -b transparent
  echo "Renderizado: docs/diagramas/rendered/${name}.svg"
done

echo "Diagramas exportados em docs/diagramas/rendered/"
