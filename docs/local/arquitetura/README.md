# Arquitetura

Documentação arquitetural da solução Fase 3 — quatro repositórios, borda serverless e API em Kubernetes.

**Repositório fonte:** `tech-challenge` (este). Demais repositórios linkam aqui para evitar divergência.

| Documento | Conteúdo |
| --- | --- |
| [visao-geral-nuvem.md](visao-geral-nuvem.md) | Componentes AWS, limites de rede/repositório e fluxo de deploy |
| [arquitetura.md](arquitetura.md) | Clean Architecture, camadas e estrutura de módulos NestJS |
| [infraestrutura.md](infraestrutura.md) | Provisionamento, HPA, migrations e ordem cross-repo |
| [../api/gateway-rotas.md](../api/gateway-rotas.md) | Rotas expostas pelo API Gateway |
| [../../diagramas/README.md](../../diagramas/README.md) | Diagramas de componentes, sequência e ER |

## Visões por repositório

| Repositório | Diagrama específico |
| --- | --- |
| `tech-challenge` | [diagrama-aplicacao.md](../../diagramas/diagrama-aplicacao.md) |
| `tech-challenge-serverless` | [diagrama-serverless.md](../../diagramas/diagrama-serverless.md) |
| `tech-challenge-infra-kubernetes` | [diagrama-infra-kubernetes.md](../../diagramas/diagrama-infra-kubernetes.md) |
| `tech-challenge-infra-database` | [diagrama-infra-database.md](../../diagramas/diagrama-infra-database.md) |

## Decisões registradas

- [ADRs](../../adrs/README.md) — decisões permanentes aceitas
- [RFCs](../../rfcs/README.md) — propostas e discussões técnicas
