# Runbook: subir o projeto em produção

Regra: só `main` cria ou altera AWS. `develop` verde só prova lint/testes. Merge em `main` dispara o deploy.

Espere cada pipeline **Deploy** ficar verde antes de mergear o próximo PR.

```text
0. Mão (AWS + GitHub)     — uma vez
1. infra-kubernetes       — PR develop → main
2. infra-database         — PR develop → main
3. serverless             — PR develop → main
4. tech-challenge (app)   — PR develop → main
5. Conferir + seed demo   — mão
```

---

## 0. Uma vez, na mão (antes de qualquer PR para `main`)

### 0.1 Conta AWS (`us-east-1`)

1. Criar bucket S3 de state do Terraform. Nome único no mundo, exemplo: `tech-challenge-terraform-state-SEUUSUARIO`.
2. Criar tabela DynamoDB de lock:
   - **Nome exato:** `tech-challenge-terraform-lock`
   - Partition key: `LockID` (String)
   - Billing: on-demand (padrão)
3. Anotar os dois nomes.

> **Atenção:** o nome da tabela é `tech-challenge-terraform-lock`, **sem** `-state-` no meio. Se usar `tech-challenge-terraform-state-lock`, o `terraform apply` falha com `ResourceNotFoundException` ao adquirir o lock.

### 0.2 Contas externas

- **SendGrid:** API key + remetente verificado (`sendgrid_from_email`). Sem isso, e-mail de OS não sai.
- **Datadog:** API Key + App Key. **Obrigatórias** no apply do kubernetes (local e CI): o provider Terraform exige as duas keys mesmo que você não use dashboards ainda.
- **JWT:** `openssl rand -hex 32` (ou `openssl rand -base64 48`). Guardar o texto — **não regenere** depois do 1º apply.
- **ADMIN_SENHA:** senha do admin da oficina (seed/demo).
- **Bucket de ZIPs Lambda:** nome único, exemplo: `tech-challenge-lambda-artifacts` ou `tech-challenge-lambda-artifacts-producao`. Use o **mesmo** nome no `terraform.tfvars`, no secret `LAMBDA_ARTIFACTS_BUCKET` e na AWS.

### 0.3 GitHub — os 4 repositórios

Em cada repo: Settings → Environments → criar `producao`.

- Deployment branches: **somente `main`**.
- Required reviewers: ligar.

Em cada repo: Settings → Branches → proteger `main`:

- Sem push direto
- Exigir PR + 1 aprovação
- Status check: `PR Validation`

### 0.4 Secrets no Environment `producao`

Não coloque secret de nuvem no nível Repository. Só no Environment `producao`.

**Os 4 repos**

| Secret | O que colar |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | ARN da role OIDC (passo 0.5) |

**Só `tech-challenge-infra-kubernetes`**

| Secret | O que colar |
| --- | --- |
| `TF_STATE_BUCKET` | bucket S3 do passo 0.1 (ex.: `tech-challenge-terraform-state-7feeh7`) |
| `TF_STATE_LOCK_TABLE` | **`tech-challenge-terraform-lock`** — nome exato da tabela do passo 0.1 |
| `JWT_SECRET` | output do `openssl` |
| `SENDGRID_API_KEY` | key SendGrid |
| `LAMBDA_ARTIFACTS_BUCKET` | nome do bucket do passo 0.2 |
| `DB_SECRET_ARN` | vazio no 1º apply |
| `DATADOG_API_KEY` | API Key Datadog (obrigatória no apply) |
| `DATADOG_APP_KEY` | App Key Datadog (obrigatória no apply) |

**Só `tech-challenge-infra-database`**

| Secret | O que colar |
| --- | --- |
| `TF_STATE_BUCKET` | o mesmo bucket do passo 0.1 |
| `TF_STATE_LOCK_TABLE` | **`tech-challenge-terraform-lock`** — a mesma tabela |

**Só `tech-challenge-oficina` (este repo)**

| Secret | O que colar |
| --- | --- |
| `ADMIN_SENHA` | senha do admin da demo |

**Só `tech-challenge-serverless`**

Só `AWS_DEPLOY_ROLE_ARN` (depois do 0.5).

`SONAR_TOKEN` fica no repositório (validação, não deploy).

### 0.5 Primeiro apply do kubernetes (ovo-e-galinha)

O `deploy.yml` assume `AWS_DEPLOY_ROLE_ARN`. Essa role só nasce no primeiro `terraform apply` do kubernetes.

Se a AWS ainda está vazia:

1. AWS CLI logado (IAM temporário com permissão ampla):

   ```bash
   aws configure   # ou export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
   ```

2. Em `tech-challenge-infra-kubernetes/terraform`, criar `terraform.tfvars` (**não commitar** — já está no `.gitignore`):

   ```hcl
   environment         = "producao"
   jwt_secret          = "SEU_JWT_GERADO_NO_OPENSSL"
   sendgrid_api_key    = "SG...."
   sendgrid_from_email = "seu-remetente@dominio.com"   # verificado no SendGrid
   lambda_s3_bucket    = "tech-challenge-lambda-artifacts"
   datadog_api_key     = "..."
   datadog_app_key     = "ddapp_..."
   ```

   Referência: `terraform.tfvars.example` no mesmo diretório.

