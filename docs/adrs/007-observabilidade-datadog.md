# ADR-007 — Observabilidade com Datadog

**Status:** aceito  
**Data:** 2026-09-13

## Contexto

R-18 a R-26 exigem ferramenta de observabilidade com logs JSON correlacionados, métricas de latência/recursos, dashboards de negócio e alertas para falhas de OS e integrações.

## Decisão

1. Adotar **Datadog** como plataforma única (logs, APM, métricas customizadas, dashboards, monitores).
2. Logs **JSON estruturados** com `correlationId`, `service`, `environment`, `traceId`/`spanId`.
3. **Sanitização** obrigatória — nunca logar JWT, CPF completo, senhas ou segredos.
4. **Agent Datadog** no EKS; forward de logs CloudWatch das Lambdas e API Gateway.
5. Dashboards e monitores provisionados via Terraform (`datadog-dashboards.tf`, `datadog-monitors.tf`).
6. Métricas de negócio via `OsMetricsService` (`oficina.ordem_servico.*`).

## Consequências

### Positivas

- Correlação ponta a ponta Gateway → API → SNS → Lambda (runbook dedicado).
- Dashboards técnicos, de negócio e de integrações versionados.
- Alertas para DLQ, Lambda errors e transição de OS falha.

### Negativas / trade-offs

- Custo SaaS estimado USD 70–165/mês (ambiente demo).
- Dependência de agent sidecar/daemon no cluster.

## Alternativas consideradas

| Alternativa          | Motivo de rejeição                                      |
| -------------------- | ------------------------------------------------------- |
| New Relic            | Equivalente; Datadog já integrado no Terraform entregue |
| CloudWatch apenas    | Dashboards de negócio e APM menos ergonômicos           |
| ELK self-hosted      | Operação e custo de cluster adicional                   |
| Grafana Cloud + Loki | Mais peças para correlacionar APM + logs                |

## Referências

- [observabilidade.md](../observabilidade.md)
- [runbooks/correlacao-observabilidade.md](../runbooks/correlacao-observabilidade.md)
- [diagramas/observabilidade.md](../diagramas/observabilidade.md)
