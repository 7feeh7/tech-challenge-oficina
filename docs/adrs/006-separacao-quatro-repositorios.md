# ADR-006 — Separação em quatro repositórios

**Status:** aceito  
**Data:** 2026-09-13

## Contexto

A Fase 3 exige repositórios independentes para aplicação, Functions, infra Kubernetes e infra banco (R-06 a R-09), cada um com pipeline própria e deploy automatizado.

## Decisão

| Repositório | Responsabilidade | Fonte de verdade |
| --- | --- | --- |
| `tech-challenge` | API NestJS, Prisma, `k8s/`, `docs/` | Código app, schema, manifests workload |
| `tech-challenge-serverless` | Handlers Lambda | Código auth-cpf e notificacao |
| `tech-challenge-infra-kubernetes` | VPC, EKS, ECR, Gateway, SNS/SQS, Datadog | Terraform computação/borda |
| `tech-challenge-infra-database` | RDS, Secrets Manager | Terraform banco |

**Contrato de integração:** outputs Terraform + parâmetros SSM em `/tech-challenge/producao/{infra|database}/*`. Proibido copiar valores manualmente entre repos.

**Ordem de provisionamento:** infra-kubernetes → infra-database → (serverless + app em paralelo após SSM disponível).

## Consequências

### Positivas

- Deploy independente por artefato.
- Permissões IAM e secrets segregados por pipeline.
- Documentação centralizada em `tech-challenge/docs/` com links nos demais.

### Negativas / trade-offs

- Coordenação de breaking changes em contratos SSM.
- Clone de múltiplos repos para visão completa local.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| Monorepo único | Não atende requisito de repos segregados |
| Dois repos (app + infra) | Mistura banco e computação; pipelines acopladas |
| Valores hardcoded entre repos | Divergência e risco de segredo em Git |

## Referências

- [Estrutura do projeto](../../spec/memory/estrutura.md)
- [contratos-cross-repo.md](../../../tech-challenge-infra-kubernetes/docs/contratos-cross-repo.md)
- [diagramas/componentes-nuvem.md](../diagramas/componentes-nuvem.md)
