# Eventos do OS Service

Dono: OS Service (`tech-challenge`). Canal: SNS existente → Lambda `notificacao`.

Especificação completa em [`spec/fase-4/03-service-boundaries.md`](../../spec/fase-4/03-service-boundaries.md).

Envelope comum em [`spec/fase-4/05-communication.md`](../../spec/fase-4/05-communication.md).

---

## ordem-servico.status-changed.v1

Publicado pelo OS a cada transição de status global da OS.

O formato segue o legado da Fase 3; os status novos da Fase 4 (`AGUARDANDO_PAGAMENTO`, `AGUARDANDO_EXECUCAO`, `EM_CANCELAMENTO`, `CANCELADA`) são adicionados sem quebrar consumidores existentes (D2.9 passo 1).

### Status válidos (Fase 4)

`RECEBIDA` | `EM_DIAGNOSTICO` | `AGUARDANDO_APROVACAO` | `AGUARDANDO_PAGAMENTO` | `AGUARDANDO_EXECUCAO` | `EM_EXECUCAO` | `EM_CANCELAMENTO` | `FINALIZADA` | `CANCELADA` | `ENTREGUE`

### Exemplo JSON

```json
{
  "eventId": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  "eventType": "ordem-servico.status-changed.v1",
  "version": 1,
  "occurredAt": "2026-11-15T10:05:00.000Z",
  "source": "os-service",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "causationId": null,
  "ordemServicoId": "550e8400-e29b-41d4-a716-446655440000",
  "rodada": 1,
  "payload": {
    "numeroOS": 1042,
    "statusAnterior": "AGUARDANDO_PAGAMENTO",
    "statusNovo": "AGUARDANDO_EXECUCAO",
    "destinatario": {
      "nome": "João da Silva",
      "email": "joao.silva@email.com"
    }
  }
}
```

**Campos do `payload`:**

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `numeroOS` | `number` | não | Número sequencial da OS |
| `statusAnterior` | `string \| null` | sim | Status anterior; `null` na abertura |
| `statusNovo` | `string` | sim | Novo status |
| `destinatario.nome` | `string` | sim | Nome do cliente |
| `destinatario.email` | `string` | sim | E-mail do cliente |

---

## ordem-servico.pagamento-disponivel.v1

Publicado pelo OS quando recebe `billing.cobranca-criada.v1` e atualiza a projeção com o link de pagamento (D3.7). Disparado pela Lambda de notificação para envio ao cliente.

### Exemplo JSON

```json
{
  "eventId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "eventType": "ordem-servico.pagamento-disponivel.v1",
  "version": 1,
  "occurredAt": "2026-11-15T10:06:30.000Z",
  "source": "os-service",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "causationId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "ordemServicoId": "550e8400-e29b-41d4-a716-446655440000",
  "rodada": 1,
  "payload": {
    "destinatario": {
      "nome": "João da Silva",
      "email": "joao.silva@email.com"
    },
    "numeroOS": 1042,
    "linkPagamento": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1234567890",
    "prazoPagamento": "2026-11-15T10:18:00.000Z",
    "valorCentavos": 34500
  }
}
```

**Campos do `payload`:**

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `destinatario.nome` | `string` | sim | Nome do cliente para a notificação |
| `destinatario.email` | `string` | sim | E-mail do cliente para a notificação |
| `numeroOS` | `number` | não | Número sequencial da OS |
| `linkPagamento` | `string` | sim | URL do Mercado Pago para o cliente pagar |
| `prazoPagamento` | `string` | sim | ISO 8601; prazo de pagamento calculado pelo Billing (D4.5) |
| `valorCentavos` | `number` | sim | Valor em centavos (D3.12) |

---

## Notas

- O nome `ordem-servico.status-changed.v1` é preservado do legado (D3.7).
- Nome e e-mail do cliente não são replicados no Billing; o OS os busca em `clientes` ao publicar `pagamento-disponivel.v1` (D3.7).
- Nenhum link de pagamento é publicado antes da criação efetiva da cobrança no Mercado Pago (D3.7).
- Valores em centavos em todos os campos monetários (D3.12).
