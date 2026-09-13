#!/usr/bin/env bash
# Verifica links relativos em arquivos Markdown de docs/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/docs"
FAILED=0

check_file() {
  local md="$1"
  local dir
  dir="$(dirname "$md")"

  while IFS= read -r link; do
    [[ -z "$link" ]] && continue
    [[ "$link" =~ ^https?:// ]] && continue
    [[ "$link" =~ ^# ]] && continue

    local target="${link%%#*}"
    [[ -z "$target" ]] && continue

    local resolved="$dir/$target"
    if [[ ! -e "$resolved" ]]; then
      echo "LINK QUEBRADO: $md -> $link"
      FAILED=1
    fi
  done < <(grep -oE '\[[^]]+\]\([^)]+\)' "$md" | sed -E 's/\[[^]]+\]\(([^)]+)\)/\1/')
}

while IFS= read -r md; do
  case "$md" in
    *TEMPLATE.md|*/local/*) continue ;;
  esac
  check_file "$md"
done < <(find "$DOCS" -name '*.md' -type f)

if [[ "$FAILED" -ne 0 ]]; then
  echo "Verificação de links falhou."
  exit 1
fi

echo "Todos os links relativos em docs/ estão válidos."
