# Observabilidade

Plataforma: **Datadog** (logs JSON, APM, métricas customizadas, dashboards e alertas).

## Serviços instrumentados

| Serviço | Origem | Tags unified |
| --- | --- | --- |
| `oficina-api` | NestJS/Fastify no EKS | `env`, `service`, `version` |
| API Gateway | Access logs JSON (CloudWatch) | `correlationId` na borda |
| `auth-cpf` | Lambda | `NODE_ENV`, X-Ray |
| `notificacao` | Lambda SQS → SendGrid | `correlationId` nos logs |

## Catálogo de logs

| Campo | Descrição |
| --- | --- |
| `timestamp` | ISO-8601 UTC |
| `level` | info, warn, error, debug |
| `service` | `oficina-api` (ou nome da Function) |
| `environment` | `development`, `producao`, etc. |
| `version` | versão da imagem/deploy |
| `message` | evento (`request.started`, `request.completed`, …) |
| `correlationId` | jornada funcional (`X-Correlation-Id`) |
| `traceId` / `spanId` | trace APM Datadog |
| `route` | rota normalizada (`/v1/ordens-servico/:id`) |

**Nunca logar:** Authorization, JWT, senha, segredo, CPF completo, e-mail completo ou corpo bruto.

Sanitização na aplicação (`log-sanitizer.ts`) + regra de mascaramento no Datadog Agent.

## Catálogo de métricas

| Métrica | Tipo | Tags permitidas |
| --- | --- | --- |
| `oficina.ordem_servico.criada` | counter | `environment`, `service`, `status` |
| `oficina.ordem_servico.tempo_por_status` | distribution | `environment`, `service`, `status` |
| `oficina.ordem_servico.transicao_falha` | counter | `environment`, `service` |
| `oficina.integracao.falha` | counter | `environment`, `service`, `integration` |
| `oficina.integracao.latencia` | timing | `environment`, `service`, `integration`, `result` |

Status medidos: `EM_DIAGNOSTICO`, `EM_EXECUCAO`, `FINALIZADA` (inclui renegociação).

IDs de OS, cliente, veículo ou requisição **não** viram tags.

## Dashboards (Terraform)

Provisionados em `tech-challenge-infra-kubernetes/terraform/datadog-dashboards.tf`:

- **Técnico** — throughput, erros, latência p50/p95/p99, uptime, CPU, memória, réplicas, restarts
- **Negócio** — volume diário de OS, tempo médio por status
- **Integrações** — falhas/latência PostgreSQL, SNS/SQS, SendGrid, Lambda

URLs publicadas nos outputs Terraform (`datadog_dashboard_*_url`).

## Monitores

Provisionados em `datadog-monitors.tf`: taxa de erro HTTP, latência p95, uptime `/health`, ausência de APM, CPU/memória, pods, falha de OS, Lambda, SQS/DLQ e integrações.

Runbook de correlação: [runbooks/correlacao-observabilidade.md](runbooks/correlacao-observabilidade.md). ADR: [adrs/007-observabilidade-datadog.md](adrs/007-observabilidade-datadog.md).

## Retenção e custo estimado

| Fonte | Retenção | Estimativa mensal* |
| --- | --- | --- |
| Logs indexados | 15 dias (ajustável no Datadog) | ~USD 15–40 |
| Traces APM | 15 dias, amostragem 100% dev / 20% prod sugerida | ~USD 20–60 |
| Métricas customizadas | 15 meses | ~USD 5–15 |
| Infra/Kubernetes | incluso no host agent | ~USD 30–50 |

\*Estimativa acadêmica para 1 ambiente, 2 pods, tráfego moderado. Ajuste índices e amostragem no Datadog para controlar custo.

## Variáveis de ambiente

Ver `.env.example` e `k8s/configmap.yaml` / `k8s/deployment.yaml` (`DD_*`).

## Diagrama

Ver [diagramas/observabilidade.md](diagramas/observabilidade.md).
