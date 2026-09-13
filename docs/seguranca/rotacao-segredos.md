# Rotação de Segredos

## Inventário

| Segredo | Onde vive | Consumidores |
| --- | --- | --- |
| JWT | Secrets Manager `jwt-secret-*` | Lambda auth, API EKS (K8s Secret via CI) |
| RDS | Secrets Manager (repo database) | Lambda, API, migrations |
| SendGrid | Secrets Manager | Lambda notificação |
| ADMIN_SENHA | GitHub Environment `producao` | API login interno |
| TF state | S3 + DynamoDB | Pipelines infra |

## Procedimento — JWT

1. Gerar novo valor (`openssl rand -base64 48`).
2. Atualizar versão no Secrets Manager (Terraform `jwt_secret` no apply ou console).
3. Redeploy infra-kubernetes (Lambda) e tech-challenge (K8s Secret).
4. **Efeito:** tokens emitidos antes da rotação invalidam na próxima validação (mesmo secret simétrico). Clientes reautenticam por CPF.
5. Smoke: `POST /auth/cpf` → token → `GET /v1/auth/me`.

## Procedimento — RDS

1. Rotacionar via Secrets Manager (managed rotation ou manual).
2. Jobs `update-lambda` nos repos database/kubernetes atualizam `DB_SECRET_ARN`.
3. Redeploy app (K8s Secret `DATABASE_URL`).

## Procedimento — SendGrid

1. Revogar chave antiga no painel SendGrid após criar nova.
2. `terraform apply` infra-kubernetes com novo `sendgrid_api_key`.

## Bootstrap OIDC

1. **Último** apply com access key (se necessário) cria roles em `github-oidc.tf`.
2. Publicar ARNs no GitHub Environment `producao` como `AWS_DEPLOY_ROLE_ARN` (um por repo).
3. Revogar access keys estáticas.
4. Validar: deploy em `main` assume role; workflow em `develop` com `environment: producao` falha (deployment branch policy).

## Teste de rotação (ensaio)

Executar em janela combinada com seed sintético. Registrar data e responsável em `evidence/rotacao-YYYYMMDD.md` (sem valores de segredo).
