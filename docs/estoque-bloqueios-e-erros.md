# Estoque — ordem dos bloqueios e erros de concorrência

Complemento da E26 (2026-11-16). Todas as operações que alteram reservas, pendências de inventário ou saldo físico seguem a **mesma ordem de bloqueio** no PostgreSQL, para evitar *deadlock*:

1. **Pendência** (`pendencias_os`), quando a operação envolve ajuste administrativo — `SELECT … FOR UPDATE` pela `id` da pendência.
2. **Reservas ativas** da OS e rodada — `SELECT … FROM reservas_estoque WHERE situacao = 'ATIVA' … ORDER BY peca_id FOR UPDATE`.
3. **Peças** — `SELECT … FROM pecas WHERE id = … FOR UPDATE`, sempre na ordem crescente de `peca_id`.

Operações afetadas: reservar, liberar, consumir, entrada e baixa manual, atualização de peça com quantidade física e ajuste administrativo de divergência.

## Transições de reserva

Liberação e consumo só alteram linhas lidas sob bloqueio com situação `ATIVA`. A mudança de situação usa `UPDATE … WHERE situacao = 'ATIVA'`; se a contagem de linhas afetadas for diferente de 1, a transação é desfeita antes de alterar a peça.

## Erros de negócio (resumo)

| Situação | Erro | HTTP |
| --- | --- | --- |
| Disponível insuficiente (reserva ou baixa) | `EstoqueInsuficienteReservaError` / `EstoqueInsuficienteError` | 409 |
| Físico abaixo do reservado (ajuste ou atualização de peça) | `EstoqueFisicoAbaixoReservadoError` | 409 |
| Consumo sem reserva ativa, mas já liberada/consumida | `ReservaJaProcessadaError` | 409 |
| Consumo/liberar sem nenhuma reserva na rodada | `ReservaEstoqueNaoEncontradaError` | 404 |
| Ajuste com pendência já resolvida (concorrência) | `PendenciaInventarioJaResolvidaError` | 409 |

Violações de `CHECK` ou índice único no banco são convertidas em erros de domínio acima sempre que possível; não devem chegar ao cliente como 500 genérico.