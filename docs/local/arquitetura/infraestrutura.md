# Infraestrutura — Fase 3

Solução em **quatro repositórios** na AWS, com entrada pelo **API Gateway**, API no **EKS**, Functions **Lambda**, mensageria **SNS/SQS**, banco **RDS PostgreSQL** e observabilidade **Datadog**.

Visão arquitetural completa: [visao-geral-nuvem.md](visao-geral-nuvem.md) e [diagramas/componentes-nuvem.md](../../diagramas/componentes-nuvem.md).

## Objetivos

- **Infraestrutura escalável** com EKS, HPA (2–10 pods) e Cluster Autoscaler.
- **Provisionamento automatizado** via Terraform segregado (kubernetes + database).
- **Deploy automatizado** por CI/CD na branch `main` ([ADR-001](../../adrs/001-ambiente-unico-provisionado.md)).
- **Borda única** no API Gateway ([ADR-002](../../adrs/002-api-gateway-borda-unica.md)).
- **Banco gerenciado** RDS PostgreSQL 16 ([ADR-003](../../adrs/003-postgresql-banco-gerenciado.md)).

## Repositórios

| Repositório | Recursos |
| --- | --- |
| `tech-challenge-infra-kubernetes` | VPC, EKS, ECR, API Gateway, Lambda shell, SNS/SQS, Datadog |
| `tech-challenge-infra-database` | RDS, Secrets Manager, SG, alarmes |
| `tech-challenge-serverless` | Código Lambda auth-cpf e notificacao |
| `tech-challenge` (este) | API NestJS, Prisma, manifests `k8s/` |

Contrato cross-repo: parâmetros SSM `/tech-challenge/producao/*` — ver [ADR-006](../../adrs/006-separacao-quatro-repositorios.md).

## Ordem de provisionamento

1. `tech-challenge-infra-kubernetes` — `terraform apply`
2. `tech-challenge-infra-database` — consome SSM do passo 1
3. `tech-challenge-serverless` + `tech-challenge` — deploy via CI após SSM disponível

## Serviços AWS

| Serviço | Função |
| --- | --- |
| **API Gateway (HTTP API)** | Entrada pública: `/auth/cpf`, `/v1/*`, `/health`, `/docs` |
| **Lambda** | Auth CPF e notificação por e-mail |
| **EKS + HPA** | API NestJS containerizada |
| **ECR** | Imagens Docker |
| **RDS PostgreSQL 16** | Banco privado, TLS obrigatório |
| **SNS / SQS / DLQ** | Notificações assíncronas |
| **Secrets Manager** | Credenciais DB, JWT, SendGrid |
| **CloudWatch + Datadog** | Logs, métricas, APM, alertas |

## Conexão com o banco

O RDS recusa conexão sem TLS (`rds.force_ssl`). A aplicação usa `DATABASE_SSL=true` no ConfigMap. Localmente (`docker compose`) TLS fica desligado.

**Migrations:** Job Kubernetes ([k8s/migration-job.yaml](../../../k8s/migration-job.yaml)), uma vez por deploy — não no boot de cada pod (HPA).

## Escalabilidade (HPA)

`HorizontalPodAutoscaler`: **2 a 10 pods**, CPU 70%, memória 80%. Ver [ADR-005](../../adrs/005-kubernetes-eks-hpa.md) e [k8s/README.md](../../../k8s/README.md).

Demonstração local:

```bash
bash scripts/k8s-local.sh
kubectl get hpa -n oficina -w
npx autocannon -c 100 -d 120 http://localhost/health
```

## Execução local

```bash
cp .env.example .env
docker compose up --build
```

API: `http://localhost:3000`, Swagger: `http://localhost:3000/docs`. Detalhes em [configuracao.md](../api/configuracao.md).

## Documentação relacionada

- Pipeline: [ci-cd.md](../operacao/ci-cd.md)
- Rotas Gateway: [gateway-rotas.md](../api/gateway-rotas.md)
- Swagger produção: `{api_gateway_url}/docs` (SSM `api_gateway_url`)
- Teardown: [custo-e-teardown.md](../../../../tech-challenge-infra-kubernetes/docs/custo-e-teardown.md)

> **Custos:** EKS, NAT Gateway e RDS geram custo enquanto ligados. Use `workflow_dispatch` → destroy nos repos de infra após a demonstração.
