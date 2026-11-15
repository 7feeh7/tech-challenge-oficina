# ADR-014 — Observabilidade distribuída

**Status:** aceito  
**Data:** 2026-11-15

## Contexto

Com três serviços coordenados por uma saga, rastrear o fluxo de uma OS distribuída requer que todos os logs, traces e métricas compartilhem um identificador comum. ADR-007 estabeleceu Datadog para a Fase 3; a Fase 4 estende a observabilidade ao novo contexto distribuído sem introduzir novas ferramentas (D7.1, R4-29).

## Decisão

**`correlationId`** (D3.9, D5, D7.1): um `correlationId` por OS, gerado na abertura, persistido e propagado em todas as operações: HTTP interno, mensagens SQS, outbox, webhooks e logs. Não substitui `eventId`, identificadores de operação nem chaves de idempotência. Webhooks do Mercado Pago recuperam o `correlationId` a partir da cobrança persistida.

**Logs estruturados** (D7.1): `correlationId`, `eventId` e identificadores relevantes em todos os logs. Sem credenciais, tokens, dados financeiros sensíveis ou dados pessoais desnecessários nos logs.

**Traces** (D7.1): validar a propagação do `dd-trace` através do SQS e entre a operação de negócio e o publicador da outbox. A jornada completa não precisa pertencer a um único trace; o `correlationId` liga os fragmentos.

**Datadog existente** (D7.3): 13 monitores reaproveitados e adaptados. Novos monitores:
- DLQ por serviço (cada serviço tem sua DLQ).
- Outbox atrasada (mensagens não publicadas além do threshold).
- OS parada numa etapa (saga sem progresso além do prazo esperado).
- Situação financeira indeterminada (D4.5).
- Falhas técnicas no Mercado Pago (diferenciadas de resultados esperados).

Dashboard "Saga da OS" com as transições de status e os indicadores do fluxo distribuído.

**Lambdas** (D7.2): continuam com CloudWatch e X-Ray, sem Datadog Forwarder nem instrumentação adicional. Notificações propagam o `correlationId`; autenticações sem OS associada usam identificador próprio da requisição.

**Demonstração** (D7.4, D9.6): seis cenas planejadas:
1. Caminho feliz rastreado por `correlationId`.
2. Expiração do pagamento com prazos de demonstração.
3. Desistência em `AGUARDANDO_PAGAMENTO`.
4. Indisponibilidade do Billing com retomada automática.
5. Dashboard e monitor de saga.
6. Pipeline automatizado com testes, qualidade e deploy.

**Métricas** (D7.1): identificadores únicos (`correlationId`, `ordemServicoId`) não são tags de métricas customizadas (cardinalidade e custo do Datadog).

## Consequências

### Positivas

- `correlationId` permite reconstruir a jornada completa de uma OS em qualquer ferramenta de observabilidade.
- Sem nova ferramenta; reaproveitamento do Datadog existente (D0.3, R4-29).
- Monitores de DLQ e outbox atrasada detectam falhas silenciosas na mensageria.

### Negativas / trade-offs

- Trace distribuído por SQS pode fragmentar o contexto do `dd-trace` entre publicador e consumidor.
- Lambdas fora do Datadog limitam a visibilidade do fluxo na borda (aceito: D7.2).
- Sem `correlationId` não é possível rastrear autenticações anteriores à abertura da OS (identificador próprio por requisição: D7.2).

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| OpenTelemetry + Jaeger | Ferramenta nova; custo e operação; D0.3 |
| Datadog Forwarder para Lambdas | Custo adicional; D7.2 |
| `correlationId` como tag de métrica | Cardinalidade alta; custo do Datadog; D7.1 |

## Referências

- [`decisoes.md`](../../spec/fase-4/decisoes.md): D7.1–D7.5, D3.9
- [08-observability.md](../../spec/fase-4/08-observability.md)
- [ADR-007](007-observabilidade-datadog.md)
