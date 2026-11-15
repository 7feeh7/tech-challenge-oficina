# ADR-011 — Persistência poliglota

**Status:** aceito  
**Data:** 2026-11-15

## Contexto

Cada serviço tem padrões de acesso e requisitos de consistência distintos. O OS Service e o Billing Service lidam com dinheiro, transações ACID e relacionamentos complexos entre entidades. O Execution Service lida com tarefas efêmeras, alta taxa de escrita e baixa necessidade de joins. ADR-003 escolheu PostgreSQL para a Fase 3; a Fase 4 acrescenta DynamoDB para o Execution (R4-13, R4-14). Uma ADR nova é necessária para justificar a persistência poliglota (D5.1).

## Decisão

| Serviço | Banco | Instância |
| --- | --- | --- |
| OS Service | PostgreSQL, database `oficina` | RDS existente (P4, D5.1) |
| Billing Service | PostgreSQL, database `billing` | Mesma instância RDS, isolamento lógico (D5.1, D5.6, P3) |
| Execution Service | DynamoDB | Sem RDS (D5.1, D5.2) |

**Por que PostgreSQL para OS e Billing?** Transações ACID são essenciais para a consistência do estoque (D1.14), idempotência com Unit of Work (D3.16) e operações financeiras. O Prisma 7 com `PrismaPg` é preservado no OS; o Billing o replica (D8.8).

**Por que DynamoDB para o Execution?** As tarefas têm acesso por chave primária, escrita condicional atômica (`TransactWriteItems`) e não exigem joins. Capacidade sob demanda, sem gerenciamento de instância (D5.2). Três tabelas: tarefas, outbox e mensagens processadas.

**Isolamento entre serviços** (D0.4, P3): sem acesso cross-database; cada serviço tem credenciais próprias; a propriedade dos objetos de `oficina` é transferida ao usuário do OS (D5.3).

**Pool de conexões** (D5.5): uma única instância de `PrismaClient` por processo; pool configurado explicitamente; timeout de conexão explícito.

| Serviço | Réplicas | Pool por processo |
| --- | --- | --- |
| OS | mín. 1, máx. 6 | 5 |
| Billing | mín. 1, máx. 3 | 5 |

**Migrations destrutivas** separadas e condicionadas à autorização do autor (D5.4). Sem restauração automática do RDS. Reset do database `oficina` autorizado para a virada (D9.2).

**Proteção do DynamoDB**: proteção contra exclusão habilitada; sem TTL em mensagens processadas nem em bloqueios de cancelamento (D5.2).

## Consequências

### Positivas

- PostgreSQL garante ACID onde há dinheiro e estoque — sem risco de inconsistência financeira.
- DynamoDB simplifica o Execution: acesso por chave, sem gerenciamento de instância, escalabilidade automática.
- Instância RDS compartilhada reduz custo (trade-off consciente: D5.6).
- Sem RDS Proxy e sem instância adicional nesta fase (D0.3).

### Negativas / trade-offs

- Instância RDS compartilhada: domínio de falha comum entre OS e Billing (D5.6, P3).
- Dois paradigmas de acesso a dados aumentam a superfície de aprendizado.
- Sem backups automáticos por serviço; backup lógico condicionado à autorização do autor antes de migrations destrutivas (D5.4).

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| PostgreSQL para todos os três serviços | Não atende R4-14; padrões de acesso do Execution favorecem NoSQL |
| MongoDB para Execution | DynamoDB já disponível na AWS; sem custo adicional; melhor integração IAM |
| Instâncias RDS separadas para OS e Billing | Custo maior; D5.1, D5.6 |
| RDS Proxy | Custo; não necessário nesta fase; D0.3, D5.1 |

## Referências

- [`decisoes.md`](../../spec/fase-4/decisoes.md): D5.1–D5.6, D0.3, D0.4, P3
- [04-database.md](../../spec/fase-4/04-database.md)
- [ADR-003](003-postgresql-banco-gerenciado.md)
