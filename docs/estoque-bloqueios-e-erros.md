# Estoque — ordem dos bloqueios e erros de concorrência

Complemento da E26 (2026-11-16). Todas as operações que alteram reservas, pendências de inventário ou saldo físico seguem a **mesma ordem de bloqueio** no PostgreSQL, para evitar *deadlock*:

1. **Ordem de serviço** (`ordens_servico`), quando a operação envolve compensação, consumo efetivo (complemento E29), resolução manual de consumo (complemento E42) ou ajuste administrativo — `SELECT … FOR UPDATE` pela `id` da OS.
2. **Registro de consumo aplicado** (`consumos_aplicados_os`) — leitura única por OS e rodada **depois** do bloqueio da OS.
3. **Resolução manual de consumo** (`resolucoes_consumo_manuais`) — leitura única por OS e rodada **depois** do consumo aplicado e **antes** de pendências, reservas e peças (exclusão mútua com consumo automático na mesma transação). Endpoint `POST /reservas-estoque/resolucoes-consumo-manual` (ADMINISTRADOR, `Idempotency-Key`): fotografia `itens_consumidos` / `itens_liberados`, movimenta reservas sem `consumos_aplicados_os`, resolve pendência `INFORMACAO_INSUFICIENTE` e retoma saga na mesma transação.
4. **Pendência** (`pendencias_os`), no ajuste administrativo ou na resolução manual inicial — `SELECT … FOR UPDATE` pela `id` da pendência, **depois** dos registros de consumo, com revalidação de `resolvida = false` na mesma transação.
5. **Reservas ativas** da OS e rodada — `SELECT … FROM reservas_estoque WHERE situacao = 'ATIVA' … ORDER BY peca_id FOR UPDATE`.
6. **Peças** — `SELECT … FROM pecas WHERE id = … FOR UPDATE`, sempre na ordem crescente de `peca_id` (ajustes administrativos gravados **depois** das peças).

Operações afetadas: reservar, liberar, consumir, entrada e baixa manual, atualização de peça com quantidade física e ajuste administrativo de divergência.

Na rota interna `POST /internal/ordens-servico/{id}/reservas` (E28) e no ajuste administrativo com retomada da compensação (complemento E30), a ordem de serviço é bloqueada **antes** da pendência, reservas e peças, na mesma transação do Unit of Work do chamador.

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
| Reserva repetida na mesma OS, rodada e peça (`P2002` em `reservas_estoque`) | `ReservaDuplicadaInternaError` (`ESTADO_INCOMPATIVEL` na rota interna) | 409 |

Violações de `CHECK` ou índice único no banco são convertidas em erros de domínio acima sempre que possível; não devem chegar ao cliente como 500 genérico.