# Terraform do OS: fila de entrada `os-in`

Provisiona a fila de entrada do OS e a DLQ (D3.4, D6.1). Billing e Execution publicam direto na `os-in`; o OS consome. Só o OS é dono destes recursos; o restante da infraestrutura vem do `tech-challenge-infra-kubernetes`.

## Recursos

| Recurso | Nome | Atributos principais |
| --- | --- | --- |
| Fila | `<projeto>-<ambiente>-os-in` | visibilidade 600 s, retenção 4 dias, *long polling* 10 s, SSE gerenciado, *redrive* com `maxReceiveCount` 5 |
| DLQ | `<projeto>-<ambiente>-os-in-dlq` | retenção 14 dias, SSE gerenciado |
| Políticas | nas duas filas | ver abaixo |
| SSM | `os_in_queue_url` e `os_in_dlq_url` | ver abaixo |

Em produção: `tech-challenge-producao-os-in` e `tech-challenge-producao-os-in-dlq`.

### Visibilidade da `os-in`

O tempo de visibilidade começa no recebimento. O pior caso é o lote do consumidor com erro permanente (complemento da E12): 3 mensagens × (20 s de transação + 45 s de envio à DLQ + 45 s de confirmação) = **330 s** até a última mensagem ser apagada. A variável `sqs_visibility_timeout_seconds` aceita no mínimo 360 s (330 s + 30 s de margem) e usa **600 s** por padrão, com folga para o recálculo dos tempos do complemento da E10. Se mudar lote, prazos ou `terminationGracePeriodSeconds`, recalcule antes de alterar o valor.

### Políticas

| Fila | Principal (IRSA, convenção da E06) | Ações |
| --- | --- | --- |
| `os-in` | `<projeto>-<ambiente>-billing-service` e `<projeto>-<ambiente>-execution-service` | `sqs:SendMessage` |
| `os-in` | `<projeto>-<ambiente>-os-service` | `sqs:ReceiveMessage`, `sqs:DeleteMessage` |
| `os-in-dlq` | `<projeto>-<ambiente>-os-service` | `sqs:SendMessage` (erro permanente encaminhado direto pelo consumidor, E12) |

O envio da `os-in` para a DLQ pelo *redrive* é feito pelo próprio SQS. As roles têm que existir no `apply` (stack do `infra-kubernetes` aplicado antes), porque o SQS recusa política com principal inexistente.

### Parâmetros SSM

| Parâmetro | Finalidade | Consumidores |
| --- | --- | --- |
| `/tech-challenge/producao/infra/os_in_queue_url` | URL da `os-in` | Billing (`SQS_OS_IN_URL`, no `deploy.yml` e no `migrate.yml`), Execution (`SQS_OS_IN_URL`, no `deploy.yml`) e OS (`SQS_OS_IN_URL`) |
| `/tech-challenge/producao/infra/os_in_dlq_url` | URL da `os-in-dlq` | OS (`SQS_OS_IN_DLQ_URL`) |

Nenhuma Lambda lê estes parâmetros.

## Backend

Backend S3 parcial, com chave própria `tech-challenge-oficina/producao/terraform.tfstate` (prefixo liberado à role de CI do OS). Para uso local de leitura e validação:

```bash
cp backend.hcl.example backend.hcl   # ajuste o bucket; backend.hcl não é versionado
terraform init -backend-config=backend.hcl
```

Sem acesso ao state: `terraform init -backend=false`, `terraform validate`.

## Pipeline

O workflow `.github/workflows/terraform.yml` roda **só por `workflow_dispatch`**, na `main`, no *environment* `producao`, com OIDC (`AWS_DEPLOY_ROLE_ARN`) e o backend em `TF_STATE_BUCKET` e `TF_STATE_LOCK_TABLE`. As ações são `plan`, `apply` (executa o `plan` antes) e `destroy` (exige o texto `DESTRUIR-tech-challenge-oficina`). Em PR e no push na `develop`, o `pr-validation.yml` só roda `terraform fmt -check -recursive`, `terraform init -backend=false` e `terraform validate`, sem credencial AWS e sem `plan`.

A implantação segue o passo 6.2 do runbook (`13-deployment-runbook.md`).

Pré-requisitos do `apply`:

- As IRSAs `<projeto>-<ambiente>-os-service`, `-billing-service` e `-execution-service` já existem (stack do `tech-challenge-infra-kubernetes` aplicado), porque o SQS recusa política com principal inexistente.
- A role de CI do OS (`github_app`, bootstrap do `tech-challenge-infra-kubernetes`) precisa de `ssm:PutParameter`, `ssm:DeleteParameter`, `ssm:AddTagsToResource`, `ssm:RemoveTagsFromResource` e `ssm:ListTagsForResource` nos dois parâmetros e de `ssm:DescribeParameters`. Hoje ela só tem `ssm:GetParameter(s)`: sem esse ajuste, o `apply` cria as filas e falha nos parâmetros SSM.
