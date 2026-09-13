# RFC-004 — Serverless de notificação e mensageria

**Status:** aceito  
**Autores:** equipe Tech Challenge  
**Revisores:** —  
**Data:** 2026-09-13  
**ADR relacionado:** [ADR-004](../adrs/004-comunicacao-sincrona-assincrona.md)

## Contexto

Mudanças de status da OS devem notificar o cliente por e-mail sem bloquear a resposta HTTP. SendGrid não deve ficar acoplado ao pod da API (credencial isolada, escala independente).

## Proposta

1. API publica evento **`ordem-servico.status-changed.v1`** no **SNS** após persistir a transição.
2. **SQS** assina o tópico; **Lambda notificacao** consome a fila e chama SendGrid.
3. **DLQ** recebe mensagens após `maxReceiveCount` falhas.
4. Entrega **at-least-once** — handler idempotente por `eventId`.
5. Falha no e-mail **não reverte** a transação de negócio.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| **SNS → SQS → Lambda** (escolhida) | Desacoplamento; retry/DLQ nativos; IRSA na API | Latência adicional aceitável |
| SendGrid síncrono na API | Simplicidade | Bloqueia request; secret no pod |
| EventBridge direto | Roteamento flexível | SNS+SQS já atende; menos familiar |
| SES em vez de SendGrid | Nativo AWS | Conta sandbox; deliverability |
| Kafka/MSK | Alta escala | Custo/complexidade desproporcional |

## Consequências

### Positivas

- API responde 200 antes do e-mail ser enviado.
- SendGrid secret apenas na Lambda (`SENDGRID_SECRET_ARN`).
- `correlationId` propagado do HTTP até logs da Lambda.

### Negativas / trade-offs

- Possível e-mail duplicado em retry — mitigado por idempotência.
- Operador deve monitorar DLQ e reprocessar manualmente.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Loop na DLQ | Não reencaminhar payload inválido; corrigir causa raiz |
| Backlog SQS | Alarmes CloudWatch + Datadog |
| Schema breaking change | Versionamento `v1` no tipo do evento |

## Discussão e conclusão

Padrão fan-out SNS/SQS é padrão AWS para workloads event-driven de baixo volume. Aceito e documentado em [notificacoes.md](../notificacoes.md) e contrato serverless.

## Referências

- [notificacoes.md](../notificacoes.md)
- [contrato-evento-notificacao.md](../../../tech-challenge-serverless/docs/contrato-evento-notificacao.md)
- `tech-challenge-infra-kubernetes/terraform/sns.tf`, `sqs.tf`
