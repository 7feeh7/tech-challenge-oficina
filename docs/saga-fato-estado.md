# Saga — fato × estado, compensação e exceção E10 (E29 + E42)

Referência para `decidir(fato, ordem)` e orquestração em `CompensacaoSagaService`. Decisão: `APLICAR` | `CONCILIAR` | `IGNORAR`.

## Fluxo principal (E29)

| Fato | Estado esperado | Decisão |
| --- | --- | --- |
| `DiagnosticoIniciado` | `RECEBIDA` (rodada 1) ou início rodada ≥2 em `EM_DIAGNOSTICO` | APLICAR |
| `TarefaDevolvidaAFila` | `EM_DIAGNOSTICO` | APLICAR |
| `OrcamentoGerado` | `EM_DIAGNOSTICO` | APLICAR |
| `OrcamentoRejeitado` | `AGUARDANDO_APROVACAO` | APLICAR |
| `PagamentoConfirmado` | `AGUARDANDO_PAGAMENTO` | APLICAR |
| `ReparoIniciado` | `AGUARDANDO_EXECUCAO` | APLICAR |
| `ReparoConcluido` | `EM_EXECUCAO` | APLICAR |
| Fato de rodada antiga | Qualquer | IGNORAR |
| Pagamento repetido (`orderId` de order já paga da rodada) | Qualquer | IGNORAR |
| Pagamento concorrente (`orderId` diferente das orders já pagas) | `AGUARDANDO_EXECUCAO` / `EM_EXECUCAO` / `FINALIZADA` | CONCILIAR |
| `PagamentoTardioRegistrado` | `CANCELADA` / `ENTREGUE` | APLICAR: pendência financeira por `cobrancaId` (`natureza = PAGAMENTO_TARDIO` e `tratamento` do payload em `detalhes`), sem mudar o status |
| `EstornoConcluido` com o `orderId` de pendência `SEGUNDO_PAGAMENTO` aberta (sem `origemEstorno`) | `AGUARDANDO_EXECUCAO` / `EM_EXECUCAO` / `FINALIZADA` | APLICAR: registra `evidenciaEstornoBilling` na pendência, sem resolvê-la e sem mudar o status; em execução não resolve nenhuma outra pendência |
| `EstornoConcluido` com `origemEstorno = SEGUNDO_PAGAMENTO` (rodada vigente) | `AGUARDANDO_PAGAMENTO` / `AGUARDANDO_EXECUCAO` / `EM_EXECUCAO` / `FINALIZADA` / `EM_CANCELAMENTO` / `CANCELADA` / `ENTREGUE` | APLICAR só na pendência da própria order (pelo `orderId`): grava a evidência ou cria a pendência `SEGUNDO_PAGAMENTO` já com ela; resolvida em `CANCELADA` e `ENTREGUE`. Nunca resolve outra pendência, avança a compensação, muda status nem toca o estoque |
| `PagamentoConfirmado` de order que já tem a evidência do estorno de segundo pagamento (mensagem legada, sem `origemPagamento`) | `AGUARDANDO_PAGAMENTO` e os demais estados acima | CONCILIAR: completa a pendência da order, nunca é o pagamento da OS (sem transição nem avanço da compensação) e não abre outra pendência |
| `PagamentoConfirmado` com `origemPagamento = SEGUNDO_PAGAMENTO` (rodada vigente) | `AGUARDANDO_PAGAMENTO` e os demais estados acima | CONCILIAR só na pendência da própria order: abre ou completa a pendência `SEGUNDO_PAGAMENTO`. Nunca é o pagamento da OS, não entra na projeção financeira, não libera o reparo, não muda status e não avança a saga nem a compensação |
| `PagamentoConfirmado` com `origemPagamento = PAGAMENTO_LEGITIMO` | Qualquer | Regra atual do pagamento, em qualquer ordem de chegada em relação ao segundo pagamento e ao estorno; para order com evidência de estorno de segundo pagamento é violação de contrato (`ErroMensagemPermanente`, sem efeito) |
| `PagamentoConfirmado` com `origemPagamento` fora de `PAGAMENTO_LEGITIMO` e `SEGUNDO_PAGAMENTO` | Qualquer | Violação de contrato: `ErroMensagemPermanente` antes de qualquer efeito |

