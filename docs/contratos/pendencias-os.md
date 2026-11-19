# Resolução manual de pendências do OS

Dono: OS Service (`tech-challenge`). Versão: `v1` (rota aditiva).

Rota administrativa para encerrar, com auditoria, as pendências que o fluxo normal não resolve sozinho. O OS **nunca inicia estorno nem envia comando ao Billing**: a resolução só reconhece um fato que o Billing já confirmou ou uma divergência que não tem estoque a ajustar.

## POST /v1/ordens-servico/{id}/pendencias/{pendenciaId}/resolucao-manual

Chamador: ADMINISTRADOR (token interno). Documentada no Swagger (`/docs`, tag "Pendências da OS").

### Cabeçalhos

```
Authorization: Bearer <token interno com perfil ADMINISTRADOR>
Idempotency-Key: <chave do chamador>
```

### Corpo da requisição

```json
{ "motivo": "Estorno conferido no painel do Billing" }
```

`motivo` é obrigatório, texto, aparado (espaços nas pontas removidos), não vazio e com no máximo 500 caracteres. Campos desconhecidos são recusados. O responsável é sempre o `sub` do token, nunca o corpo.

### Respostas

| Status | Quando |
| --- | --- |
| `204` | Pendência resolvida (ou repetição da mesma chave e do mesmo corpo, sem novo efeito) |
| `400` | Sem `Idempotency-Key`, `motivo` inválido, campo desconhecido ou id que não é UUID |
| `401` | Sem token ou token inválido |
| `403` | Perfil diferente de `ADMINISTRADOR` (`ATENDENTE`, `MECANICO` e cliente) |
| `404` | OS inexistente, pendência inexistente ou pendência de outra OS |
| `409` `PENDENCIA_NAO_ELEGIVEL` | Pendência fora dos três casos abaixo, inclusive `INFORMACAO_INSUFICIENTE`, `CONFLITO_CONSUMO`, financeira comum e pendência já resolvida |
| `409` `EVIDENCIA_BILLING_AUSENTE` | Segundo pagamento sem a evidência de estorno integral do Billing |
| `409` `CONTEUDO_DIVERGENTE` | Mesma `Idempotency-Key` com corpo (ou pendência) diferente |

Respostas `409` usam o formato `{ "codigo", "mensagem", "detalhes" }`. Erros `4xx` não gravam a chave: o reenvio corrigido com a mesma chave é aceito.

## Casos elegíveis

| Caso | Pendência | Condição | Efeito no status da OS |
| --- | --- | --- | --- |
| `SEGUNDO_PAGAMENTO_ESTORNADO` | `FINANCEIRA`, `natureza = SEGUNDO_PAGAMENTO` | `detalhes.evidenciaEstornoBilling` com o mesmo `orderId` da pendência e `tipoEstorno = INTEGRAL` | Nenhum |
| `PAGAMENTO_TARDIO_ESTORNADO_AUTOMATICAMENTE` | `FINANCEIRA`, `natureza = PAGAMENTO_TARDIO` | `detalhes.tratamento = ESTORNO_AUTOMATICO` (publicado pelo Billing depois de confirmar o estorno na consulta da order) | Nenhum |
| `DIVERGENCIA_SOMENTE_FORA_DO_CATALOGO` | `INVENTARIO`, divergência de consumo | Todas as peças divergentes fora do catálogo: identificador sem formato de UUID ou UUID sem peça cadastrada, a mesma regra do ajuste por peça (D4.8) | Retoma a finalização (`EM_EXECUCAO` → `FINALIZADA`) ou a compensação (`EM_CANCELAMENTO`) pelo mesmo caminho do ajuste, só se os demais critérios da saga estiverem satisfeitos |

A natureza `PAGAMENTO_TARDIO` e o `tratamento` do payload de `billing.pagamento-tardio-registrado.v1` são gravados em `detalhes` na abertura da pendência; pendências antigas, sem a natureza, não são elegíveis. A natureza nova não muda o bloqueio nem a resolução automática por `cobrancaId` (`billing.estorno-concluido.v1`, `billing.pendencia-resolvida.v1`).

