# Tempos dos processadores do OS

Pior caso do consumidor da `os-in`, do publicador da outbox e do verificador de prazo de referência, e os valores adotados com a margem de cada um. O teste `src/shared/messaging/prazos-operacionais-os.spec.ts` recalcula esta tabela e confere os valores nos arquivos de implantação (`k8s/configmap.yaml`, `k8s/deployment.yaml`, `terraform/variables.tf` e `.env.example`).

## Termos

| Símbolo | Variável | Valor | Origem |
| --- | --- | ---: | --- |
| A | `SQS_OPERATION_DEADLINE_MS` e `SNS_OPERATION_DEADLINE_MS` | 45 s | Prazo total de cada operação AWS, com as 3 tentativas de 12 s do SDK (`AbortSignal`). Vale também para o recebimento, não só para o envio e a confirmação |
| C | `DATABASE_POOL_CONNECTION_TIMEOUT_MS` | 10 s | Espera por conexão do pool |
| T | `DATABASE_TRANSACTION_TIMEOUT_MS` | 10 s | Transação do Unit of Work |
| P | `OUTBOX_PERSISTENCIA_MS` | 5 s | Limite de execução de cada gravação ou leitura curta do publicador no banco |
| R | `LIMITE_REIVINDICACAO_MS` (constante do gateway do verificador) | 5 s | Limite da transação de reivindicação do verificador |
| L, N, V | `SQS_CONSUMER_LOTE`, `OUTBOX_PUBLISHER_LOTE`, `PRAZO_REFERENCIA_VERIFICADOR_LOTE` | 3, 5, 5 | Lotes |
| M | margem declarada | 30 s | Folga sobre o pior caso na visibilidade, nas posses e no encerramento |
| H | fechamento do HTTP | 72 s | `keepAliveTimeout` padrão do Fastify 5, medido no Execution (`docs/prazos-operacionais.md` do repositório do Execution) |

Uma transação do Unit of Work custa no máximo **C + T = 20 s** (espera por conexão mais execução).

## Limite de execução no banco (P e R)

O driver `pg` não tem timeout de consulta, e o `timeout` da transação do Prisma sozinho não interrompe uma consulta bloqueada: com a linha da outbox bloqueada por outra transação, a gravação com só `timeout` não retornou em 5 s (o rollback espera a consulta terminar). Por isso `executarTransacaoComLimite` (`src/shared/database/executar-transacao-com-limite.ts`) define `statement_timeout` local à transação, e o PostgreSQL cancela a consulta, inclusive a espera por lock, e devolve o erro ao chamador dentro do limite (`test/mensageria-outbox.int-spec.ts`: com a linha bloqueada, a confirmação e a liberação terminam em cerca de 2 × P). Usam esse limite:

- publicador: reivindicação do lote, confirmação do envio, liberação após falha e as duas consultas de `recordOutboxBacklog`, todas limitadas por P (`OUTBOX_PERSISTENCIA_MS`; `OUTBOX_PERSISTENCIA_MS` passou a ser lido pelo código);
- verificador de prazo: reivindicação das OS, limitada por R. A posse (`consulta_prazo_reivindicado_em`) usa agora o `NOW()` do banco, o mesmo relógio da seleção, e não o relógio de cada pod.

A espera por conexão (C) continua valendo antes de cada transação.

## Pior caso

| Item | Fórmula | Valor |
| --- | --- | ---: |
| Transação do Unit of Work | C + T | 20 s |
| Mensagem do consumidor (erro permanente) | 2 × 20 s (a transação repete uma vez em `P2002`) + A (DLQ) + A (confirmação) | 130 s |
| **Lote do consumidor** (do recebimento ao fim da última mensagem) | L × 130 s | **390 s** |
| Ciclo completo do consumidor | A (recebimento) + 390 s | 435 s |
| Gravação do publicador | C + P | 15 s |
| Item do publicador | A (envio) + 15 s (confirmação que falha) + 15 s (liberação) | 75 s |
| **Lote do publicador sob posse** (da reivindicação ao fim do último item) | 15 s + N × 75 s | **390 s** |
| `recordOutboxBacklog` | C + P (as duas consultas dividem uma transação) | 15 s |
| Ciclo completo do publicador | 390 s + 15 s | 405 s |
| Reivindicação do verificador | C + R | 15 s |
| OS do verificador | C + T (a leitura do `correlationId` fica na mesma transação da emissão) | 20 s |
| **Lote do verificador sob posse** | 15 s + V × 20 s | **115 s** |
| Drenagem no desligamento | 390 s (consumidor, recebimento abortado) + 405 s + 115 s | 910 s |
| **Encerramento** | 910 s + H + M | **1012 s** |

O recebimento (A) conta no ciclo do consumidor, mas não na visibilidade: o relógio da `os-in` começa quando o `ReceiveMessage` retorna.

Premissas conservadoras:

- No desligamento, o consumidor aborta o recebimento, mas termina as mensagens que já recebeu; o publicador termina o lote e o backlog; o verificador termina o lote.
- A drenagem soma os três processadores. O Nest executa os `onModuleDestroy` de um mesmo módulo em paralelo e os módulos em sequência (consumidor e publicador estão em `MensageriaModule`, o verificador em `CoordenacaoSagaModule`), então o tempo real com a disposição atual é `max(390, 405) + 115 = 520 s`. A soma vale para qualquer disposição dos módulos.
- Os `onModuleDestroy` (inclusive a desconexão do Prisma) rodam antes do fechamento do servidor HTTP (`NestApplicationContext.close`); por isso H entra depois da drenagem.
- O processador de idade da OS por status (`ProcessadorIdadeOsPorStatusService`, E35) faz uma consulta por ciclo sem limite de execução e não entra no cálculo (ver "Melhorias registradas").

