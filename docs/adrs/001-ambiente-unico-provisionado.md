# ADR-001 — Ambiente único provisionado

**Status:** aceito  
**Data:** 2026-09-07

## Contexto

Ambiente unico, branch `main` → produção, com deploy real nos quatro repositórios. Isso implica dois ambientes AWS completos (dois EKS, dois RDS, duplicação de Lambda, Gateway e mensageria).

## Decisão

Operar **um único ambiente provisionado**, correspondente a `main` (`var.environment = producao`). A branch `develop` mantém pipeline automática de **validação apenas**, sem credencial de escrita na AWS.

### Gatilhos

| Evento                      | Pipeline            | Toca nuvem  |
| --------------------------- | ------------------- | ----------- |
| PR → `develop` ou `main`    | `pr-validation.yml` | não         |
| Push → `develop`            | `pr-validation.yml` | não         |
| Push → `main` (merge de PR) | `deploy.yml`        | **sim**     |
| `workflow_dispatch` destroy | `deploy.yml`        | sim, manual |

### Imposição em três camadas

1. **Gatilho:** `deploy.yml` com `on.push.branches: [main]` apenas.
2. **GitHub:** secrets de nuvem no Environment `producao`, com deployment branch policy restrita a `main`.
3. **AWS:** OIDC com trust policy `sub: repo:<org>/<repo>:ref:refs/heads/main`.

### Terraform plan em PR

**Decisão:** PR permanece **sem credencial AWS**. `terraform plan` com backend remoto executa apenas no job de `main`, imediatamente antes do `apply`.

## Alternativas consideradas

| Alternativa                                | Motivo de rejeição                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Dois ambientes (homolog + prod)            | Custo ~2× (EKS ~$73/mês, RDS ~$15/mês, NAT ~$32/mês por ambiente)       |
| Role read-only em PR para `terraform plan` | Complexidade adicional; validação offline suficiente para gate de merge |
| Renomear `producao` para `demo`            | Retrabalho em state, SSM e nomes de recurso já criados                  |

## Consequências

- O ambiente único acumula demonstração e produção operacional.
- Operações destrutivas exigem `workflow_dispatch` explicito.
- Desvio consciente do requisito R-12: automação existe nas duas branches, mas apenas `main` provisiona.
- Código Terraform permanece parametrizado por `var.environment`; segundo ambiente possível sem reescrita.

## Referências

- [Governança Git](../local/operacao/governanca-git.md)
- [CI/CD](../local/operacao/ci-cd.md)
