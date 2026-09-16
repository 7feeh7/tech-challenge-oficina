# ADR-004 — Comunicação síncrona e assíncrona

**Status:** aceito  
**Data:** 2026-09-13  
**RFC relacionada:** [RFC-004](../rfcs/004-serverless-notificacao-mensageria.md)

## Contexto

A API expõe comandos e consultas que exigem resposta imediata ao cliente, mas efeitos colaterais como e-mail de status não devem bloquear a transação HTTP nem acoplar credenciais de terceiros ao pod.

## Decisão

1. **HTTP síncrono** (via API Gateway → EKS) para comandos, consultas e autenticação interna (`/v1/*`).
2. **Eventos assíncronos** (SNS → SQS → Lambda) para **notificação por e-mail** de mudança de status da OS.
3. Persistência de negócio **sempre antes** da publicação do evento.
4. Falha na mensageria **não reverte** a transação já commitada.

## Consequências

### Positivas

- Latência previsível nas APIs REST.
- Escala independente do canal de notificação.
- Contrato de evento versionado (`ordem-servico.status-changed.v1`).

### Negativas / trade-offs

- Semântica at-least-once — handlers devem ser idempotentes.
- Consistência eventual entre status persistido e e-mail entregue.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| E-mail síncrono na API | Bloqueia resposta; secret SendGrid no pod |
| WebSockets para notificação | Fora do escopo; e-mail atende requisito |
| Fila única sem SNS | SNS permite fan-out futuro sem mudar publisher |

## Referências

- [notificacoes.md](../notificacoes.md)
- [diagramas/componentes-nuvem.md](../diagramas/componentes-nuvem.md)
