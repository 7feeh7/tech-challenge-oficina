# Documentação de Arquitetura

Sistema de Gestão de Oficina Mecânica na AWS — cloud-native, Fase 3.

Visão de instalação e execução no [README raiz](../README.md). Material operacional, contratos HTTP, segurança e entrega ficam no [arquivo local](local/README.md).

## Sumário

1. [RFCs](#rfcs-request-for-comments)
2. [ADRs](#adrs-architecture-decision-records)
3. [Diagramas](#diagramas)

---

## RFCs (Request for Comments)

Propostas técnicas com alternativas e discussão. Aceitas, viram ADR quando a decisão é permanente.

| RFC | Título | Status | ADR |
| --- | --- | --- | --- |
| [001](rfcs/001-escolha-aws.md) | Escolha da AWS como nuvem | aceito | — |
| [002](rfcs/002-postgresql-rds.md) | PostgreSQL/RDS e modelo relacional | aceito | [ADR-003](adrs/003-postgresql-banco-gerenciado.md) |
| [003](rfcs/003-autenticacao-cpf-jwt.md) | Autenticação por CPF/JWT | aceito | [ADR-002](adrs/002-api-gateway-borda-unica.md) |
| [004](rfcs/004-serverless-notificacao-mensageria.md) | Serverless de notificação e mensageria | aceito | [ADR-004](adrs/004-comunicacao-sincrona-assincrona.md) |

Índice e template: [rfcs/README.md](rfcs/README.md).

---

## ADRs (Architecture Decision Records)

Decisões aceitas e permanentes.

| ADR | Título | Status | Data |
| --- | --- | --- | --- |
| [001](adrs/001-ambiente-unico-provisionado.md) | Ambiente único provisionado | aceito | 2026-09-07 |
| [002](adrs/002-api-gateway-borda-unica.md) | API Gateway como borda única | aceito | 2026-09-13 |
| [003](adrs/003-postgresql-banco-gerenciado.md) | PostgreSQL gerenciado no RDS | aceito | 2026-09-13 |
| [004](adrs/004-comunicacao-sincrona-assincrona.md) | HTTP síncrono + eventos assíncronos | aceito | 2026-09-13 |
| [005](adrs/005-kubernetes-eks-hpa.md) | Kubernetes EKS com HPA | aceito | 2026-09-13 |
| [006](adrs/006-separacao-quatro-repositorios.md) | Separação em quatro repositórios | aceito | 2026-09-13 |
| [007](adrs/007-observabilidade-datadog.md) | Observabilidade com Datadog | aceito | 2026-09-13 |

Índice e template: [adrs/README.md](adrs/README.md).

---

## Diagramas

Fontes Mermaid versionadas. O GitHub renderiza nativamente; SVGs em [`diagramas/rendered/`](diagramas/rendered/).

| Diagrama | Tipo | Descrição |
| --- | --- | --- |
| [componentes-nuvem.md](diagramas/componentes-nuvem.md) | Componentes | Gateway, Functions, EKS, RDS, mensageria, Datadog |
| [sequencia-auth-cpf.md](diagramas/sequencia-auth-cpf.md) | Sequência | Autenticação por CPF → JWT → API protegida |
| [sequencia-abertura-os.md](diagramas/sequencia-abertura-os.md) | Sequência | Abertura de ordem de serviço |
| [modelo-relacional-er.md](diagramas/modelo-relacional-er.md) | ER | Entidades, PKs, FKs e cardinalidades |
| [observabilidade.md](diagramas/observabilidade.md) | Componentes | Fontes de telemetria e destinos Datadog |
| [diagrama-aplicacao.md](diagramas/diagrama-aplicacao.md) | Componentes | Repositório `tech-challenge` |
| [diagrama-serverless.md](diagramas/diagrama-serverless.md) | Componentes | Repositório `tech-challenge-serverless` |
| [diagrama-infra-kubernetes.md](diagramas/diagrama-infra-kubernetes.md) | Componentes | Repositório `tech-challenge-infra-kubernetes` |
| [diagrama-infra-database.md](diagramas/diagrama-infra-database.md) | Componentes | Repositório `tech-challenge-infra-database` |

Índice: [diagramas/README.md](diagramas/README.md).

---

## Arquivo

Documentação de apoio (API, banco, operação, segurança, entrega e material legado) está em [`local/`](local/README.md). O conteúdo não foi descartado.
