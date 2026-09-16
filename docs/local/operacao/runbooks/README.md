# Runbooks

Procedimentos operacionais para incidentes e troubleshooting.

**Repositório fonte:** `tech-challenge/docs/runbooks/` (runbooks cross-cutting). Runbooks específicos de infra ficam nos repos de Terraform.

| Runbook | Escopo |
| --- | --- |
| [correlacao-observabilidade.md](correlacao-observabilidade.md) | Correlacionar Gateway → API → SNS → Lambda → SendGrid via `correlationId` |
| [backup-restore.md](../../../tech-challenge-infra-database/docs/backup-restore.md) | Restore de snapshot RDS _(fonte: infra-database)_ |
| [custo-e-teardown.md](../../../tech-challenge-infra-kubernetes/docs/custo-e-teardown.md) | Teardown seguro e estimativa de custos _(fonte: infra-kubernetes)_ |
