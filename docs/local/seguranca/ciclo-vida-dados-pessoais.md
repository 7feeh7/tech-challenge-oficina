# Ciclo de Vida de Dados Pessoais

**Versão:** 1.0  
**Data:** 2026-09-13

## Inventário

| Dado | Coleta | Trânsito | Persistência | Log/trace | Retenção |
| --- | --- | --- | --- | --- | --- |
| CPF | `POST /auth/cpf` | Gateway → Lambda → RDS | `clientes.cpf_cnpj` | Mascarado (`***.***.XXX-**`) | RDS: vida útil do cadastro |
| Nome | Cadastro interno | API NestJS | `clientes.nome` | Chave `nome` redacted | Idem |
| E-mail | Cadastro / OS | API → SNS → Lambda → SendGrid | `clientes.email` | Mascarado (`ab***@dominio`) | Idem |
| Placa | Cadastro veículo | API NestJS | `veiculos.placa` | Não logada por padrão | Idem |

**Mensageria:** evento `StatusChanged` carrega apenas `ordemServicoId`, `status`, `clienteEmail` (mínimo para notificação). Sem CPF. Ver `tech-challenge-serverless/docs/contrato-evento-notificacao.md`.

## Minimização

| Componente | Campos de PII recebidos |
| --- | --- |
| Lambda auth-cpf | CPF no body; consulta só `id, ativo` |
| JWT cliente | Sem PII (`sub` = UUID) |
| Lambda notificação | E-mail do evento apenas |
| API NestJS | Conforme DTO; ownership por UUID |

## Mascaramento padrão

| Canal | Implementação |
| --- | --- |
| Log JSON (API) | `src/shared/observability/log-sanitizer.ts` |
| Log Lambda auth | `mascararCpf` em `logger.service.ts` |
| Log Lambda notificação | `pii-mask.service.ts` em detalhes |
| Datadog Agent | Processing rule `redact_sensitive` |
| Erro HTTP | Mensagens genéricas; sem CPF no corpo de erro auth |
| Métricas auth | CPF nunca; IP agregado `/16` |

## Retenção e descarte

| Artefato | Retenção | Descarte |
| --- | --- | --- |
| CloudWatch API Gateway | 14 dias | Expiração automática |
| CloudWatch Lambda | 14 dias | Expiração automática |
| SQS notificação | 4 dias | TTL fila |
| SQS DLQ | 14 dias | Expiração + reprocesso manual |
| RDS backup | 7 dias | Política AWS RDS |
| Datadog logs/traces | 15 dias | Política conta Datadog |
| DynamoDB rate limit | TTL ~10 min após janela | TTL DynamoDB |

## Pedido de exclusão/correção (LGPD)

1. Cliente solicita via canal da oficina (presencial/e-mail institucional).
2. Operador com perfil ADMIN localiza cadastro e corrige ou anonimiza PII em `clientes`/`veiculos`.
3. **OS já emitida:** mantém histórico operacional; anonimiza vínculo PII onde legalmente permitido (ex.: substituir nome por "Cliente removido", CPF por hash irreversível ou NULL se regra de negócio permitir).
4. Registrar ticket interno (data, solicitante, ação) — sem PII no ticket público.
5. Backups RDS: dado expira em até 7 dias; não há restore pontual de PII excluído.

## Base legal e integrações

| Tratamento | Base legal (LGPD art. 7) | Integração externa |
| --- | --- | --- |
| Cadastro cliente / OS | Execução de contrato (V) | — |
| Auth por CPF | Execução de contrato (V) | — |
| E-mail status OS | Execução de contrato (V) | SendGrid (operador de e-mail) |
| Logs/métricas | Legítimo interesse (IX) + minimização | Datadog (processador) |
| Telemetria AWS | Legítimo interesse (IX) | CloudWatch, X-Ray |

SendGrid e Datadog recebem apenas o mínimo descrito nos contratos RFC/ADR. DPA corporativo fica fora do escopo acadêmico; minimização técnica está implementada.
