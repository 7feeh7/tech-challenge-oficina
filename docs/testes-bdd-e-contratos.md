# Testes BDD e de contrato

Complemento dos testes unitários, de integração e e2e do OS (D8.3, D8.8). Rodam com `yarn test:int`, no mesmo PostgreSQL local dos demais testes de integração e no job `Lint, Build e Testes` do `pr-validation.yml`. Nenhuma infraestrutura extra: sem LocalStack, sem SQS real.

## BDD (`jest-cucumber`)

Features em Gherkin, em português, só com linguagem de negócio, em `test/bdd/features/`. Os passos ficam em `test/bdd/*.int-spec.ts`.

| Feature | Cenários |
| --- | --- |
| `caminho-feliz` | Criação da OS até a entrega, com reserva antes da cobrança, `CobrancaCriada` antes do `PagamentoConfirmado` e pagamento antes do reparo |
| `expiracao-do-pagamento` | (1) Prazo de referência vencido, consulta financeira, `SEM_PAGAMENTO`, compensação e `CANCELADA`; (2) `CobrancaExpirada`, compensação e `CANCELADA` |
| `cancelamento-com-compensacao` | Desistência antes de pagar, depois de pagar e antes do início do reparo (estorno) e logo depois do diagnóstico, sem exceção E10 |
| `recusa-de-orcamento` | `OrcamentoRejeitado`, nova rodada com os itens da anterior e independência entre rodadas |
| `reparo-com-peca-fora-da-lista` | `CONSUMO_ACIMA` e `FORA_DA_LISTA`, pendência `INVENTARIO`, ajuste do ADMINISTRADOR por peça e `FINALIZADA` só depois do ajuste das duas peças |

Billing e Execution são simulados **só nas portas** (`test/bdd/helpers/`):

- o que o OS pede a eles fica na outbox (publicador desligado) e é lido por `CaixaDeSaida`;
- o que eles respondem entra pela mesma porta do consumidor SQS (`ProcessarMensagemEntradaService`);
- a reserva (Billing) e a conclusão do diagnóstico (Execution) usam as rotas internas HTTP do OS, com o token, a chave de idempotência e o `tarefaId` (`<osId>#<rodada>#DIAGNOSTICO`) que cada serviço envia, e exigem o status 200;
- as mensagens simuladas partem dos exemplos de `test/contratos/` e `montarMensagemDoExemplo` recusa formato diferente do exemplo;
- os cenários usam só as respostas que cada serviço de fato envia: `CobrancaCriada` antes do `PagamentoConfirmado`, `ESTORNADA` para cobrança paga com reparo não iniciado, `CANCELADA` para cobrança sem pagamento (inclusive `EXPIRADA`) e nenhuma resposta extra.

O OS roda por inteiro e de verdade: validadores, processadores, coordenação da saga, Unit of Work, estoque e rotas HTTP autenticadas.

## Contratos

`test/contratos/billing/` e `test/contratos/execution/` guardam a **única** cópia versionada, **sem edição**, dos exemplos publicados pelos donos (`ORIGEM.md` em cada pasta traz repositório, caminho e commit: Billing em `568e04e`, idêntico na `develop` em `c7e16e6`; Execution em `b8d52c6`). Todos os testes que precisam de um exemplo o leem dali (`test/helpers/exemplos-contrato.ts`); não há outra cópia em `test/fixtures/`.

`test/contratos-billing-execution.int-spec.ts`:

- confere o inventário (todos os exemplos presentes, nenhum a mais) e a direção de cada um conforme `03-service-boundaries.md`;
- valida cada exemplo recebido pelo OS com os consumidores reais: instancia o exemplo, entrega pela porta de entrada e confere o efeito persistido;
- compara cada comando emitido pelo OS (`cancelar-tarefa`, `cancelar-financeiro` e os demais) com o formato do exemplo do dono;
- cobre todas as combinações de `execution.resposta-cancelamento.v1`, inclusive o exemplo de retrocompatibilidade (sem os campos aditivos), que abre a pendência `INFORMACAO_INSUFICIENTE`.

Atualizar um exemplo: copie os arquivos do novo commit do dono sem alterá-los e troque o commit em `ORIGEM.md`.

## Provas que já existiam e não foram repetidas

| Critério | Prova |
| --- | --- |
| Orders da rodada (reemissão, pagamento da order criada, repetição, segundo pagamento) em vez da premissa antiga de uma order por rodada | `test/saga-pagamento-orders.int-spec.ts` |
| Informação insuficiente, fato terminal com divergência, ajuste do ADMINISTRADOR, financeiro e `CANCELADA` | `test/saga-cancelamento-correcoes.int-spec.ts` (bloco "P3") |
| Rotas internas respondem 200 e aceitam o `tarefaId` composto | `test/rotas-internas-http.e2e-spec.ts` |
| Ajuste administrativo por peça (perfil, resolução só com todas as peças ajustadas) | `test/ajuste-estoque-por-peca.e2e-spec.ts` |