3. `terraform init` com o **mesmo backend** que o CI usa (`deploy.yml`):

   ```bash
   cd tech-challenge-infra-kubernetes/terraform

   terraform init \
     -backend-config="bucket=SEU_BUCKET_S3" \
     -backend-config="key=tech-challenge-infra-kubernetes/producao/terraform.tfstate" \
     -backend-config="dynamodb_table=tech-challenge-terraform-lock" \
     -backend-config="region=us-east-1" \
     -backend-config="encrypt=true"
   ```

   > **Atenção:** a `key` do state deve ser exatamente `tech-challenge-infra-kubernetes/producao/terraform.tfstate`. Outro valor (ex.: `infra-kubernetes/...`) cria um state paralelo e o CI não enxerga o que você subiu na mão.

   Se já rodou `init` com parâmetros errados, corrija e rode `terraform init -reconfigure ...`.

4. `terraform apply` (EKS leva ~15–20 min). Aviso `dynamodb_table is deprecated` pode ignorar.

5. Parameter Store — copiar:

   - `/tech-challenge/producao/infra/github_role_infra_kubernetes_arn`
   - `/tech-challenge/producao/infra/github_role_infra_database_arn`
   - `/tech-challenge/producao/infra/github_role_serverless_arn`
   - `/tech-challenge/producao/infra/github_role_app_arn`

6. Colar cada ARN em `AWS_DEPLOY_ROLE_ARN` do Environment `producao` do repo certo.

7. Apagar as access keys IAM usadas no apply local.

Se a infra já existe: pule o apply local. Só copie os 4 ARNs do Parameter Store.

---

## 1. PR 1 — `tech-challenge-infra-kubernetes`

Abrir: https://github.com/7feeh7/tech-challenge-infra-kubernetes/compare/main...develop?expand=1

1. PR `develop` → `main`.
2. **PR Validation** verde.
3. Merge.
4. Aprovar deploy no Environment `producao`.
5. Workflow **Deploy Infrastructure** verde.

Conferir no Parameter Store:

- `/tech-challenge/producao/infra/vpc_id`
- `/tech-challenge/producao/infra/eks_cluster_name`
- `/tech-challenge/producao/infra/ecr_repository_url`
- `/tech-challenge/producao/infra/lambda_auth_function_name`

Sem esses quatro, não abra o merge do database.

---

## 2. PR 2 — `tech-challenge-infra-database`

Abrir: https://github.com/7feeh7/tech-challenge-infra-database/compare/main...develop?expand=1

1. PR `develop` → `main`.
2. Validation verde → merge → aprovar Environment.
3. Deploy verde, inclusive o job `update-lambda`.

**Cuidado:** Actions → Run workflow neste repo tem default **`destroy`**. Não clique. Só merge de PR.

Conferir:

- `/tech-challenge/producao/database/db_secret_arn`
- `/tech-challenge/producao/database/rds_endpoint`

---

## 3. PR 3 — `tech-challenge-serverless`

Abrir: https://github.com/7feeh7/tech-challenge-serverless/compare/main...develop?expand=1

1. PR `develop` → `main`.
2. Validation verde → merge → aprovar Environment.
3. Deploy verde (código das Lambdas `auth-cpf` e `notificacao`).

Sem o kubernetes (passo 1), este deploy quebra.

---

## 4. PR 4 — `tech-challenge-oficina` (app)

Abrir: https://github.com/7feeh7/tech-challenge-oficina/compare/main...develop?expand=1

1. PR `develop` → `main`.
2. Validation verde → merge → aprovar Environment.
3. Pipeline: testes → imagem ECR → Job Prisma → rollout EKS → smoke `/health/ready`.

Conferir:

- Parameter Store `/tech-challenge/producao/infra/api_gateway_url`
- Browser: `{url}/health` e `{url}/docs`

---

## 5. Seed (mão, depois dos 4 deploys verdes)

```bash
# neste repo, com a API no ar
./scripts/seed-demo.sh
```

Sem seed, a API sobe vazia. Nunca rode isso no CI.

---

## Se algo falhar

| Sintoma | Causa típica |
| --- | --- |
| `Error acquiring the state lock` + `ResourceNotFoundException` (DynamoDB) | `TF_STATE_LOCK_TABLE` ou `-backend-config dynamodb_table` com nome errado — use `tech-challenge-terraform-lock` |
| `api_key and app_key or orgUUID must be set` (provider datadog) | faltam `datadog_api_key` / `datadog_app_key` no `terraform.tfvars` (apply local) ou nos secrets do GitHub (CI) |
| CI recria infra do zero após apply local | `key` do backend S3 diferente da do `deploy.yml` — deve ser `tech-challenge-infra-kubernetes/producao/terraform.tfstate` |
| `sts:AssumeRoleWithWebIdentity` | `AWS_DEPLOY_ROLE_ARN` vazio ou errado — volte ao 0.5 |
| Database: SSM não encontrado | kubernetes ainda não publicou `infra/*` |
| Serverless: function not found | kubernetes não criou o casco das Lambdas |
| App: Job de migration falhou | RDS do passo 2 ausente ou `db_secret_arn` vazio |
| App: 401 em tudo | JWT regenerado depois do apply — não gere de novo |
| E-mail de OS não enviado | `sendgrid_from_email` não verificado no SendGrid ou API key inválida |
| `Unable to find Route by key POST /auth/cpf` (API Gateway stage) | race entre stage e rota — código atual usa `depends_on`; rode `terraform apply` de novo |
| `Requested AMI for this version 1.30 is not supported` (EKS node group) | versão K8s sem AMI na AWS — use `kubernetes_version = "1.31"` (upgrade de 1 minor por vez) |

Rollback da app: PR revert em `main`. Destroy de infra: `workflow_dispatch` com `destroy`. Ordem: database depois kubernetes.

## O que você não precisa

- Terraform na mão depois do 0.5
- `AWS_ACCESS_KEY_ID` permanente
- Environment `homologacao`
- Mergear os 4 PRs no mesmo minuto
