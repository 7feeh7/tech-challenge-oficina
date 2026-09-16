# Documentação — Tech Challenge (Fase 3)

Índice central da documentação arquitetural. Visão geral e instalação no [README raiz](../README.md).

## Proprietário dos documentos

| Área                                                    | Repositório fonte                             | Demais repos  |
| ------------------------------------------------------- | --------------------------------------------- | ------------- |
| Arquitetura, RFCs, ADRs, diagramas, API, banco (schema) | **tech-challenge** (`docs/`)                  | Links para cá |
| Contratos Lambda (auth, evento)                         | **tech-challenge-serverless** (`docs/`)       | Links         |
| Contratos SSM, custo/teardown                           | **tech-challenge-infra-kubernetes** (`docs/`) | Links         |
| Backup/restore RDS                                      | **tech-challenge-infra-database** (`docs/`)   | Links         |

## Arquitetura e diagramas

| Documento                                                                | Conteúdo                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| [arquitetura/README.md](arquitetura/README.md)                           | Índice arquitetural Fase 3                         |
| [arquitetura/visao-geral-nuvem.md](arquitetura/visao-geral-nuvem.md)     | Componentes AWS e fronteiras de repositório        |
| [arquitetura.md](arquitetura.md)                                         | Clean Architecture e estrutura de módulos          |
| [infraestrutura.md](infraestrutura.md)                                   | Provisionamento, HPA, migrations, ordem cross-repo |
| [diagramas/README.md](diagramas/README.md)                               | Índice de diagramas Mermaid                        |
| [diagramas/componentes-nuvem.md](diagramas/componentes-nuvem.md)         | Visão completa da nuvem                            |
| [diagramas/sequencia-auth-cpf.md](diagramas/sequencia-auth-cpf.md)       | Fluxo autenticação CPF → JWT                       |
| [diagramas/sequencia-abertura-os.md](diagramas/sequencia-abertura-os.md) | Fluxo abertura de OS                               |
| [diagramas/modelo-relacional-er.md](diagramas/modelo-relacional-er.md)   | Diagrama ER                                        |
| [diagramas/observabilidade.md](diagramas/observabilidade.md)             | Telemetria e Datadog                               |

## RFCs e ADRs

| Documento                            | Conteúdo                                        |
| ------------------------------------ | ----------------------------------------------- |
| [rfcs/README.md](rfcs/README.md)     | Propostas técnicas (AWS, RDS, auth, mensageria) |
| [adrs/README.md](adrs/README.md)     | Decisões aceitas com status e supersessão       |
| [rfcs/TEMPLATE.md](rfcs/TEMPLATE.md) | Template mínimo de RFC                          |
| [adrs/TEMPLATE.md](adrs/TEMPLATE.md) | Template mínimo de ADR                          |

## Banco de dados

| Documento                                                      | Conteúdo                     |
| -------------------------------------------------------------- | ---------------------------- |
| [banco/README.md](banco/README.md)                             | Índice do modelo relacional  |
| [modelo-relacional.md](modelo-relacional.md)                   | Entidades, FKs e constraints |
| [performance-banco.md](performance-banco.md)                   | Índices e consultas críticas |
| [migrations-compatibilidade.md](migrations-compatibilidade.md) | RollingUpdate e rollback     |

## API, autenticação e operação

| Documento                                                                        | Conteúdo                              |
| -------------------------------------------------------------------------------- | ------------------------------------- |
| [api.md](api.md)                                                                 | Contratos HTTP                        |
| [openapi.json](openapi.json)                                                     | Especificação OpenAPI / Swagger       |
| [autenticacao.md](autenticacao.md)                                               | JWT interno e cliente (CPF)           |
| [gateway-rotas.md](gateway-rotas.md)                                             | Rotas do API Gateway                  |
| [regras-de-negocio.md](regras-de-negocio.md)                                     | OS, orçamentos, estoque, notificações |
| [notificacoes.md](notificacoes.md)                                               | SNS/SQS/Lambda/SendGrid               |
| [observabilidade.md](observabilidade.md)                                         | Logs, métricas, Datadog               |
| [runbooks/README.md](runbooks/README.md)                                         | Runbooks operacionais                 |
| [runbooks/correlacao-observabilidade.md](runbooks/correlacao-observabilidade.md) | Correlação Gateway → SendGrid         |
| [ci-cd.md](ci-cd.md)                                                             | Pipelines GitHub Actions              |
| [testes-e-qualidade.md](testes-e-qualidade.md)                                   | Testes e SonarQube                    |
| [governanca-git.md](governanca-git.md)                                           | Branch protection, OIDC, secrets      |

## Segurança e privacidade

| Documento                                                                            | Conteúdo                       |
| ------------------------------------------------------------------------------------ | ------------------------------ |
| [seguranca/modelo-ameacas.md](seguranca/modelo-ameacas.md)                           | Ativos, ameaças, controles     |
| [seguranca/ciclo-vida-dados-pessoais.md](seguranca/ciclo-vida-dados-pessoais.md)     | Inventário PII, retenção, LGPD |
| [seguranca/matriz-seguranca-evidencias.md](seguranca/matriz-seguranca-evidencias.md) | Ameaça → evidência             |
| [seguranca/rotacao-segredos.md](seguranca/rotacao-segredos.md)                       | Rotação JWT, RDS, SendGrid     |
| [seguranca/checklist-publicacao.md](seguranca/checklist-publicacao.md)               | Vídeo/PDF sem PII              |

Scripts: `scripts/security/` · Evidências: `evidence/`

## Documentação de apoio

| [runbook-subir-producao.md](runbook-subir-producao.md) | Passo a passo develop → main (secrets, ordem dos PRs, seed) |
| [demo-fase3.md](demo-fase3.md) | Roteiro de demonstração Fase 3 (vídeo ≤ 15 min) |
| [entrega/entrega-fase3.md](entrega/entrega-fase3.md) | Documento base para PDF do Portal |
| [postman/](postman/) | Coleção Postman da demo |

Material de apoio em [local/](local/) (Event Storming, demo legado Fase 2).

Manuais de infra junto do código:

- [k8s/README.md](../k8s/README.md) — manifests e HPA
- [infra/README.md](../infra/README.md) — Terraform legado (esvaziado)