O segundo pagamento (`CONCILIAR` em `AGUARDANDO_EXECUCAO`, `EM_EXECUCAO` e `FINALIZADA`) abre uma pendência `FINANCEIRA` **informativa**, com `detalhes.natureza = 'SEGUNDO_PAGAMENTO'` (além de `orderId`, `cobrancaId` e `motivo`). Ela fica visível e aberta até o tratamento manual: não bloqueia a compensação (`temPendenciasAbertas` a ignora) nem a retomada da finalização após a resolução do inventário, e nenhum fato do Billing a resolve. O `billing.estorno-concluido.v1` com o `orderId` dela só registra a evidência em `detalhes.evidenciaEstornoBilling`; a resolução é a rota administrativa de [pendencias-os.md](contratos/pendencias-os.md). Qualquer outra pendência `FINANCEIRA`, inclusive sem `natureza`, continua impedindo a retomada da finalização. A pendência de `PagamentoConfirmado` ou `PagamentoTardioRegistrado` em `CANCELADA` e `ENTREGUE` não leva essa natureza.

O `EstornoConcluido` com `origemEstorno = SEGUNDO_PAGAMENTO` e o `PagamentoConfirmado` da mesma order são reconciliados em qualquer ordem de chegada, com o mesmo estado final nos estados em que a OS não depende do pagamento (detalhes e testes em [pendencias-os.md](contratos/pendencias-os.md#estorno-do-segundo-pagamento-em-qualquer-ordem-de-chegada)). O pagamento posterior da order estornada entra na projeção financeira (como o segundo pagamento comum), exceto em `AGUARDANDO_PAGAMENTO`: ali a OS ainda não aceitou pagamento algum e a order estornada não pode virar a "primeira order paga" do resumo financeiro. O caso conhecido fora do alcance só existe para a mensagem legada, sem `origemPagamento`: o `PagamentoConfirmado` da segunda order processado antes do da order legítima, com a OS em `AGUARDANDO_PAGAMENTO` e antes do estorno, é aceito como o pagamento da OS pois o OS classifica pelo próprio estado; quando o estorno chega, a evidência é gravada em pendência `SEGUNDO_PAGAMENTO` aberta, nada regride nem é compensado e um aviso estruturado é registrado. Com `origemPagamento` o caso não existe (próximo parágrafo).

Com o campo aditivo `origemPagamento` de `billing.pagamento-confirmado.v1` (o Billing é a fonte da verdade da classificação), o OS não presume a origem pelo estado ou pela ordem de chegada. `SEGUNDO_PAGAMENTO` nunca vira o pagamento da OS em nenhum estado; a idempotência dele é a pendência da order (aberta ou resolvida), não `ordersPagas`, pois a order não entra na projeção. `PAGAMENTO_LEGITIMO` segue a regra atual. Mensagem legada, sem o campo, mantém o comportamento descrito acima, inalterado (a Parte B), e continua válida em `v1`. Detalhes em [pendencias-os.md](contratos/pendencias-os.md#classificação-do-pagamento-origempagamento).

Order só criada (`CobrancaCriada`) ou reemitida na mesma rodada (D1.15) não conta como paga. `projecoes_financeiras_os` guarda a order emitida em `natureza = PAGAMENTO` e cada pagamento confirmado em uma linha `natureza = CONFIRMACAO` com `order_id = confirmado:<orderId>` (a unicidade da tabela é por OS, rodada e `order_id`). O resumo financeiro mostra a primeira order paga da rodada ou, sem pagamento, a order emitida mais recente.
| `OrcamentoRejeitado` | `EM_CANCELAMENTO` | IGNORAR |

## Gatilhos de compensação (E42)

| Gatilho | Estado de entrada | Efeito inicial |
| --- | --- | --- |
| Desistência (`registrarDesistencia`) | vários (exceto encerrados) | `EM_CANCELAMENTO` + avanço passo EXECUCAO |
| `CobrancaExpirada` | `AGUARDANDO_PAGAMENTO` | `EM_CANCELAMENTO` + avanço |
| `SituacaoFinanceira` `SEM_PAGAMENTO` | `AGUARDANDO_PAGAMENTO` | `EM_CANCELAMENTO` |
| `ReparoFalhou` / `ReparoInterrompido` | fora de cancelamento | `EM_CANCELAMENTO`; em `EM_CANCELAMENTO` | fato terminal execução |

## Passos da compensação (ordem fixa D4.3)

1. **EXECUCAO** — `COMANDO_CANCELAR_TAREFA` → `EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO`  
   Pulado se diagnóstico concluído sem `IniciarReparo` ou fato terminal já recebido.
2. **CONSULTA_E10** (somente reparo `JA_CONCLUIDA`) — `COMANDO_CONSULTAR_SITUACAO_FINANCEIRA` → `EVENTO_SITUACAO_FINANCEIRA`
3. **FINANCEIRO** — `COMANDO_CANCELAR_FINANCEIRO` → `EVENTO_RESPOSTA_CANCELAMENTO` (Billing)
4. **ESTOQUE** — consumir peças informadas (idempotência `estoque.consumir:compensacao:*`) + liberar reservas ativas
5. **ENCERRAMENTO** — `CANCELADA` sem pendências abertas **ou** exceção E10 → `FINALIZADA`

## Fatos em `EM_CANCELAMENTO`

| Fato | Decisão | Efeito |
| --- | --- | --- |
| `RespostaCancelamento` | APLICAR | Atualiza passo / `resultadoExecucao` (reparo `CANCELADA_SEM_INICIO` ou `CANCELADA_SEM_EXISTIR` → `REPARO_NAO_INICIADO`, D1.20) / dispara E10 se reparo `JA_CONCLUIDA`. Resposta sem os campos aditivos (sem `situacaoTarefa`) abre `INFORMACAO_INSUFICIENTE`; com o consumo da rodada já registrado, converge sem reabrir a pendência |
| `RespostaCancelamentoFinanceiro` | APLICAR | Avança estoque ou abre pendência manual |
| `SituacaoFinanceira` (consulta vigente, passo `CONSULTA_E10`) | APLICAR | Valida condições E10; `INDETERMINADA` mantém espera |
| `SituacaoFinanceira` (consultaId ≠ vigente ou passo ≠ `CONSULTA_E10`) | IGNORAR | Respostas atrasadas de consulta de prazo após `EM_CANCELAMENTO` não movem a OS |
| Entrada em `EM_CANCELAMENTO` com consulta de prazo aberta | APLICAR | Supersede pendência `CONSULTA_PRAZO_REFERENCIA`; não conta como pendência bloqueante |
| `RespostaCancelamentoFinanceiro` `PENDENCIA_MANUAL_ABERTA` | APLICAR | `aguardandoResposta = false`; retomada via `PendenciaResolvida` / `EstornoConcluido` |
| `PagamentoConfirmado` | CONCILIAR | Projeção + `avancarSeEmCancelamento` |
| `ReparoIniciado` | APLICAR | Marca `reparoIniciadoDuranteCancelamento` |
| `ReparoFalhou` / `ReparoInterrompido` | APLICAR | Fato terminal + peças; fica registrado mesmo com divergência de inventário pendente, e depois do ajuste a compensação segue ao financeiro sem reenviar `CancelarTarefa` (D4.3) |
| `EstornoConcluido` / `PendenciaResolvida` | APLICAR | Fecha pendências financeiras pós-encerramento |
| Fato de rodada antiga | IGNORAR | Sem regressão |

## Exceção E10 (D4.7)

Transição para `FINALIZADA` somente com **as quatro condições**:

1. Reparo concluído antes do cancelamento (somente tipo tarefa **REPARO** `JA_CONCLUIDA`, nunca diagnóstico)
2. `SituacaoFinanceira` autoritativa: `PAGO_NO_PRAZO`
3. Estorno: `NENHUM`
4. Estoque conciliado na compensação (`condicoesE10.estoqueConciliado`)

`INDETERMINADA` mantém `EM_CANCELAMENTO` e não libera estoque indevidamente. Diagnóstico `JA_CONCLUIDA` segue para financeiro/cancelamento normal, não E10.

## Comandos v1 (outbox; filas como fronteira externa)

| Comando | Destino | Quando |
| --- | --- | --- |
| `execution.cancelar-tarefa.v1` | `execution-in` | Passo EXECUCAO |
| `billing.consultar-situacao-financeira.v1` | `billing-in` | Passo CONSULTA_E10 |
| `billing.cancelar-financeiro.v1` | `billing-in` | Passo FINANCEIRO |

Persistência do estado de compensação: tabela `estados_compensacao_os` (`PassoCompensacaoSaga`, `condicoesE10`, `consultaIdVigente`).

## Invariantes de estoque na compensação (E26/E29)

- `possuiConsumoAplicado` com lista vazia **não** prova consumo na compensação (sempre informar peças).
- Reserva `LIBERADA` não conta como consumo; consumo exige reserva `ATIVA` ou idempotência com peças já `CONSUMIDA`.
- Liberação sem reserva existente: ignora `ReservaEstoqueNaoEncontradaError` (OS sem estoque reservado).