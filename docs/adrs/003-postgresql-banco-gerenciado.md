# ADR-003 — PostgreSQL gerenciado no Amazon RDS

**Status:** aceito  
**Data:** 2026-09-13  
**RFC relacionada:** [RFC-002](../rfcs/002-postgresql-rds.md)

## Contexto

A oficina precisa de persistência relacional com transações ACID (OS, orçamento, estoque), integridade referencial, consultas analíticas (tempo médio por status) e operação gerenciada com backup. A aplicação já usa Prisma sobre PostgreSQL.

## Decisão

Manter **PostgreSQL 16 no Amazon RDS** como banco gerenciado, provisionado em repositório Terraform dedicado (`tech-challenge-infra-database`), com schema e migrations no repositório da aplicação.

### Multi-AZ

**Decisão:** `db_multi_az = false` (Single-AZ) — ambiente único de demonstração ([ADR-001](001-ambiente-unico-provisionado.md)).

### RDS Proxy

**Decisão:** **não** provisionar RDS Proxy neste ambiente. Pico ~75 conexões vs ~87 max na `db.t3.micro` com `connection_limit=5`.

### RPO e RTO

| Métrica | Meta                                    |
| ------- | --------------------------------------- |
| **RPO** | ≤ 24 h (backup diário, retenção 7 dias) |
| **RTO** | ≤ 45 min (restore + cutover SSM)        |

## Alternativas consideradas

| Alternativa          | Motivo de rejeição                                         |
| -------------------- | ---------------------------------------------------------- |
| DynamoDB             | Retrabalho de modelagem; transações multi-tabela complexas |
| Aurora Serverless v2 | Custo ~3× para demo                                        |
| MySQL/MariaDB        | Equipe e Prisma já padronizados em PostgreSQL              |

Comparação detalhada: [RFC-002](../rfcs/002-postgresql-rds.md).

## Consequências

- Schema evolui via Prisma migrations; infra evolui via Terraform separado.
- Credenciais só no Secrets Manager; aplicação e Lambda consomem ARN via SSM.
- TLS obrigatório no RDS (`rds.force_ssl=1`); app usa `DATABASE_SSL=true` no cluster.

## Referências

- [banco/README.md](../banco/README.md)
- [modelo-relacional.md](../modelo-relacional.md)
- [diagramas/modelo-relacional-er.md](../diagramas/modelo-relacional-er.md)
