# Pipeline CI/CD

A entrega Fase 3 usa **quatro repositorios** com pipelines independentes. Este documento descreve o repositorio da **aplicacao**.

## Estrategia de ambientes (001-R1)

Existe **um unico ambiente provisionado** na AWS. Apenas `main` cria ou altera recursos; `develop` executa validacao automatica sem credencial de escrita.

| Evento | Workflow | Toca nuvem |
| --- | --- | --- |
| PR → `develop` ou `main` | `pr-validation.yml` | nao |
| Push → `develop` | `pr-validation.yml` | nao |
| Push → `main` | `deploy.yml` | **sim** |

ADR: [`adrs/001-ambiente-unico-provisionado.md`](adrs/001-ambiente-unico-provisionado.md)

## Workflows

| Arquivo | Gatilho | Acao |
| --- | --- | --- |
| `pr-validation.yml` | PR + push `develop` | lint, build, testes, SonarCloud (PR), TruffleHog |
| `deploy.yml` | push `main` | build imagem, deploy EKS, smoke test |

## Integracao cross-repo

O deploy le parametros via SSM do ambiente unico (`producao`):

- `/tech-challenge/producao/infra/ecr_repository_url`
- `/tech-challenge/producao/infra/eks_cluster_name`
- `/tech-challenge/producao/database/db_secret_arn` → Secrets Manager → `DATABASE_URL`

## Secrets por escopo

| Escopo | Secrets |
| --- | --- |
| **Repositorio** | `SONAR_TOKEN`, `GITHUB_TOKEN` (automatico) |
| **Environment `producao`** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `JWT_SECRET`, `SENDGRID_API_KEY`, `ADMIN_SENHA` |

Secrets de nuvem **nao** ficam no nivel de repositorio — apenas no Environment `producao`, com deployment branch policy restrita a `main`.

## Ordem de deploy da solucao

1. `tech-challenge-infra-kubernetes`
2. `tech-challenge-infra-database`
3. `tech-challenge-serverless`
4. `tech-challenge` (este repo)

## Rollback

- **Automatico:** se migration, rollout ou smoke test falhar apos a migration concluir, o workflow executa `kubectl rollout undo`.
- **Manual:** reverta o commit e abra PR para `main`. O pipeline publica imagem com o SHA revertido.

## Concorrencia

O deploy usa `concurrency.group: deploy-producao` para evitar applies/deploys concorrentes no mesmo ambiente.

## Imagens

Tag primaria: `{ecr_url}:{git_sha}`. Tag `latest` e alias secundario.
