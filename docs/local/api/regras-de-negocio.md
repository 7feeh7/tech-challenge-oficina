# Regras de Negócio

Contratos HTTP das rotas citadas aqui em [api.md](api.md).

## Fila de ordens de serviço (`GET /ordens-servico`)

Sem filtro, a listagem devolve a **fila de trabalho**:

- **Exclusão lógica** das OS encerradas (`FINALIZADA`, `CANCELADA` e `ENTREGUE`) — elas continuam no banco, apenas somem da fila;
- Ordenação pela coluna persistida `prioridade_fila` (menor número = mais urgente): **Em Execução > Aguardando Execução > Aguardando Pagamento > Aguardando Aprovação > Em Diagnóstico > Recebida > Em Cancelamento**;
- Dentro da mesma prioridade, as **mais antigas primeiro** (`criado_em`); a paginação usa o mesmo critério.

A prioridade é recalculada pela entidade a cada mudança de status e persistida junto com ela, o que permite índice `(prioridade_fila, criado_em)` e paginação estável.

Informar `?status=` consulta um status específico, inclusive os encerrados (útil para auditoria e para o histórico do cliente).

## Máquina de estados da OS

As transições válidas vivem em [status-os.ts](../../../src/modules/ordens-servico/domain/status-os.ts). A entidade `OrdemServico` **não expõe** um `alterarStatus` genérico: cada passo da saga é um método com a intenção de negócio (`registrarOrcamentoGerado`, `registrarReservaConfirmada`, `registrarDesistencia`, `registrarRetirada` etc.), que valida a transição, recalcula a prioridade e carimba os marcos de tempo (`iniciadaEm`, `finalizadaEm`, `entregueEm`).

Fluxo normal:

```
RECEBIDA → EM_DIAGNOSTICO → AGUARDANDO_APROVACAO → AGUARDANDO_PAGAMENTO → AGUARDANDO_EXECUCAO → EM_EXECUCAO → FINALIZADA → ENTREGUE
```

| Status atual           | Transições permitidas                                                   |
| ---------------------- | ----------------------------------------------------------------------- |
| `RECEBIDA`             | `EM_DIAGNOSTICO`, `EM_CANCELAMENTO`                                     |
| `EM_DIAGNOSTICO`       | `RECEBIDA` (devolução da tarefa à fila), `AGUARDANDO_APROVACAO`, `EM_CANCELAMENTO` |
| `AGUARDANDO_APROVACAO` | `EM_DIAGNOSTICO` (recusa), `AGUARDANDO_PAGAMENTO`, `EM_CANCELAMENTO`    |
| `AGUARDANDO_PAGAMENTO` | `AGUARDANDO_EXECUCAO`, `EM_CANCELAMENTO`                                |
| `AGUARDANDO_EXECUCAO`  | `EM_EXECUCAO`, `EM_CANCELAMENTO`                                        |
| `EM_EXECUCAO`          | `FINALIZADA`, `EM_CANCELAMENTO`                                         |
| `EM_CANCELAMENTO`      | `CANCELADA`, `FINALIZADA` (exceção: reparo concluído antes do cancelamento) |
| `FINALIZADA`           | `ENTREGUE`                                                              |
| `CANCELADA`, `ENTREGUE`| — (estado final)                                                        |

Repetir o status atual é aceito e tratado como no-op. `RECEBIDA → AGUARDANDO_APROVACAO` **não existe mais**: um orçamento só nasce depois do diagnóstico.

Hoje o Orçamento, a reserva e a desistência movem a OS pela API. Os demais passos (diagnóstico, pagamento, reparo, cancelamento concluído) só têm o método de entidade pronto: quem os dispara são os handlers de eventos das etapas seguintes.

### Aplicação centralizada das transições

Toda mudança de status passa por `TransicaoOrdemServicoService`, dentro de uma Unit of Work:

1. trava a linha da OS (`SELECT … FOR UPDATE`) — duas requisições concorrentes na mesma OS se serializam;
2. recarrega a OS e aplica o método de intenção;
3. grava, **na mesma transação**: o novo status, a linha de `historico_status_os` (com `event_id`, `rodada`, `ocorrido_em`, `motivo`) e a mensagem `ordem-servico.status-changed.v1` no outbox (destino: tópico de notificação).

O `correlationId` usado nas mensagens é o **persistido na OS** (gerado na abertura), não o da requisição HTTP: toda a vida da OS compartilha o mesmo `correlationId`, em qualquer serviço.

## Abertura, edição e encerramento da OS

- **Abertura** (`POST /ordens-servico`): a OS nasce `RECEBIDA`, na rodada 1. Serviços e peças informados viram **sugestões** (`sugestoes_itens_os`, só `tipo`, `itemId` e `quantidade`) — **não são itens oficiais e não têm preço**. O preço congela quando o diagnóstico é concluído (E28). A abertura também grava o comando `execution.iniciar-diagnostico.v1` no outbox (fila do Execution) e rejeita `diagnostico` no corpo (`400`).
- **Edição** (`PATCH /ordens-servico/:id`): só `descricaoProblema`, e só em `RECEBIDA` antes de o diagnóstico começar. Outro campo devolve `400`; fora desse estado, `409`. Não gera histórico nem notificação.
- **Itens oficiais**: só são editáveis em `EM_DIAGNOSTICO`, antes de o diagnóstico ser concluído. Uma nova rodada **substitui** os itens da rodada anterior no momento da conclusão.
- **Desistência** (`POST /ordens-servico/:id/desistencia`, corpo `{ motivo }`): de `RECEBIDA` até `EM_EXECUCAO` leva a OS a `EM_CANCELAMENTO`, guardando a etapa de origem e o motivo. É idempotente: repetir preserva o primeiro motivo. Em `FINALIZADA`, `CANCELADA` ou `ENTREGUE`, `409`. A conclusão do cancelamento (`CANCELADA`) é feita pela saga, não pela API.
- **Retirada** (`POST /ordens-servico/:id/retirada`): em `FINALIZADA` entrega o veículo (`ENTREGUE`); em `EM_CANCELAMENTO`/`CANCELADA` só registra a devolução física (`devolvida_em`), e apenas depois de o veículo estar liberado (`veiculo_liberado_retirada`). Idempotente; fora desses casos, `409`.
- **Remoção**: `DELETE /ordens-servico/:id` **não existe mais** — a OS é histórico, e o encerramento é a desistência.