## Valores adotados

| Configuração | Mínimo | Adotado | Margem sobre o pior caso |
| --- | ---: | ---: | ---: |
| `OUTBOX_REIVINDICACAO_MS` (posse do publicador) | 420000 ms (390000 + M) | **450000 ms** | 60 s |
| `PRAZO_REFERENCIA_REIVINDICACAO_MS` (posse do verificador) | 145000 ms (115000 + M) | **150000 ms** | 35 s |
| `sqs_visibility_timeout_seconds` (Terraform, `os-in`) | 420 s (390 s + M); validação do Terraform sobe de 360 para 420 | **600 s** (inalterado) | 210 s |
| `terminationGracePeriodSeconds` | 1012 s | **1020 s** | 8 s sobre o mínimo, que já inclui H e M |
| `SQS_OPERATION_DEADLINE_MS`, `SNS_OPERATION_DEADLINE_MS` | — | 45000 (inalterado) | — |
| `SQS_CONSUMER_LOTE`, `OUTBOX_PUBLISHER_LOTE` | — | 3 e 5 (inalterados) | — |
| `PRAZO_REFERENCIA_VERIFICADOR_LOTE` | — | **5** (era 10) | — |
| `PRAZO_REFERENCIA_VERIFICADOR_INTERVAL_MS` | — | 10000 (inalterado; pausa entre ciclos) | — |
| `OUTBOX_PERSISTENCIA_MS` | — | 5000 (agora lido pelo código) | — |

Antes desta correção (conferência do planejador, sem a repetição da transação em `P2002`): ciclo do consumidor de 375 s com erro permanente, lote do publicador de pelo menos 290 s sem limite efetivo de gravação contra uma posse de 300 s, verificador de 200 s (10 × 20 s) contra uma posse de 60 s, e `terminationGracePeriodSeconds` de 330 s.

Mudar lote, prazo AWS, pool, `DATABASE_TRANSACTION_TIMEOUT_MS`, `OUTBOX_PERSISTENCIA_MS` ou qualquer valor da tabela exige recalcular e conferir o teste.

## Verificador de prazo e consulta do administrador

O verificador usa o mesmo `AgendadorCicloProcessador` do consumidor e do publicador: um ciclo por vez, pausa de `PRAZO_REFERENCIA_VERIFICADOR_INTERVAL_MS` entre ciclos, e `onModuleDestroy` que aguarda o ciclo em andamento antes da desconexão do Prisma.

`ConsultaPrazoReferenciaService.emitirConsultaVigente` bloqueia a OS (`FOR UPDATE`), então o pedido do administrador (`forcarNovaTentativa = true`) e o verificador (`false`) se serializam. Resultado esperado:

| Ordem | Consultas emitidas | Estado final |
| --- | --- | --- |
| Administrador primeiro | 1 (tentativa 1) | O verificador não emite enquanto há pedido `EMITIDO` (`existeEmitido`) |
| Verificador primeiro | 2 (tentativas 1 e 2) | O pedido do administrador cria tentativa e `consultaId` novos; `consultaIdVigente` é o da tentativa 2; a resposta da tentativa 1 não altera a OS |

Em qualquer ordem há exatamente uma pendência `CONSULTA_PRAZO_REFERENCIA` aberta, `consultaPrazoTentativa` igual ao número de consultas emitidas e `consultaIdVigente` igual ao da última. Os testes estão em `test/e30-prazo-consulta.int-spec.ts` (bloco "administrador × verificador periódico").

## Ativação dos processadores

Os três processadores nascem desligados no `k8s/configmap.yaml`: `SQS_CONSUMER_HABILITADO`, `OUTBOX_PUBLISHER_HABILITADO` e `PRAZO_REFERENCIA_VERIFICADOR_HABILITADO`, todos `"false"`. O `deploy.yml` reaplica o ConfigMap inteiro a cada run, a partir do arquivo versionado. Por isso **editar o ConfigMap à mão no cluster não dura**: a próxima run do deploy desfaz a ligação em silêncio.

Procedimento durável, um processador por vez:

1. Abrir um PR para a `develop` que troque só a flag desse processador para `"true"` em `k8s/configmap.yaml`.
2. Promover à `main` pelo fluxo normal (`develop` → `main`); o `deploy.yml` aplica o ConfigMap e o rollout reinicia os pods com a flag ligada.
3. Esperar a estabilidade (métricas de outbox, DLQ, consulta emitida) antes de ligar o próximo.

Pré-condições de cada PR:

- `os-in`, `os-in-dlq`, `billing-in` e `execution-in` existem e as URLs estão publicadas no SSM (o passo "ConfigMap" do deploy falha se faltar uma).
- As permissões existem: IRSA do OS com receber e apagar na `os-in` e enviar à DLQ, e a role de CI lê os parâmetros SSM novos.
- A visibilidade de 600 s da `os-in` já foi aplicada pelo Terraform (mínimo 420 s).
- Os tempos desta página foram conferidos para os valores que estarão no ConfigMap (`src/shared/messaging/prazos-operacionais-os.spec.ts` passa).

## Melhorias registradas (não implementadas)

- No desligamento, o consumidor poderia deixar de processar as mensagens restantes do lote (elas voltam pela visibilidade): a drenagem cairia de 910 s para cerca de 650 s.
- `ProcessadorIdadeOsPorStatusService` (E35) poderia usar `executarTransacaoComLimite` e entrar no cálculo.
- Validação na partida (como a do Billing e a do Execution) que recusasse posse ou prazo menor que o mínimo calculado.
