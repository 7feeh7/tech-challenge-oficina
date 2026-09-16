# Banco de dados

Documentação do modelo relacional, performance e operação do PostgreSQL gerenciado.

**Schema e migrations (fonte de verdade):** `tech-challenge/prisma/`.  
**Infraestrutura RDS (fonte de verdade):** `tech-challenge-infra-database/`.

| Documento | Repositório | Conteúdo |
| --- | --- | --- |
| [modelo-relacional.md](modelo-relacional.md) | tech-challenge | Entidades, FKs, constraints e decisões de integridade |
| [diagramas/modelo-relacional-er.md](../../diagramas/modelo-relacional-er.md) | tech-challenge | Diagrama ER versionável (Mermaid) |
| [performance-banco.md](performance-banco.md) | tech-challenge | Consultas críticas, índices e metas EXPLAIN |
| [migrations-compatibilidade.md](migrations-compatibilidade.md) | tech-challenge | RollingUpdate, backfill e rollback |
| [rfcs/002-postgresql-rds.md](../../rfcs/002-postgresql-rds.md) | tech-challenge | Justificativa formal da escolha PostgreSQL/RDS |
| [adrs/003-postgresql-banco-gerenciado.md](../../adrs/003-postgresql-banco-gerenciado.md) | tech-challenge | Decisão aceita: RDS, Multi-AZ, RPO/RTO |
| [backup-restore.md](../../../../tech-challenge-infra-database/docs/backup-restore.md) | infra-database | Backup, restore e troubleshooting |