No caso `INVENTARIO` a resolução não cria peça, não movimenta estoque, não grava `ajustes_estoque_administrativos` nem `consumos_aplicados_os` e não gera fato fictício; as divergências continuam registradas em `detalhes`. Resoluções financeiras nunca mudam o status. Nenhuma outra pendência é resolvida.

## Evidência do estorno do segundo pagamento

`billing.estorno-concluido.v1` com o `orderId` de uma pendência `SEGUNDO_PAGAMENTO` aberta registra nela `detalhes.evidenciaEstornoBilling` (`eventId`, `cobrancaId`, `orderId`, `valorEstornadoCentavos`, `tipoEstorno`, `estornadoEm`, `statusOrderMercadoPago`) em `AGUARDANDO_EXECUCAO`, `EM_EXECUCAO` e `FINALIZADA`. O registro não resolve a pendência, não muda o status e não altera a resolução das demais pendências financeiras por `cobrancaId`. A reentrega do mesmo evento não muda nada, e uma evidência integral já registrada não é substituída por um estorno posterior.

## Estorno do segundo pagamento em qualquer ordem de chegada

Vale só para `billing.estorno-concluido.v1` com `origemEstorno = SEGUNDO_PAGAMENTO` (campo aditivo; ausente ou `PENDENCIA_RESOLVIDA` mantém o comportamento anterior) na rodada vigente. A correspondência é por OS, rodada e `orderId`, e o `cobrancaId` fica gravado.

- **Contrato:** `orderId` vazio ou `tipoEstorno` diferente de `INTEGRAL` com essa origem é violação (`ErroMensagemPermanente`), recusada antes de qualquer efeito. O mesmo vale quando o `cobrancaId` do estorno (ou do `PagamentoConfirmado` posterior) difere do `cobrancaId` da pendência da order; com o `cobrancaId` ausente em um dos lados não há erro.
- **Evidência durável:** com a OS em qualquer estado a partir de `AGUARDANDO_PAGAMENTO`, o evento grava `evidenciaEstornoBilling` na pendência financeira da order (aberta ou resolvida, com ou sem natureza) ou, se ela ainda não existe, cria na mesma transação a pendência `SEGUNDO_PAGAMENTO` com `orderId`, `cobrancaId`, `eventId`, `motivo` e a evidência. Em `CANCELADA` e `ENTREGUE` a pendência da order fica resolvida (`resolvida_em` pelo relógio do banco); nos demais estados fica aberta e só sai pela rota administrativa. A mensagem é confirmada e o status nunca muda.
- **Proteção da cobrança legítima:** esse estorno nunca resolve outra pendência (cancelamento, pagamento tardio, outra order da mesma cobrança), nunca avança a compensação em `EM_CANCELAMENTO` e nunca toca reservas, estoque ou comandos.
- **`PagamentoConfirmado` posterior da mesma order:** nunca é aplicado como o pagamento da OS e não abre outra pendência; completa a pendência existente em `detalhes.pagamentoConfirmado` (`eventId`, `cobrancaId`, `valorCentavos`) sem apagar chaves. O pagamento entra em `projecoes_financeiras_os`, exceto em `AGUARDANDO_PAGAMENTO` (o resumo financeiro não pode apontar a order estornada como a paga).
- **Idempotência:** reentrega e duplicata não criam outra pendência nem substituem a evidência integral. A concorrência é serializada pelo `SELECT … FOR UPDATE` da OS.

Prova: `test/estorno-segundo-pagamento.int-spec.ts` (PostgreSQL real, as duas ordens de chegada em cada estado aplicável).

## Classificação do pagamento (`origemPagamento`)

`billing.pagamento-confirmado.v1` traz o campo aditivo `origemPagamento` (`PAGAMENTO_LEGITIMO` ou `SEGUNDO_PAGAMENTO`), preenchido pelo Billing em toda publicação nova. O OS não classifica o pagamento pelo estado quando o campo está presente.

