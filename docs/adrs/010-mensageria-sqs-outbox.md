# ADR-010 — Mensageria com SQS Standard e Transactional Outbox

**Status:** aceito  
**Data:** 2026-11-15

## Contexto

Os três serviços precisam comunicar fatos de domínio de forma desacoplada e resiliente (R4-16, R4-28). A stack AWS já inclui SQS (Fase 3); o SNS existente serve as notificações. É necessário garantir que mensagens não sejam perdidas em caso de falha entre a operação de negócio e o envio à fila, sem abrir transações de banco durante chamadas externas (D2.11).

## Decisão

**SQS Standard** com uma fila de entrada e uma DLQ por serviço (D3.4). Sem FIFO, RabbitMQ, Kafka, MSK ou Amazon MQ. O SNS existente é reaproveitado exclusivamente para notificações (OS → Lambda `notificacao`); nenhum tópico SNS novo sem necessidade comprovada de fan-out.

| Fila | Dono | Quem envia | Quem lê |
| --- | --- | --- | --- |
| `<projeto>-<ambiente>-os-in` + `-dlq` | OS | Billing, Execution | OS |
| `<projeto>-<ambiente>-billing-in` + `-dlq` | Billing | OS | Billing |
| `<projeto>-<ambiente>-execution-in` + `-dlq` | Execution | OS | Execution |
| Fila da Lambda (existente) | `infra-kubernetes` | SNS | Lambda |

**Envelope** (D3.12):

```json
{
  "eventId": "uuid",
  "eventType": "<contexto>.<fato-ou-comando>.v1",
  "version": 1,
  "occurredAt": "2026-11-15T10:00:00.000Z",
  "source": "<serviço emissor>",
  "correlationId": "uuid da OS",
  "causationId": "uuid do eventId que originou, ou null",
  "ordemServicoId": "uuid",
  "rodada": 1,
  "payload": {}
}
```

`correlationId` também vai como atributo da mensagem SQS (D7.1). Mudança incompatível no contrato vira `.v2`, publicada em paralelo.

**Transactional Outbox** (D2.16, D3.6, D4.2):

1. A operação de negócio grava estado, pendência e mensagem de saída na **mesma transação** (Unit of Work, D3.16); `eventId` e `correlationId` gerados aí.
2. O publicador (temporizador dentro do processo, sem Deployment próprio) reivindica um lote (`SKIP LOCKED` no PostgreSQL; escrita condicional no DynamoDB).
3. Publica cada mensagem e confirma o envio.
4. Falha ao publicar: incrementa tentativas, libera para nova tentativa.

**Consumo** (D2.12):

1. Polling longo dentro do processo.
2. Validar o envelope; restaurar `correlationId`.
3. Em uma transação: verificar `eventId` em mensagens processadas; aplicar o efeito; gravar `eventId`; gravar mensagens de saída.
4. Apagar a mensagem SQS só depois do commit.

Duplicatas e ordem trocada são aceitas: o consumidor deduplica por `eventId` e trata fatos fora de ordem (D2.13).

**Mensagem na DLQ**: alarme e reprocessamento manual controlado, preservando o identificador original (D4.10). `maxReceiveCount` 5; visibilidade maior que o processamento; retenção da DLQ maior que a da fila principal.

## Consequências

### Positivas

- Mensagens nunca perdidas: a operação de negócio e a mensagem de saída são atômicas.
- Desacoplamento entre produtor e consumidor; independência de disponibilidade.
- Sem custo de infraestrutura adicional: aproveita SQS existente.
- Consumidores idempotentes toleram reentrega sem efeitos duplicados.

### Negativas / trade-offs

- Consistência eventual; projeções locais podem estar atrasadas (D3.8).
- Fatos fora de ordem exigem validação de rodada e precondições (D2.13).
- Publicador adiciona latência de polling; não é zero-latency.
- DLQ exige monitoramento e processo de reprocessamento manual (D4.10).

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| SQS FIFO | Custo maior; `MessageGroupId` complica balanceamento; D3.4 |
| Kafka (MSK) | Custo, complexidade e operação sem justificativa; D3.3 |
| RabbitMQ (Amazon MQ) | Idem; D3.3 |
| Debezium / CDC | Dependência de nova infraestrutura; D2.16 |
| Publicador em microsserviço dedicado | Ponto de falha extra; D3.6 |

## Referências

- [`decisoes.md`](../../spec/fase-4/decisoes.md): D2.12, D2.13, D2.16, D3.3, D3.4, D3.6, D3.9, D3.12, D4.2, D4.10
- [05-communication.md](../../spec/fase-4/05-communication.md)
- [ADR-009](009-saga-orquestrada.md)
