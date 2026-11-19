#!/usr/bin/env bash
# Funções para os passos dos workflows de implantação do OS. Use com `source`.
#
# Os valores lidos ficam em variáveis do próprio passo: nunca em *output* de passo
# nem em `${{ }}` dentro de comando, para que não apareçam no log do workflow.

PREFIXO_SSM="/tech-challenge/${TF_ENVIRONMENT}"

# Valor de um parâmetro SSM. Falha se o parâmetro estiver ausente ou vazio, para
# que um valor em branco não vire configuração silenciosa.
parametro() {
  local valor
  valor=$(aws ssm get-parameter --name "${PREFIXO_SSM}/$1" --query Parameter.Value --output text)
  if [ -z "$valor" ] || [ "$valor" = "None" ]; then
    echo "Parâmetro SSM vazio: $1" >&2
    exit 1
  fi
  printf '%s' "$valor"
}

# Conteúdo (SecretString) do segredo cujo ARN está no parâmetro SSM informado.
segredo() {
  local arn
  arn=$(parametro "$1")
  aws secretsmanager get-secret-value --secret-id "$arn" --query SecretString --output text
}

# O runner mascara por linha: um valor multilinha (chave PEM) precisa de uma
# máscara para cada linha.
mascarar() {
  local linha
  while IFS= read -r linha; do
    if [ -n "$linha" ]; then
      echo "::add-mask::$linha"
    fi
  done <<< "$1"
}

# Define DATABASE_URL a partir do segredo do RDS. A senha e a URL completa são
# mascaradas antes de qualquer outro uso. Não chame dentro de `$(...)`: o `::add-mask::`
# precisa chegar ao runner e não à variável capturada.
montar_database_url() {
  local segredo_banco senha
  segredo_banco=$(segredo database/db_secret_arn)
  senha=$(jq -r .password <<< "$segredo_banco")
  mascarar "$senha"
  DATABASE_URL="postgresql://$(jq -r .username <<< "$segredo_banco"):${senha}@$(jq -r .host <<< "$segredo_banco"):$(jq -r .port <<< "$segredo_banco")/$(jq -r .dbname <<< "$segredo_banco")?schema=public"
  mascarar "$DATABASE_URL"
}
