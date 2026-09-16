# Runbook — Correlação ponta a ponta

Use o `correlationId` (header `X-Correlation-Id`) para seguir uma requisição do Gateway até API, mensageria, Function e provedor.

## 1. Obter o correlationId

- Resposta HTTP: header `X-Correlation-Id`
- Access log do API Gateway (CloudWatch `/aws/apigateway/tech-challenge-*`): campo `correlationId`
- Logs da API: campo JSON `correlationId`

## 2. API (Datadog Logs)

```
service:oficina-api @correlationId:"<id>"
```

Verifique `request.started`, `request.completed` ou `request.failed` com `route` normalizada.

## 3. Trace APM

```
service:oficina-api @correlationId:"<id>"
```

Ou abra o trace pelo `traceId` presente no log JSON.

## 4. Evento SNS / SQS

Logs da API com `notificacao_status_publicada` ou `notificacao_status_falha_publicacao` para o mesmo `correlationId`.

Fila: `tech-challenge-producao-notificacao-status` (mensagem contém `correlationId` no JSON).

## 5. Lambda de notificação

CloudWatch `/aws/lambda/tech-challenge-producao-notificacao`:

```
fields @timestamp, @message
| filter @message like /<correlationId>/
```

Ou Datadog Logs (se forward configurado) com `@correlationId`.

## 6. SendGrid

Busque pelo `correlationId` nos logs da Lambda (`evento: notificacao_status_enviada` / falha). Não use e-mail completo em queries.

## 7. Falha de transição de OS

Métrica `oficina.ordem_servico.transicao_falha` + logs com status HTTP 400 no mesmo `correlationId`.

## Checklist rápido

1. Gateway access log → `correlationId`
2. Datadog Logs API → request + erro
3. Datadog APM → span lento/falho
4. SNS/SQS → evento publicado
5. Lambda → processamento SendGrid
6. DLQ → se mensagem parou na fila
