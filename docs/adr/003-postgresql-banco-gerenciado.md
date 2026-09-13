# ADR-003: PostgreSQL gerenciado no Amazon RDS

**Status:** aceito  
**Data:** 2026-09-13  
**Spec:** `006-banco-gerenciado-e-modelo-relacional`

## Contexto

A oficina precisa de persistência relacional com transações ACID (OS, orçamento, estoque), integridade referencial, consultas analíticas (tempo médio por status) e operação gerenciada com backup. A aplicação já usa Prisma sobre PostgreSQL.

## Decisão

Manter **PostgreSQL 16 no Amazon RDS** como banco gerenciado, provisionado em repositório Terraform dedicado (`tech-challenge-infra-database`), com schema e migrations no repositório da aplicação.

### Comparação com alternativas

| Critério | PostgreSQL (RDS) | DynamoDB | Aurora Serverless v2 |
| --- | --- | --- | --- |
| Transações multi-tabela (OS + itens + estoque) | Nativo (`BEGIN`/`COMMIT`) | Transações limitadas; modelagem NoSQL complexa | Nativo |
| Integridade relacional (FK, CHECK, UNIQUE) | Completa | Não | Completa |
| Consultas ad hoc / agregações temporais | SQL + índices B-tree | Requer GSIs e denormalização | SQL |
| Compatibilidade Prisma | Oficial | Adaptador limitado | Oficial |
| Operação gerenciada AWS | RDS (backup, patch, métricas) | Totalmente gerenciado | Gerenciado, custo maior |
| Custo ambiente demo | ~$15/mês (`db.t3.micro`) | Pay-per-request imprevisível | ~$45+/mês mínimo |
| Conexões concorrentes | Limitadas (~87 na micro) | Ilimitadas (HTTP) | Pool/RDS Proxy |

**Alternativas descartadas:**

- **DynamoDB:** exigiria reimplementar orçamento atômico, fila de OS e histórico como agregados/eventos; alto retrabalho sem ganho para o volume atual.
- **Aurora Serverless v2:** custo ~3× para demonstração; benefício real aparece com carga variável e múltiplos ambientes.
- **MySQL/MariaDB:** equivalente funcional, mas Prisma e equipe já padronizaram PostgreSQL; enums nativos e tipos JSON úteis para idempotência.

### Multi-AZ

**Decisão:** `db_multi_az = false` (Single-AZ).

O ambiente é único de demonstração/avaliação ([ADR-001](001-ambiente-unico-provisionado.md)). Multi-AZ dobraria o custo do RDS sem benefício proporcional ao RTO aceito (~45 min via restore de snapshot). Alta disponibilidade operacional vem de backups automáticos (retenção 7 dias) + teste de restauração documentado.

### RDS Proxy

**Decisão:** **não** provisionar RDS Proxy neste ambiente.

| Componente | Conexões máx. estimadas |
| --- | --- |
| API (HPA max 10 pods × `connection_limit=5`) | 50 |
| Lambda auth CPF (concorrência ~10) | 10 |
| Job migration (1 pod) | 5 |
| Reserva operacional | ~10 |
| **Total** | **~75** |
| `max_connections` (`db.t3.micro`) | **~87** |

Com `connection_limit=5` na `DATABASE_URL` ([deploy.yml](../../.github/workflows/deploy.yml)), o pico fica abaixo do limite com folga de ~12 conexões. RDS Proxy (~$15/mês + ACU) só se justificaria se o HPA subisse acima de 10 réplicas ou a concorrência Lambda crescesse materialmente.

### RPO e RTO

| Métrica | Meta | Fundamentação |
| --- | --- | --- |
| **RPO** | ≤ 24 h | Backup automático diário (janela 03:00–04:00 UTC), retenção 7 dias |
| **RTO** | ≤ 45 min | Restore de snapshot em instância temporária + validação + cutover DNS/SSM (runbook em `tech-challenge-infra-database/docs/backup-restore.md`) |

## Consequências

- Schema evolui via Prisma migrations; infra evolui via Terraform separado.
- Credenciais só no Secrets Manager; aplicação e Lambda consomem ARN via SSM.
- TLS obrigatório no RDS (`rds.force_ssl=1`); app usa `DATABASE_SSL=true` no cluster.
- Destruição acidental bloqueada: `deletion_protection` + snapshot final obrigatório em produção.

## Referências

- [modelo-relacional.md](../modelo-relacional.md)
- [performance-banco.md](../performance-banco.md)
- [diagramas/modelo-relacional-er.md](../diagramas/modelo-relacional-er.md)
- Repositório Terraform: `tech-challenge-infra-database`
