# Tech Challenge Fase 3 — Documento de Entrega

> **Versão:** 1.0 · **Data:** _preencher antes do upload_  
> **Integrantes:** _nome RM — preencher_  
> **Turma / Pós:** Software Architecture — FIAP

---

## Índice

1. [Repositórios](#1-repositórios)
2. [Vídeo demonstrativo](#2-vídeo-demonstrativo)
3. [Deploys e validação](#3-deploys-e-validação)
4. [Documentação técnica](#4-documentação-técnica)
5. [Colaborador avaliador](#5-colaborador-avaliador)
6. [Desvio R-12 (ambiente único)](#6-desvio-r-12-ambiente-único)
7. [Disponibilidade pós-demonstração](#7-disponibilidade-pós-demonstração)

---

## 1. Repositórios

| Repositório                         | Responsabilidade                                                    | URL                                                       |
| ----------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| **tech-challenge-oficina**          | API NestJS, Prisma, Dockerfile, manifests K8s, documentação central | https://github.com/7feeh7/tech-challenge-oficina          |
| **tech-challenge-serverless**       | Lambda auth-cpf e notificação                                       | https://github.com/7feeh7/tech-challenge-serverless       |
| **tech-challenge-infra-kubernetes** | VPC, EKS, ECR, API Gateway, mensageria, Datadog (Terraform)         | https://github.com/7feeh7/tech-challenge-infra-kubernetes |
| **tech-challenge-infra-database**   | RDS PostgreSQL, Secrets Manager (Terraform)                         | https://github.com/7feeh7/tech-challenge-infra-database   |

**Ordem de deploy:** infra-kubernetes → infra-database → serverless → aplicação. Runbook: [`docs/runbook-subir-producao.md`](../runbook-subir-producao.md).

---

## 2. Vídeo demonstrativo

| Campo            | Valor                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **URL**          | _https://youtube.com/... ou vimeo.com/... — preencher após publicação_                                |
| **Visibilidade** | Público ou não listado                                                                                |
| **Duração**      | _mm:ss (máx. 15:00)_                                                                                  |
| **Roteiro**      | [`docs/demo-fase3.md`](https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/demo-fase3.md) |

Conteúdo obrigatório: auth CPF, API protegida, pipeline CI/CD, deploy K8s, dashboards, logs/traces e alerta.

---

## 3. Deploys e validação

| Item                  | URL / evidência                                                                           | Validado em |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| API Gateway + Swagger | `{api_gateway_url}/docs` — obter via SSM `/tech-challenge/producao/infra/api_gateway_url` | _data_      |
| Health                | `{api_gateway_url}/health`                                                                | _data_      |
| GitHub Actions (app)  | https://github.com/7feeh7/tech-challenge-oficina/actions                                  | _data_      |
| Datadog dashboards    | URLs dos outputs Terraform `datadog_dashboard_*_url`                                      | _data_      |

> Se o ambiente AWS foi desligado após a gravação por custo, indique aqui a **data da última validação** e que os links de runtime exigem re-provisionamento conforme README de cada repo.

---

## 4. Documentação técnica

| Documento                  | Link                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Índice geral               | https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/README.md                                                                   |
| OpenAPI / Swagger          | https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/openapi.json · runtime: `/docs`                                             |
| Diagrama componentes nuvem | https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/diagramas/componentes-nuvem.md                                              |
| Sequência auth CPF         | https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/diagramas/sequencia-auth-cpf.md                                             |
| Sequência abertura OS      | https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/diagramas/sequencia-abertura-os.md                                          |
| Diagrama ER                | https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/diagramas/modelo-relacional-er.md                                           |
| RFCs                       | https://github.com/7feeh7/tech-challenge-oficina/tree/main/docs/rfcs                                                                        |
| ADRs                       | https://github.com/7feeh7/tech-challenge-oficina/tree/main/docs/adrs                                                                        |
| Observabilidade            | https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/observabilidade.md                                                          |
| Runbooks                   | https://github.com/7feeh7/tech-challenge-oficina/tree/main/docs/runbooks                                                                    |
| Matriz de conformidade     | https://github.com/7feeh7/tech-challenge-oficina/blob/main/spec/changes/009-readmes-demonstracao-e-entrega-final/matriz-conformidade.md     |
| Desvio R-12                | https://github.com/7feeh7/tech-challenge-oficina/blob/main/spec/changes/009-readmes-demonstracao-e-entrega-final/matriz-conformidade-r12.md |

---

## 5. Colaborador avaliador

| Repositório                     | Usuário `soat-architecture` | Evidência                                                         |
| ------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| tech-challenge-oficina          | _Confirmar_                 | _Print Settings → Collaborators (sem expor e-mails de terceiros)_ |
| tech-challenge-serverless       | _Confirmar_                 | _idem_                                                            |
| tech-challenge-infra-kubernetes | _Confirmar_                 | _idem_                                                            |
| tech-challenge-infra-database   | _Confirmar_                 | _idem_                                                            |

Texto sugerido: _"O usuário GitHub `soat-architecture` foi adicionado como colaborador com permissão de leitura/escrita nos quatro repositórios listados na seção 1, em [data]."_

---

## 6. Desvio R-12 (ambiente único)

Conforme [ADR-001](https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/adrs/001-ambiente-unico-provisionado.md): pipelines automáticas em `develop` (validação) e `main` (deploy), porém **um único ambiente AWS** (`producao`) por motivo de custo. Detalhes: [`matriz-conformidade-r12.md`](https://github.com/7feeh7/tech-challenge-oficina/blob/main/spec/changes/009-readmes-demonstracao-e-entrega-final/matriz-conformidade-r12.md).

---

## 7. Disponibilidade pós-demonstração

_Escolher e preencher:_

- [ ] Ambiente AWS **ativo** até _data_
- [ ] Ambiente **desligado** após gravação em _data_; reativar seguindo READMEs de infra

---

### Exportar para PDF

1. Preencher campos `_..._`.
2. Validar links: `./scripts/check-entrega-links.sh`
3. Exportar este arquivo para PDF (VS Code, Pandoc ou impressão do GitHub).
4. Testar todos os links clicáveis em sessão anônima antes do upload no Portal do Aluno.
