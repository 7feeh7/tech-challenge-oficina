# Infraestrutura migrada

O Terraform que vivia em `infra/` foi segregado na Fase 3:

| Antigo (`infra/`) | Novo repositorio |
| --- | --- |
| `vpc.tf`, `eks.tf`, `ecr.tf` | [`tech-challenge-infra-kubernetes`](../../tech-challenge-infra-kubernetes) |
| `rds.tf` | [`tech-challenge-infra-database`](../../tech-challenge-infra-database) |

Manifests Kubernetes permanecem em [`k8s/`](../k8s/).

Consulte [`docs/infraestrutura.md`](../docs/infraestrutura.md) e [`docs/ci-cd.md`](../docs/ci-cd.md) para a ordem de deploy e contratos SSM.
