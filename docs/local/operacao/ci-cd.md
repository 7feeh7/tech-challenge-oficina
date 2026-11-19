# Pipeline CI/CD

A entrega Fase 3 usa **quatro repositorios** com pipelines independentes. Este documento descreve o repositorio da **aplicacao**.

## Estrategia de ambientes (001-R1)

Existe **um unico ambiente provisionado** na AWS. Apenas `main` cria ou altera recursos; `develop` executa validacao automatica sem credencial de escrita.

| Evento | Workflow | Toca nuvem |
| --- | --- | --- |
| PR → `develop` ou `main` | `pr-validation.yml` | nao |
| Push → `develop` | `pr-validation.yml` | nao |
| Push → `main` | `deploy.yml` | **sim** |

ADR: [`adrs/001-ambiente-unico-provisionado.md`](../../adrs/001-ambiente-unico-provisionado.md)

## Workflows

| Arquivo | Gatilho | Acao |
| --- | --- | --- |
| `pr-validation.yml` | PR + push `develop` | lint, build, testes, SonarCloud (PR), TruffleHog |
| `deploy.yml` | push `main` (ignora `terraform/**` e `docs/**`) e `workflow_dispatch` | uma run: testes → build e push da imagem (tag SHA) → migration (Job) → rollout e smoke test |
| `migrate.yml` | `workflow_dispatch` (input `image_tag`) | só manutenção manual: aplica as migrations de uma imagem já publicada |
| `terraform.yml` | `workflow_dispatch` | `plan`, `apply` e `destroy` (com confirmação) da fila `os-in` e da DLQ; antes do `deploy.yml` |

### Ordem dos jobs do `deploy.yml`

| Job | Depende de | Faz | Segredos lidos |
| --- | --- | --- | --- |
| `test` | — | lint, build, testes com cobertura | nenhum |
| `build` | `test` | `docker build` e `push` com a tag `${{ github.sha }}` | nenhum (só `ecr_repository_url`, não secreto) |
| `migration` | `build` | Secret `oficina-migrate-secret-<run_id>-<tentativa>` (só `DATABASE_URL`), Job `oficina-migrate-<run_id>-<tentativa>` com a mesma imagem até `Complete`, remoção do Job e do Secret | senha do RDS |
| `deploy` | `migration` | ServiceAccount (IRSA), ConfigMap, `oficina-secret`, Deployment, Service, PDB, HPA, rollout, smoke test | senha do RDS, chave JWT, tokens, `ADMIN_SENHA` |

`build`, `migration` e `deploy` rodam só na `main`, no *environment* `producao` (OIDC), cada um com a aprovação configurada no *environment*. Migration com falha (Job `Failed` ou 600 s sem `Complete`) falha a run e o `deploy` não roda: o Deployment anterior segue no ar. O Job sai antes do rollout, então as conexões dele não somam ao *surge*. Job e Secret têm nome único por run, e a limpeza remove só os da própria run: o `migrate.yml` manual pode coexistir com um deploy (as duas migrations se serializam pelo lock do Prisma). A espera pelo Job tolera falhas transitórias da API do cluster (só 5 consultas seguidas com erro encerram a espera) para que a limpeza não remova uma migration em curso.

O GitHub mantém uma run em execução e uma pendente por grupo de concorrência: um novo push na `main` cancela a run pendente, mesmo com `cancel-in-progress: false`. Se a run pendente cancelada era a que levaria o commit adiante, o commit mais novo a substitui (a run seguinte constrói e implanta o estado mais recente da `main`).

Processadores de mensageria: o ConfigMap sobe com `SQS_CONSUMER_HABILITADO`, `OUTBOX_PUBLISHER_HABILITADO` e `PRAZO_REFERENCIA_VERIFICADOR_HABILITADO` em `false`, e o deploy reaplica o arquivo inteiro a cada run. Para ligar um, abra um PR que altere `k8s/configmap.yaml` na `develop` e promova pelo fluxo normal; edição manual do ConfigMap no cluster é revertida no próximo deploy. Pré-condições e procedimento: [`tempos-processadores-os.md`](../../tempos-processadores-os.md#ativação-dos-processadores).

Segredos nos logs: os valores são lidos e aplicados no mesmo passo (`.github/scripts/parametros-aws.sh`), com `::add-mask::` na senha, na chave privada (linha a linha) e nos tokens; nenhum valor secreto passa por *output* de passo nem por `${{ }}` dentro de comando.

## Integracao cross-repo

O deploy le parametros via SSM do ambiente unico (`producao`):

- `/tech-challenge/producao/infra/ecr_repository_url`
- `/tech-challenge/producao/infra/eks_cluster_name`
- `/tech-challenge/producao/database/db_secret_arn` → Secrets Manager → `DATABASE_URL`
- `/tech-challenge/producao/infra/os_service_irsa_role_arn` → anotação da ServiceAccount `oficina-api` (só o job `deploy`)
- ConfigMap (só o job `deploy`, sem imprimir valores): `/infra/os_in_queue_url` (`SQS_OS_IN_URL`), `/infra/os_in_dlq_url` (`SQS_OS_IN_DLQ_URL`), `/infra/billing_in_queue_url` (`SQS_BILLING_IN_URL`), `/infra/execution_in_queue_url` (`SQS_EXECUTION_IN_URL`) e `/infra/sns_notificacao_topic_arn` (`SNS_NOTIFICACAO_TOPIC_ARN`)

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

- **Sem `rollout undo` automatico.** Falha na migration impede o rollout; falha no rollout ou no smoke test deixa a run vermelha para decisao do operador.
- **Manual:** reverta o commit e abra PR para `main`. O pipeline publica imagem com o SHA revertido.

## Concorrencia

O deploy usa `concurrency.group: deploy-producao` e o `migrate.yml`, `migrate-producao`, ambos com `cancel-in-progress: false`. O `deploy.yml` nao espera nenhum outro workflow.

## Imagens

Tag imutavel: `{ecr_url}:{git_sha}`, a mesma no Job de migration e no Deployment. Nao ha tag `latest`.