## Recusa do orçamento, renegociação e nova rodada

A decisão do cliente sobre o preço **não é um status da OS** — os status descrevem onde o carro está no processo, e a decisão comercial vive no orçamento (`APROVADO` / `REJEITADO`, com `motivoRejeicao` e `rejeitadoEm`).

- **Gerar orçamento** (`POST /orcamentos`): exige a OS em `EM_DIAGNOSTICO` (`400` caso contrário) e a move para `AGUARDANDO_APROVACAO`.
- **Recusa** (`PATCH /orcamentos/:id` com `status: REJEITADO`): é uma rodada de negociação. O orçamento é rejeitado e a OS **volta para `EM_DIAGNOSTICO` numa nova rodada** (`rodada_vigente + 1`); o `diagnostico_concluido_em` é zerado e um novo `execution.iniciar-diagnostico.v1` (com `rodada` incrementada e os itens oficiais anteriores como sugestões) é gravado no outbox.
- **Aprovação** (`PATCH /orcamentos/:id` com `status: APROVADO`): **reserva** o estoque das peças da OS e move a OS para `AGUARDANDO_PAGAMENTO`, na mesma transação. A baixa definitiva só acontece na execução. Estoque insuficiente devolve `400` e nada é gravado.
- **Nova proposta**: basta um novo `POST /orcamentos` com o mesmo `ordemServicoId` depois da recusa. Só pode existir **uma proposta viva por vez**: criar outro orçamento enquanto o atual aguarda aprovação devolve `409`.

Uma OS encerrada sem execução nunca tem `iniciadaEm`, e por isso **fica fora das métricas de tempo** — uma desistência não distorce o tempo médio de atendimento da oficina.

## Estoque

- A movimentação (`POST /movimentacoes-estoque`) e o ajuste do saldo da peça acontecem na **mesma transação**: histórico e saldo não divergem.
- Aprovar um orçamento **reserva** as peças da OS (`quantidade_reservada`); o saldo físico não muda até a execução.
- Os itens oficiais da OS congelam o `precoUnitario` na conclusão do diagnóstico, então mudar o catálogo depois não altera OS já em andamento.

## Notificação de status

**Toda** mudança de status da OS avisa o cliente, sem que o caso de uso precise chamar um notificador: o `TransicaoOrdemServicoService` grava `ordem-servico.status-changed.v1` no outbox **na mesma transação** que muda o status. O publicador do outbox entrega ao tópico SNS de notificação (`API → outbox → SNS → SQS → Lambda → SendGrid`).

| Ação                                        | Transição                       | Aviso |
| ------------------------------------------- | ------------------------------- | ----- |
| `POST /ordens-servico`                      | `null` → `RECEBIDA`             | ✉️    |
| `POST /ordens-servico/:id/desistencia`      | → `EM_CANCELAMENTO`             | ✉️    |
| `POST /ordens-servico/:id/retirada`         | `FINALIZADA` → `ENTREGUE`       | ✉️    |
| `POST /orcamentos`                          | → `AGUARDANDO_APROVACAO`        | ✉️    |
| `PATCH /orcamentos/:id` (aprovar)           | → `AGUARDANDO_PAGAMENTO`        | ✉️    |
| `PATCH /orcamentos/:id` (recusar)           | → `EM_DIAGNOSTICO`              | ✉️    |

O aviso só sai quando a OS **realmente muda de status**: reenviar a mesma decisão é idempotente e não gera nova mensagem. Como o outbox é transacional, não existe mais "OS mudou mas o aviso se perdeu" nem o inverso; a entrega é *at-least-once* e o consumidor deduplica por `eventId`. Contratos em [eventos-os.md](../../contratos/eventos-os.md).


## Métricas de tempo

`GET /ordens-servico/metricas/tempo-medio` calcula:

- **Tempo médio de execução**: `iniciadaEm` → `finalizadaEm`;
- **Tempo médio de ciclo total**: `criadoEm` → `entregueEm`.

Ambas consideram apenas OS que passaram pela execução, e aceitam recorte por `dataInicio` / `dataFim`.

## Autenticação de cliente por CPF

- Somente CPF válido de pessoa física (11 dígitos) autentica; CNPJ não entra neste fluxo.
- Cliente **inexistente** e **inativo** recebem a mesma resposta `401` na Function (anti-enumeração).
- Token de cliente não contém PII; expira em 1h; **sem refresh token**.
- Perfil `CLIENTE` consulta apenas a própria OS (`GET /ordens-servico/:id`) e decide sobre o próprio orçamento (`GET` e `PATCH /orcamentos/:id` com restrição de campos).

## Inativação de cliente

- Campo `ativo` controla autenticação por CPF.
- Inativar não cancela OS em andamento: a oficina conclui o atendimento em curso.
- Reativação por `ADMINISTRADOR` ou `ATENDENTE` via `PATCH /clientes/:id/status`.
- Toda mudança de status gera registro em `auditoria_cliente_status` com `alteradoPorId`.
