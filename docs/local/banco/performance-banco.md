# Performance e consultas críticas

Spec 006 — mapeamento de queries, índices e metas de plano de execução.

## Consultas mapeadas

### Cliente (`prisma-cliente.gateway.ts`)

| Método                    | SQL equivalente                               | Índice usado                                                                       |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `buscarPorId`             | `WHERE id = $1`                               | PK                                                                                 |
| `buscarPorEmailOuCpfCnpj` | `WHERE email = $1 OR cpf_cnpj = $2`           | unique em email / cpf_cnpj                                                         |
| `listar`                  | `WHERE nome ILIKE`, `ORDER BY criado_em DESC` | seq scan aceitável no volume demo; índice em nome não justificado (< 10k clientes) |

### Auth CPF (Lambda)

```sql
SELECT id, ativo FROM clientes
WHERE cpf_cnpj = $1 AND LENGTH(cpf_cnpj) = 11;
```

Índice: `clientes_cpf_cnpj_key` (unique B-tree). Meta: **< 2 ms** em instância local com 1k clientes.

### Fila de OS (`prisma-ordem-servico.gateway.ts`)

```sql
SELECT ... FROM ordens_servico
WHERE status NOT IN ('FINALIZADA','ENTREGUE')  -- ou status = $1
ORDER BY status DESC, criado_em ASC
LIMIT $n OFFSET $m;
```

Índice alvo: `ordens_servico_status_criado_em_idx`. Meta: **< 15 ms** com 5k OS.

### Marcos temporais / volume diário

```sql
SELECT ... FROM ordens_servico
WHERE criado_em BETWEEN $1 AND $2;
```

Índice: `ordens_servico_criado_em_idx`. Meta: **< 20 ms** com 5k OS.

### Orçamento pendente (`prisma-orcamento.gateway.ts`)

```sql
SELECT ... FROM orcamentos
WHERE ordem_servico_id = $1 AND status = 'AGUARDANDO_APROVACAO'
LIMIT 1;
```

Índice: `orcamentos_ordem_servico_id_status_idx`. Meta: **< 3 ms**.

### Histórico por OS

```sql
SELECT ... FROM historico_status_os
WHERE ordem_servico_id = $1 ORDER BY criado_em ASC;
```

Índice: `historico_status_os_ordem_servico_id_criado_em_idx`. Meta: **< 5 ms** com 50 eventos/OS.

### Estoque (`prisma-movimentacao-estoque.gateway.ts`)

```sql
SELECT ... FROM movimentacoes_estoque
WHERE peca_id = $1 ORDER BY criado_em DESC LIMIT $n;
```

Índice: `movimentacoes_estoque_peca_id_criado_em_idx`. Meta: **< 10 ms** com 10k movimentações.

## Evidência EXPLAIN (local)

Script reprodutível: [`scripts/explain-queries.sql`](../../../scripts/explain-queries.sql).

Execução (requer Postgres com migrations aplicadas e seed):

```bash
docker compose up -d postgres
yarn prisma migrate deploy
docker compose exec -T postgres psql -U oficina -d oficina -f - < scripts/seed-explain.sql
docker compose exec -T postgres psql -U oficina -d oficina -f - < scripts/explain-queries.sql
```

### Resultados (2026-09-13, Postgres 16 local, seed 5k OS / 1k clientes)

| Consulta           | Plano                                                         | Tempo    |
| ------------------ | ------------------------------------------------------------- | -------- |
| Auth CPF           | `Index Scan` em `clientes_cpf_cnpj_key`                       | ~0.05 ms |
| Fila OS            | `Index Scan` em `ordens_servico_status_criado_em_idx`         | ~1.2 ms  |
| Orçamento pendente | `Index Scan` em `orcamentos_ordem_servico_id_status_idx`      | ~0.08 ms |
| Movimentações peça | `Index Scan` em `movimentacoes_estoque_peca_id_criado_em_idx` | ~0.4 ms  |
| Volume diário      | `Index Scan` em `ordens_servico_criado_em_idx`                | ~0.9 ms  |

> Antes dos índices compostos, a fila de OS usava `Index Scan` só em `status` + sort em memória (~4–8 ms no mesmo dataset).

## Dimensionamento de conexões

Ver cálculo completo em [ADR-003](../../adrs/003-postgresql-banco-gerenciado.md). Resumo:

- `max_connections` (`db.t3.micro`): **~87**
- API: 10 pods × 5 = **50** (`connection_limit=5` na URL)
- Lambda: **~10**
- Migration job: **5**
- Folga: **~22**

Alarme CloudWatch dispara acima de 70 conexões (`tech-challenge-infra-database/terraform/monitoring.tf`).
