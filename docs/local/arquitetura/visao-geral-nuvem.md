# Visão geral — arquitetura em nuvem (Fase 3)

Solução distribuída em **quatro repositórios** com um único ambiente provisionado (`producao`). Entrada pública exclusiva pelo **API Gateway**; tráfego interno permanece na VPC privada.

## Diagrama de componentes

Ver fonte versionada em [diagramas/componentes-nuvem.md](../../diagramas/componentes-nuvem.md).

## Repositórios e fronteiras

| Repositório | Artefatos | Deploy |
| --- | --- | --- |
| `tech-challenge` | API NestJS, Prisma, `k8s/`, `docs/` | CI → ECR → EKS |
| `tech-challenge-serverless` | Handlers Lambda (auth CPF, notificação) | CI → S3 → update Function |
| `tech-challenge-infra-kubernetes` | VPC, EKS, ECR, Gateway, SNS/SQS, Datadog | Terraform apply |
| `tech-challenge-infra-database` | RDS PostgreSQL, Secrets Manager | Terraform apply |

Contrato cross-repo: **outputs Terraform + parâmetros SSM** (`/tech-challenge/producao/*`). Valores nunca copiados manualmente entre repositórios.

## Fluxo de requisição típico

1. Consumidor → **API Gateway** (HTTPS, CORS, throttling, access logs).
2. `POST /auth/cpf` → **Lambda auth-cpf** (VPC) → Secrets Manager → **RDS**.
3. Rotas `/v1/*` → **VPC Link** → **NLB interno** → **EKS** (NodePort 30080) → **RDS**.
4. Mudança de status OS → **SNS** → **SQS** → **Lambda notificação** → **SendGrid**.
5. Telemetria → **CloudWatch** + **Datadog Agent** (EKS) + forward de logs Lambda.

## Decisões relacionadas

- [ADR-001](../../adrs/001-ambiente-unico-provisionado.md) — ambiente único
- [ADR-002](../../adrs/002-api-gateway-borda-unica.md) — borda única
- [ADR-006](../../adrs/006-separacao-quatro-repositorios.md) — segregação de repos
- [RFC-001](../../rfcs/001-escolha-aws.md) — escolha AWS

## Referências externas (fonte de verdade por repo)

| Tópico | Documento | Repositório |
| --- | --- | --- |
| Contratos SSM | [contratos-cross-repo.md](../../../../tech-challenge-infra-kubernetes/docs/contratos-cross-repo.md) | infra-kubernetes |
| Contrato auth CPF | [contrato-auth-cpf.md](../../../../tech-challenge-serverless/docs/contrato-auth-cpf.md) | serverless |
| Contrato evento notificação | [contrato-evento-notificacao.md](../../../../tech-challenge-serverless/docs/contrato-evento-notificacao.md) | serverless |
| Backup/restore RDS | [backup-restore.md](../../../../tech-challenge-infra-database/docs/backup-restore.md) | infra-database |
