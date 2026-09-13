# Documentação — Tech Challenge

Índice da documentação do projeto. Visão geral e instalação rápida no [README raiz](../README.md).

| Documento                                        | Conteúdo                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| [arquitetura.md](arquitetura.md)                 | Clean Architecture, estrutura de pastas, camadas e regra de dependência          |
| [configuracao.md](configuracao.md)               | Pré-requisitos, variáveis de ambiente, execução local e scripts do `package.json`|
| [autenticacao.md](autenticacao.md)               | Login JWT, uso do token, perfis e permissões                                     |
| [api.md](api.md)                                 | Contratos HTTP de todos os endpoints, envelopes de listagem e de erro            |
| [regras-de-negocio.md](regras-de-negocio.md)     | Fila de OS, máquina de estados, orçamentos, estoque, notificação e métricas      |
| [notificacoes.md](notificacoes.md)               | Fluxo assíncrono SNS/SQS/Lambda, contrato de evento, DLQ e observabilidade       |
| [observabilidade.md](observabilidade.md)         | Logs, métricas, dashboards, alertas Datadog e catálogo de telemetria (spec 007)  |
| [runbook-correlacao.md](runbook-correlacao.md)   | Runbook para correlacionar Gateway → API → SNS → Lambda → SendGrid               |
| [diagramas/observabilidade.md](diagramas/observabilidade.md) | Diagrama de fontes, coletores e destinos Datadog                     |
| [testes-e-qualidade.md](testes-e-qualidade.md)   | Testes unitários/e2e, cobertura e SonarQube                                      |
| [infraestrutura.md](infraestrutura.md)           | Fase 2: arquitetura AWS, Terraform, Kubernetes (EKS) e HPA                       |
| [modelo-relacional.md](modelo-relacional.md)   | Entidades, FKs, constraints e decisões de integridade (spec 006)                 |
| [performance-banco.md](performance-banco.md)   | Consultas críticas, índices e metas EXPLAIN (spec 006)                           |
| [migrations-compatibilidade.md](migrations-compatibilidade.md) | RollingUpdate, backfill e rollback de migrations              |
| [diagramas/modelo-relacional-er.md](diagramas/modelo-relacional-er.md) | Diagrama ER versionável (Mermaid)                                    |
| [adr/003-postgresql-banco-gerenciado.md](adr/003-postgresql-banco-gerenciado.md) | ADR: PostgreSQL, Multi-AZ, RDS Proxy, RPO/RTO              |
| [ci-cd.md](ci-cd.md)                             | Pipeline do GitHub Actions e secrets necessários                                 |
| [openapi.json](openapi.json)                     | Especificação OpenAPI exportada do Swagger                                       |

## Documentação de apoio

Material de estudo e apresentação do Tech Challenge, em [local/](local/):

- [event-storming.md](local/event-storming.md), [event-storming-passo-3-pontos-de-atencao.md](local/event-storming-passo-3-pontos-de-atencao.md) e [event-storming-resultado-final.md](local/event-storming-resultado-final.md) — workshop de Event Storming do domínio;
- [demo-end-to-end.md](local/demo-end-to-end.md) — roteiro de execução da demonstração;
- [roteiro-apresentacao.md](local/roteiro-apresentacao.md) — roteiro do vídeo;
- [terraform.md](local/terraform.md) — anotações de infraestrutura;
- [README-antigo.md](local/README-antigo.md) — versão anterior do README.

Manuais específicos de infraestrutura ficam junto do código: [infra/README.md](../infra/README.md) (Terraform) e [k8s/README.md](../k8s/README.md) (manifestos e HPA).
