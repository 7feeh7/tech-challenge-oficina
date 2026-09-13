# ADR-001: Ambiente unico provisionado

**Status:** aceito  
**Data:** 2026-09-07  
**Spec:** `001-R1-revisao-estrategia-de-ambientes`

## Contexto

A spec `001` mapeou `develop` → homologacao e `main` → producao, com deploy real nos quatro repositorios. Isso implica dois ambientes AWS completos (dois EKS, dois RDS, duplicacao de Lambda, Gateway e mensageria).

## Decisao

Operar **um unico ambiente provisionado**, correspondente a `main` (`var.environment = producao`). A branch `develop` mantem pipeline automatica de **validacao apenas**, sem credencial de escrita na AWS.

### Gatilhos

| Evento | Pipeline | Toca nuvem |
| --- | --- | --- |
| PR → `develop` ou `main` | `pr-validation.yml` | nao |
| Push → `develop` | `pr-validation.yml` | nao |
| Push → `main` (merge de PR) | `deploy.yml` | **sim** |
| `workflow_dispatch` destroy | `deploy.yml` | sim, manual |

### Imposicao em tres camadas

1. **Gatilho:** `deploy.yml` com `on.push.branches: [main]` apenas.
2. **GitHub:** secrets de nuvem no Environment `producao`, com deployment branch policy restrita a `main`.
3. **AWS (spec 010):** OIDC com trust policy `sub: repo:<org>/<repo>:ref:refs/heads/main`.

### Terraform plan em PR

**Decisao:** PR permanece **sem credencial AWS**. `terraform plan` com backend remoto executa apenas no job de `main`, imediatamente antes do `apply`.

## Alternativas descartadas

| Alternativa | Motivo da rejeicao |
| --- | --- |
| Dois ambientes (homolog + prod) | Custo ~2x (EKS ~$73/mes, RDS ~$15/mes, NAT ~$32/mes por ambiente) |
| Role read-only em PR para `terraform plan` | Complexidade adicional; validacao offline (`init -backend=false`, `validate`, tfsec) suficiente para gate de merge |
| Renomear `producao` para `demo` | Retrabalho em state, SSM e nomes de recurso ja criados |

## Consequencias

- O ambiente unico acumula demonstracao e producao operacional.
- Operacoes destrutivas exigem `workflow_dispatch` explicito.
- Desvio consciente do requisito R-12 (deploy automatico em homologacao e producao): automacao existe nas duas branches, mas apenas `main` provisiona.
- Codigo Terraform permanece parametrizado por `var.environment`; segundo ambiente possivel sem reescrita.

## Custo estimado

| Cenario | Estimativa mensal |
| --- | --- |
| Dois ambientes completos | ~$240–280 |
| Ambiente unico (decisao) | ~$120–140 |
| Economia | ~50% |

Valores aproximados para us-east-1 (EKS control plane, 2x t3.small nodes, db.t3.micro, NAT Gateway).

## Referencias

- [Requisitos Fase 3 — desvio R-12](../../spec/memory/requisitos-fase-3.md)
- [Governanca Git](../governanca-git.md)
- [CI/CD](../ci-cd.md)