- **`SEGUNDO_PAGAMENTO` (rodada vigente, qualquer estado a partir de `AGUARDANDO_PAGAMENTO`):** nunca confirma o pagamento da OS, não libera o reparo (nenhum `IniciarReparo`), não muda status, não avança a saga nem a compensação em `EM_CANCELAMENTO` e não entra na projeção financeira. Abre a pendência `FINANCEIRA` `natureza = SEGUNDO_PAGAMENTO` da própria order (`orderId`, `cobrancaId`, `eventId`, `motivo` e `detalhes.pagamentoConfirmado` com `eventId`, `cobrancaId` e `valorCentavos`) ou completa a existente, criada antes pelo estorno, sem abrir outra. A pendência fica aberta (em `CANCELADA` e `ENTREGUE` até o estorno resolvê-la); se já tinha a evidência integral do estorno e a OS está `CANCELADA` ou `ENTREGUE`, passa a resolvida. Reentrega e duplicata não criam outra pendência nem reescrevem a existente, mesmo depois da resolução administrativa, pois a idempotência é a pendência da order. O `cobrancaId` diferente do da pendência é violação (`ErroMensagemPermanente`).
- **`PAGAMENTO_LEGITIMO`:** regra atual do pagamento, em qualquer ordem de chegada em relação ao segundo pagamento e ao estorno (por exemplo, segundo pagamento e estorno antes, com a OS em `AGUARDANDO_PAGAMENTO`: o legítimo depois confirma o pagamento e a saga segue como antes). Para order com evidência de estorno de segundo pagamento é violação de contrato: `ErroMensagemPermanente` antes de qualquer efeito, sem registrar a mensagem como processada.
- **Valor desconhecido** em `origemPagamento` (inclusive `null` e texto vazio) é violação de contrato: `ErroMensagemPermanente` antes de qualquer efeito. `SEGUNDO_PAGAMENTO` sem `orderId` também.
- **Mensagem legada, sem `origemPagamento`:** continua válida em `v1` e mantém o comportamento da Parte B, inalterado: o OS classifica pelo próprio estado (`ordersPagas`) e pela evidência do estorno, como descrito acima.
- **Resolução administrativa:** a pendência aberta por `SEGUNDO_PAGAMENTO` é resolvida pela rota existente quando recebe a evidência integral do estorno da mesma order; sem a evidência, a rota responde `409 EVIDENCIA_BILLING_AUSENTE`.

Rodada antiga continua ignorada. Prova: `test/origem-pagamento.int-spec.ts` (PostgreSQL real, todas as ordens de chegada, cada estado, duplicatas, mensagens legadas, violações e resolução administrativa) e os exemplos do Billing em `test/contratos-billing-execution.int-spec.ts`.

Implantação coordenada: o OS sem este tratamento ignora `origemPagamento` e aceitaria o segundo pagamento como pagamento da OS; por isso a imagem implantada do OS deve conter este tratamento antes de ligar `OUTBOX_PUBLISHER_HABILITADO` do Billing.

## Auditoria (sem migration)

Na própria linha de `pendencias_os`:

- `resolvida = true`;
- `resolvida_por_id` = `sub` do token;
- `resolvida_em` = relógio do banco (`NOW()` da transação);
- `detalhes.resolucaoManual` = `{ motivo, responsavelId, resolvidaEm, caso, evidencia }`, sem alterar nem remover nenhuma chave original de `detalhes`.

## Atomicidade, concorrência e idempotência

Uma única transação (Unit of Work) executa, nesta ordem:

1. bloqueio da OS (`SELECT … FOR UPDATE`);
2. consulta da idempotência (escopo `os.pendencia.resolucao_manual`); se a chave já existe com o mesmo corpo, responde sem efeito, e com corpo diferente, `409 CONTEUDO_DIVERGENTE`;
3. bloqueio da pendência da OS e releitura sob bloqueio;
4. elegibilidade, gravação da resolução e, só para `INVENTARIO`, a retomada da saga;
5. registro da chave idempotente, só para 2xx, na mesma transação.

Duas chamadas concorrentes com chaves diferentes: uma resolve e a outra recebe `409 PENDENCIA_NAO_ELEGIVEL`, sem efeito duplicado. A mesma chave em duas chamadas concorrentes produz um único efeito.

A ordem de bloqueio (OS antes da pendência) é a mesma de [estoque-bloqueios-e-erros.md](../estoque-bloqueios-e-erros.md).
