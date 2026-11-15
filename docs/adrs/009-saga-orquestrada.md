# ADR-009 — Saga orquestrada no OS Service

**Status:** aceito  
**Data:** 2026-11-15

## Contexto

A abertura de uma OS dispara operações em três serviços distintos: diagnóstico no Execution, orçamento e pagamento no Billing, execução de volta no Execution. Essas operações não podem ser coordenadas por uma transação distribuída (Two-Phase Commit), que tem custo operacional alto e indisponibilidade em caso de falha parcial. O Saga Pattern é o padrão adequado para manter consistência eventual com compensação explícita (R4-18, R4-19, R4-20).

## Decisão

Saga orquestrada dentro do OS Service, sem microsserviço externo de workflow nem motor de orquestração (D4.1). O estado da saga é persistido na própria OS, junto com os pedidos emitidos e as pendências de compensação (D4.2). README e PDF declaram "orquestração centrada no OS Service" (R4-21, R4-45).

**Passos síncronos** (D3.5): apenas dois usam HTTP interno com resposta imediata:
1. Conclusão do diagnóstico: Execution → OS (`POST /internal/ordens-servico/{id}/diagnostico`).
2. Reserva de estoque na aprovação: Billing → OS (`POST /internal/ordens-servico/{id}/reservas`).

Todos os demais passos são assíncronos via SQS (ver ADR-010).

**Compensação** (D4.3): caminho único, na ordem Execution → Billing → estoque. O OS coordena; cada serviço executa as compensações do próprio domínio. Um único comando de cancelamento financeiro ao Billing; o Billing responde com a situação final e bloqueia cobranças futuras da mesma OS e rodada.

**Cancelamento antecipado** (D4.4): um bloqueio é persistido atomicamente antes da criação da operação, impedindo que mensagens atrasadas recriem tarefas ou cobranças já canceladas.

**Prazo de pagamento** (D4.5, D4.6): o OS fixa o prazo de referência na reserva (relógio do banco); o Billing calcula `prazoPagamento = prazoReferencia − carência`. Vencido o prazo sem confirmação, o OS consulta o Billing de forma assíncrona antes de iniciar a compensação; estoque não é liberado enquanto a situação for desconhecida.

| Configuração | Produção | Demonstração |
| --- | --- | --- |
| Prazo de pagamento | 60 min | 3 min |
| Carência | 15 min | 2 min |
| Prazo total da reserva | 75 min | 5 min |
| Verificação periódica | 60 s | 10 s |

**Exceção E10** (D4.7): `EM_CANCELAMENTO → FINALIZADA` quando todas as condições abaixo são satisfeitas:
1. O Execution confirma que a tarefa de **reparo** foi concluída antes de aceitar o cancelamento.
2. O Billing confirma a validade do pagamento correspondente.
3. Não há estorno realizado, em andamento ou indeterminado.
4. O estoque está conciliado (D4.8).

Resposta indeterminada mantém a OS em `EM_CANCELAMENTO` com novas tentativas e alerta operacional.

**Verificação periódica** dentro do processo, sem infraestrutura adicional (D4.9). Resultado indeterminado responde HTTP 202 e é consultável depois.

**Fatos fora de ordem** (D2.13): tratados com validação de rodada, identificador da operação, estado atual e precondições. Fatos tardios não fazem a OS regredir; eventos financeiros tardios são conciliados.

**Concorrência** (D2.11): bloqueio pessimista (`SELECT ... FOR UPDATE`) nas operações que alteram a OS. Nenhum bloqueio aberto durante chamada HTTP ou publicação de mensagem.

## Consequências

### Positivas

- Estado da saga colocado na OS: sem dependência de serviço externo; falha do OS não deixa a saga em estado desconhecido.
- Compensação com caminho único e determinístico (D4.3).
- BDD cobre caminho feliz, expiração e cancelamento com compensação (D8.3).
- Sem custo de motor externo de workflow (D0.3).

### Negativas / trade-offs

- O OS é o ponto central; sua indisponibilidade para a saga (aceito: D1.21).
- Eventos assíncronos exigem tratamento de fatos fora de ordem (D2.13) e idempotência (D2.12).
- Prazo de pagamento em demonstração (3 min) requer configuração por ambiente (D4.6).

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| Coreografia pura | Difícil rastrear o estado global e coordenar compensações distribuídas; D4.1 |
| Motor externo (Step Functions, Temporal) | Custo e complexidade desnecessários; D0.3, D4.1 |
| Saga em microsserviço dedicado | Introduz ponto de falha extra sem ganho justificável; D1.1 |

## Referências

- [`decisoes.md`](../../spec/fase-4/decisoes.md): D4.1–D4.10, D2.11–D2.13, E10
- [06-saga.md](../../spec/fase-4/06-saga.md)
- [ADR-008](008-divisao-em-microsservicos.md)
