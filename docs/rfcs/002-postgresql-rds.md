# RFC-002 — PostgreSQL/RDS e modelo relacional

**Status:** aceito  
**Autores:** equipe Tech Challenge  
**Revisores:** —  
**Data:** 2026-09-13  
**ADR relacionado:** [ADR-003](../adrs/003-postgresql-banco-gerenciado.md)

## Contexto

A oficina modela OS, orçamentos, estoque e histórico com integridade referencial e transações multi-tabela. A aplicação usa Prisma sobre PostgreSQL desde a Fase 1.

## Proposta

1. Manter **PostgreSQL 16** como SGBD.
2. Provisionar instância **Amazon RDS** em repositório dedicado (`tech-challenge-infra-database`).
3. Evoluir schema via **Prisma migrations** no repositório da aplicação.
4. Aplicar ajustes: `clientes.ativo`, UNIQUE em tabelas de junção, CHECK constraints, índices documentados.

## Alternativas consideradas

| Alternativa                    | Prós                                         | Contras                                            |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------- |
| **PostgreSQL RDS** (escolhida) | ACID; FK/CHECK; Prisma nativo; SQL analítico | Limite de conexões na micro                        |
| **DynamoDB**                   | Escala horizontal; pay-per-use               | Modelagem NoSQL para OS/orçamento/estoque complexa |
| **Aurora Serverless v2**       | Auto-scale; compatível PostgreSQL            | ~3× custo para demo                                |
| **MySQL RDS**                  | Equivalente relacional                       | Enums e tipos JSON menos ergonômicos no Prisma     |

Detalhamento comparativo: [ADR-003](../adrs/003-postgresql-banco-gerenciado.md).

## Consequências

### Positivas

- Transação atômica na abertura/atualização de OS (itens + histórico).
- Diagrama ER e migrations versionados e verificáveis.
- Backup automático RDS com RPO ≤ 24 h.

### Negativas / trade-offs

- Single-AZ na demo (sem Multi-AZ) — RTO via restore manual.
- Sem RDS Proxy — exige `connection_limit` na URL Prisma.

## Riscos

| Risco                                    | Mitigação                                                         |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Esgotamento de conexões                  | HPA max 10 × limit 5 + Lambda ~10 < 87 max                        |
| Migration incompatível com RollingUpdate | [migrations-compatibilidade.md](../local/banco/migrations-compatibilidade.md) |

## Discussão e conclusão

Alternativas NoSQL ou Aurora foram descartadas por custo ou retrabalho. Decisão promovida à ADR-003 com parâmetros operacionais (Multi-AZ, Proxy, RPO/RTO).

## Referências

- [modelo-relacional.md](../local/banco/modelo-relacional.md)
- [diagramas/modelo-relacional-er.md](../diagramas/modelo-relacional-er.md)
- [banco/README.md](../local/banco/README.md)
- `tech-challenge/prisma/schema.prisma`
