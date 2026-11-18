# Testes BDD e de contrato

Complemento dos testes unitários, de integração e e2e do OS (D8.3, D8.8). Rodam com `yarn test:int`, no mesmo PostgreSQL local dos demais testes de integração e no job `Lint, Build e Testes` do `pr-validation.yml`. Nenhuma infraestrutura extra: sem LocalStack, sem SQS real.

## BDD (`jest-cucumber`)

Features em Gherkin, em português, só com linguagem de negócio, em `test/bdd/features/`. Os passos ficam em `test/bdd/*.int-spec.ts`.

| Feature | Cenários |
| --- | --- |
| `caminho-feliz` | Criação da OS até a entrega, com reserva antes da cobrança e pagamento antes do reparo |
| `expiracao-do-pagamento` | Prazo de referência vencido, consulta financeira, `SEM_PAGAMENTO`, compensação e `CANCELADA` |
| `cancelamento-com-compensacao` | Desistência antes de pagar, depois de pagar e logo depois do diagnóstico, sem exceção E10 |
| `recusa-de-orcamento` | `OrcamentoRejeitado`, nova rodada com os itens da anterior e independência entre rodadas |
| `reparo-com-peca-fora-da-lista` | `CONSUMO_ACIMA` e `FORA_DA_LISTA`, pendência `INVENTARIO`, ajuste do ADMINISTRADOR e `FINALIZADA` |

Billing e Execution são simulados **só nas portas** (`test/bdd/helpers/`):

- o que o OS pede a eles fica na outbox (publicador desligado) e é lido por `CaixaDeSaida`;
- o que eles respondem entra pela mesma porta do consumidor SQS (`ProcessarMensagemEntradaService`);
- a reserva usa a rota interna HTTP do OS, com o token e os cabeçalhos do Billing;
- as mensagens simuladas partem dos exemplos de `test/contratos/` e `montarMensagemDoExemplo` recusa formato diferente do exemplo.

O OS roda por inteiro e de verdade: validadores, processadores, coordenação da saga, Unit of Work, estoque e rotas HTTP autenticadas.

Cenários marcados com `test.skip` ou `it.skip` estão bloqueados por defeito do OS registrado na Saída da E32; reative quando a decisão do autor for implementada.

## Contratos

`test/contratos/billing/` e `test/contratos/execution/` guardam cópia **sem edição** dos exemplos publicados pelos donos (`ORIGEM.md` em cada pasta traz repositório, caminho e commit). `test/contratos-billing-execution.int-spec.ts`:

- confere o inventário (todos os exemplos presentes, nenhum a mais) e a direção de cada um conforme `03-service-boundaries.md`;
- valida cada exemplo recebido pelo OS com os consumidores reais: instancia o exemplo, entrega pela porta de entrada e confere o efeito persistido;
- compara cada comando emitido pelo OS com o formato do exemplo do dono;
- cobre todas as combinações de `execution.resposta-cancelamento.v1`.

Atualizar um exemplo: copie os arquivos do novo commit do dono sem alterá-los e troque o commit em `ORIGEM.md`.
