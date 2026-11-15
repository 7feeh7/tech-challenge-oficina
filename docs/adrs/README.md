# ADRs — Architecture Decision Records

Decisões arquiteturais **aceitas** e permanentes. Para propostas em discussão, veja [RFCs](../rfcs/README.md).

Índice de arquitetura: [../README.md](../README.md).  
Template: [TEMPLATE.md](TEMPLATE.md).

| ADR | Título | Status | Data |
| --- | --- | --- | --- |
| [001](001-ambiente-unico-provisionado.md) | Ambiente único provisionado | aceito | 2026-09-07 |
| [002](002-api-gateway-borda-unica.md) | API Gateway como borda única | aceito | 2026-09-13 |
| [003](003-postgresql-banco-gerenciado.md) | PostgreSQL gerenciado no RDS | aceito | 2026-09-13 |
| [004](004-comunicacao-sincrona-assincrona.md) | HTTP síncrono + eventos assíncronos | aceito | 2026-09-13 |
| [005](005-kubernetes-eks-hpa.md) | Kubernetes EKS com HPA | aceito | 2026-09-13 |
| [006](006-separacao-quatro-repositorios.md) | Separação em quatro repositórios | substituído | 2026-09-13 |
| [007](007-observabilidade-datadog.md) | Observabilidade com Datadog | aceito | 2026-09-13 |
| [008](008-divisao-em-microsservicos.md) | Divisão em microsserviços (Fase 4) | aceito | 2026-11-15 |
| [009](009-saga-orquestrada.md) | Saga orquestrada no OS Service | aceito | 2026-11-15 |
| [010](010-mensageria-sqs-outbox.md) | Mensageria com SQS Standard e Transactional Outbox | aceito | 2026-11-15 |
| [011](011-persistencia-poliglota.md) | Persistência poliglota | aceito | 2026-11-15 |
| [012](012-mercado-pago-orders.md) | Integração com Mercado Pago via Orders API | aceito | 2026-11-15 |
| [013](013-seguranca-entre-servicos.md) | Segurança entre serviços | aceito | 2026-11-15 |
| [014](014-observabilidade-distribuida.md) | Observabilidade distribuída | aceito | 2026-11-15 |
| [015](015-virada.md) | Estratégia de virada do monólito para microsserviços | aceito | 2026-11-15 |

## Supersessão

| ADR substituída | Substituída por |
| --- | --- |
| [ADR-006](006-separacao-quatro-repositorios.md) | [ADR-008](008-divisao-em-microsservicos.md) |
