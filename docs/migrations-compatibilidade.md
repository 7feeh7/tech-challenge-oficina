# Compatibilidade de migrations e deploy

## Executor único

`prisma migrate deploy` roda **uma vez por release** no Job Kubernetes [`k8s/migration-job.yaml`](../k8s/migration-job.yaml), antes do rollout da API. Pods da API **não** executam migrations no boot.

## RollingUpdate

Estratégia do Deployment: `maxUnavailable: 0`, `maxSurge: 1`.

| Fase | Comportamento |
| --- | --- |
| 1. Job migration | Aplica migrations pendentes; falha aborta o pipeline |
| 2. Rollout | Novos pods sobem com código + schema compatível |
| 3. Pods antigos | Continuam servindo até readiness dos novos |

### Compatibilidade versão antiga ↔ nova (migration 006)

| Mudança | Compatível com app anterior? |
| --- | --- |
| Novos índices | Sim (só performance) |
| CHECK constraints | Sim, se app já validava domínio |
| UNIQUE em junções | **Cuidado:** app antiga que inserisse duplicata falharia |
| FK movimentação → OS | Sim; `ordem_servico_id` nullable |

**Regra:** deploy sempre migration-first na mesma release que usa os novos constraints. Não há app antiga em produção após rollout completo.

## Backfill

| Campo | Estratégia |
| --- | --- |
| `clientes.ativo` | `DEFAULT true` na coluna (migration `20260913140000`) |
| Duplicatas junção | DELETE deduplicando antes do UNIQUE (migration `20260913180000`) |

## Rollback

| Cenário | Ação |
| --- | --- |
| Migration falhou no Job | Pipeline para; versão anterior permanece; corrigir migration e redeploy |
| App com defeito pós-migration | `kubectl rollout undo deployment/oficina-api` — schema permanece (roll-forward preferível) |
| Migration irreversível em produção | Restaurar RDS de snapshot (runbook em `tech-challenge-infra-database/docs/backup-restore.md`) |

## Testes locais

```bash
# Banco vazio
docker compose up -d postgres
yarn prisma migrate deploy

# Simular upgrade (aplicar até penúltima, seed, aplicar última)
yarn prisma migrate resolve --applied 20260913180000_modelo_relacional_006  # se necessário reset
```

Testes de integração dos gateways: `yarn test` (mocks) e `yarn test:e2e` com Postgres real.
