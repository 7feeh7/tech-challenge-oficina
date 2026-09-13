# Regras de Negócio

Contratos HTTP das rotas citadas aqui em [api.md](api.md).

## Fila de ordens de serviço (`GET /ordens-servico`)

Sem filtro, a listagem devolve a **fila de trabalho**:

- **Exclusão lógica** das OS `FINALIZADA` e `ENTREGUE` — elas continuam no banco, apenas somem da fila;
- Ordenação por prioridade de status: **Em Execução > Aguardando Aprovação > Diagnóstico > Recebida**;
- Dentro de cada status, as **mais antigas primeiro**.

Informar `?status=` consulta um status específico, inclusive os encerrados (útil para auditoria e para o histórico do cliente).

## Máquina de estados da OS

As transições válidas vivem em [status-os.ts](../src/modules/ordens-servico/domain/status-os.ts) e são aplicadas pela entidade `OrdemServico.alterarStatus()`, que também carimba os marcos de tempo (`iniciadaEm`, `finalizadaEm`, `entregueEm`).

Fluxo normal:

```
RECEBIDA → EM_DIAGNOSTICO → AGUARDANDO_APROVACAO → EM_EXECUCAO → FINALIZADA → ENTREGUE
```

| Status atual           | Transições permitidas                                  |
| ---------------------- | ------------------------------------------------------ |
| `RECEBIDA`             | `EM_DIAGNOSTICO`, `AGUARDANDO_APROVACAO`               |
| `EM_DIAGNOSTICO`       | `AGUARDANDO_APROVACAO`, `RECEBIDA`, `FINALIZADA`       |
| `AGUARDANDO_APROVACAO` | `EM_EXECUCAO`, `EM_DIAGNOSTICO`, `FINALIZADA`          |
| `EM_EXECUCAO`          | `FINALIZADA`                                           |
| `FINALIZADA`           | `ENTREGUE`                                             |
| `ENTREGUE`             | — (estado final)                                       |

Repetir o status atual é aceito e tratado como no-op.

**Todos** os caminhos que movem a OS passam por essa entidade — inclusive os disparados pelo módulo de orçamentos, que a carrega dentro da própria transação. Uma transição inválida devolve `400` e desfaz a transação inteira: não fica orçamento gravado com a OS parada.

## Recusa do orçamento, renegociação e desistência

A decisão do cliente sobre o preço **não é um status da OS** — os seis status descrevem onde o carro está no processo, e a decisão comercial vive no orçamento (`APROVADO` / `REJEITADO`, com `motivoRejeicao` e `rejeitadoEm`).

- **Recusa** (`PATCH /orcamentos/:id` com `status: REJEITADO`): é uma rodada de negociação. O orçamento é rejeitado e a OS **volta para `EM_DIAGNOSTICO`**, para ser reavaliada.
- **Nova proposta**: basta um novo `POST /orcamentos` com o mesmo `ordemServicoId` — uma OS aceita vários orçamentos, e a negociação inteira fica auditável em `GET /ordens-servico/:id`. Só pode existir **uma proposta viva por vez**: criar um segundo orçamento enquanto o atual aguarda aprovação devolve `409`.
- **Desistência**: se o cliente não quer mais o serviço, a OS é encerrada **sem execução** — `EM_DIAGNOSTICO` ou `AGUARDANDO_APROVACAO` → `FINALIZADA` → `ENTREGUE`. Depois que a execução começou isso não vale mais, porque o estoque já foi consumido.

Uma OS encerrada sem execução nunca tem `iniciadaEm`, e por isso **fica fora das métricas de tempo** — uma desistência não distorce o tempo médio de atendimento da oficina.

## Estoque

- A movimentação (`POST /movimentacoes-estoque`) e o ajuste do saldo da peça acontecem na **mesma transação**: histórico e saldo não divergem.
- Aprovar um orçamento **dá baixa automática** no estoque das peças da OS. Estoque insuficiente devolve `400` e nada é gravado.
- Os itens da OS congelam o `precoUnitario` no momento da abertura, então mudar o catálogo depois não altera OS já abertas.

## Notificação de status por e-mail

**Toda** mudança de status da OS avisa o cliente por e-mail, pelo **SendGrid** — inclusive as disparadas pelo módulo de orçamentos:

| Ação                              | Transição                 | Aviso |
| --------------------------------- | ------------------------- | ----- |
| `PATCH /ordens-servico/:id`       | qualquer transição válida | ✉️    |
| `POST /orcamentos`                | → `AGUARDANDO_APROVACAO`  | ✉️    |
| `PATCH /orcamentos/:id` (aprovar) | → `EM_EXECUCAO`           | ✉️    |
| `PATCH /orcamentos/:id` (recusar) | → `EM_DIAGNOSTICO`        | ✉️    |

O aviso só sai quando a OS **realmente muda de status**: reenviar a mesma decisão é idempotente e não gera novo e-mail.

O envio é _best-effort_: se o provedor falhar ou não estiver configurado, o erro vai para o log e a OS **não** deixa de ser atualizada — a operação já foi persistida, e um 500 por causa de e-mail seria mentir para o usuário.

A regra vive nos casos de uso, que só conhecem a porta `NotificadorDeStatusGateway`. Trocar SendGrid por SMS ou webhook é escrever outro adaptador em `modules/ordens-servico/infra/notification/`, sem tocar em domínio nenhum. O módulo de orçamentos importa `OrdensServicoModule` e reusa a mesma porta — a dependência é de mão única (o módulo de OS não conhece orçamentos).

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
