# ADR-005 — Kubernetes EKS com HPA

**Status:** aceito  
**Data:** 2026-09-13

## Contexto

O enunciado exige cluster Kubernetes com escalabilidade (R-16). A API NestJS é stateless e suporta réplicas horizontais; picos de consulta à fila de OS beneficiam autoescalonamento.

## Decisão

1. Executar a API no **Amazon EKS** (provisionado em `tech-challenge-infra-kubernetes`).
2. Escalar pods com **HorizontalPodAutoscaler v2**:
   - `minReplicas: 2`, `maxReplicas: 10`
   - CPU target 70%, memória 80%
3. Instalar **metrics-server** via Terraform para métricas de recursos.
4. **Cluster Autoscaler** para nodes quando pods pendentes.
5. Migrations em **Job Kubernetes** separado (não no boot de cada pod).

## Consequências

### Positivas

- Resiliência mínima com 2 réplicas.
- Demonstração de autoescalonamento sob carga (`autocannon` local ou EKS).
- RollingUpdate seguro com Job de migration como gate.

### Negativas / trade-offs

- Custo fixo do control plane EKS (~USD 73/mês).
- Limite de conexões RDS restringe `maxReplicas` (ver [ADR-003](003-postgresql-banco-gerenciado.md)).
- Cold start de novos pods durante picos.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| ECS Fargate | Menos alinhado ao requisito explícito de Kubernetes |
| EKS sem HPA (réplicas fixas) | Não atende escalabilidade |
| K3s self-managed | Operação manual maior que EKS gerenciado |
| VPA em vez de HPA | API NestJS escala melhor horizontalmente |

## Referências

- [k8s/hpa.yaml](../../k8s/hpa.yaml)
- [infraestrutura.md](../local/arquitetura/infraestrutura.md)
- [diagramas/diagrama-aplicacao.md](../diagramas/diagrama-aplicacao.md)
