# ADR-012 — Integração com Mercado Pago via Orders API

**Status:** aceito  
**Data:** 2026-11-15

## Contexto

A Fase 4 exige integração com um gateway de pagamento (R4-09). O Mercado Pago foi escolhido para a demonstração acadêmica. Existem duas APIs distintas: Preferências (Checkout Pro legado) e Orders (Checkout Pro atual). A integração precisa suportar pagamento aprovado, recusado, expiração, estorno e conciliação de pagamentos tardios, além de validar o webhook antes de processar qualquer evento financeiro (D3.10, D3.11).

## Decisão

**Checkout Pro com a Orders API** exclusivamente; sem misturar Orders e Preferências na mesma integração (D3.15). A integração é responsabilidade do Billing Service.

**Fluxo** (D3.7, D3.10):
1. Billing cria a cobrança internamente, persiste a intenção e só então chama a Orders API.
2. A criação bem-sucedida gera `orderId` e `linkPagamento`; o Billing publica `billing.cobranca-criada.v1`.
3. O OS recebe o evento, atualiza a projeção e publica `ordem-servico.pagamento-disponivel.v1` para a Lambda de notificação.
4. O webhook do Mercado Pago entrega a confirmação; o Billing valida a assinatura antes de qualquer processamento.
5. O pagamento é confirmado consultando a API do Mercado Pago, não só o webhook.

**Idempotência** (D3.15): chaves persistidas e reutilizadas nas novas tentativas da mesma operação financeira; a Orders API deduplica usando as mesmas chaves.

**Pagamento tardio** (D1.15, D4.10): conciliado mesmo com a OS encerrada; gera `billing.pagamento-tardio-registrado.v1` com tratamento `ESTORNO_AUTOMATICO` ou `PENDENCIA_MANUAL`.

**Estorno** (D0.7, D1.20):
- Integral automático: depois do pagamento e antes do início do reparo, condicionado à validação da integração.
- Durante o reparo: pendência manual para avaliação do ADMINISTRADOR (D2.17).
- Cancelamento via `CancelarFinanceiro`: o Billing responde com a situação final e bloqueia cobranças futuras.

**Prova técnica** (D3.11, D9.7): os contratos financeiros marcados com `*` em `03-service-boundaries.md` são provisórios até a conclusão da etapa E05. Se a prova encontrar limitação impeditiva, a modalidade é reavaliada como um todo antes de implementar (D3.15).

**Recriação de order** (D1.15): pagamento recusado permite nova tentativa dentro do prazo, com nova `orderId`; o evento `billing.cobranca-criada.v1` é reemitido com o mesmo `cobrancaId` e novo `orderId`.

## Consequências

### Positivas

- Orders API é a integração atual recomendada pelo Mercado Pago.
- Webhook com validação de assinatura garante que só o Mercado Pago pode confirmar pagamentos.
- Idempotência por chaves persistidas evita cobranças duplicadas.
- Conciliação de pagamentos tardios preserva a integridade financeira mesmo após o encerramento da OS.

### Negativas / trade-offs

- Contratos financeiros provisórios até a prova técnica (D9.7); etapas dependentes podem ser suspensas se houver limitação impeditiva (D3.15).
- Cancelar a cobrança no Billing não impede pagamento posterior no Mercado Pago; é necessário impedir no MP antes de liberar estoque (D1.15).
- Integração por `fetch` nativo com `AbortSignal.timeout`; sem circuit breaker (D1.21).

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| Preferências (Checkout Pro legado) | API legada; D3.15 proíbe mistura com Orders |
| Outro gateway (Stripe, PagSeguro) | Não foi requisitado; Mercado Pago está disponível para demonstração |
| Webhooks sem validação de assinatura | Risco de fraude; D3.10 |

## Referências

- [`decisoes.md`](../../spec/fase-4/decisoes.md): D3.10, D3.11, D3.15, D0.7, D1.15, D1.20
- [services/billing.md](../../spec/fase-4/services/billing.md)
- [03-service-boundaries.md](../../spec/fase-4/03-service-boundaries.md)
