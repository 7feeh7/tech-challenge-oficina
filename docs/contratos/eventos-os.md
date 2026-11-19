# Eventos do OS Service

Dono: OS Service (`tech-challenge`). Canal: SNS existente → Lambda `notificacao`.

Especificação completa em `decisoes.md` da Fase 4: D3.7, D3.12 e spec 03-service-boundaries.md (não versionada).

Envelope comum em spec 05-communication.md da Fase 4 (não versionada); ver D3.12.

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

**Quando é gravado (E27):** na mesma transação que muda o status (`outbox_mensagens`, destino tópico de notificação), com o `correlationId` **persistido na OS** e o `eventId` igual ao da linha de `historico_status_os`. Na abertura, `statusAnterior` é `null`.

---

## execution.iniciar-diagnostico.v1

Comando do OS para o Execution Service (fila `execution`, destino `DESTINO_FILA_EXECUTION`). Pede ao mecânico que faça o diagnóstico da rodada vigente.

Quando é emitido, sempre na mesma transação da mudança de estado:

- **abertura da OS** (rodada 1): `causationId` = `eventId` do `status-changed` da abertura; `sugestoes` = as sugestões informadas na abertura;
- **recusa do orçamento** (rodada ≥ 2): `causationId` = `eventId` do `status-changed` de volta a `EM_DIAGNOSTICO`; `sugestoes` = os itens oficiais da rodada anterior (o mecânico parte deles).

```json
{
  "eventId": "9f1c3a52-0b6e-4a43-8f55-3f4a1d2e7c10",
  "eventType": "execution.iniciar-diagnostico.v1",
  "version": 1,
  "occurredAt": "2026-11-16T10:00:00.000Z",
  "source": "os-service",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "causationId": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  "ordemServicoId": "550e8400-e29b-41d4-a716-446655440000",
  "rodada": 1,
  "payload": {
    "veiculo": { "placa": "ABC1D23", "modelo": "Corolla" },
    "descricaoProblema": "Barulho na suspensão dianteira",
    "sugestoes": [
      { "tipo": "SERVICO", "itemId": "uuid-do-servico", "quantidade": 1 },
      { "tipo": "PECA", "itemId": "uuid-da-peca", "quantidade": 2 }
    ]
  }
}
```

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `veiculo.placa` / `veiculo.modelo` | `string` | sim | Identificação do veículo para o mecânico |
| `descricaoProblema` | `string \| null` | não | Relato do cliente |
| `sugestoes[].tipo` | `PECA \| SERVICO` | sim | Tipo do item sugerido |
| `sugestoes[].itemId` | `string` | sim | Id do serviço ou da peça no catálogo |
| `sugestoes[].quantidade` | `number` | sim | Inteiro ≥ 1 |

Sugestões **não carregam preço**: o preço congela quando o diagnóstico é concluído e vira item oficial da OS.

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
    "numeroOs": 1042,
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
| `numeroOs` | `number` | não | Número sequencial da OS |
| `linkPagamento` | `string` | sim | URL do Mercado Pago para o cliente pagar |
| `prazoPagamento` | `string` | sim | ISO 8601; prazo de pagamento calculado pelo Billing (D4.5) |
| `valorCentavos` | `number` | sim | Valor em centavos (D3.12) |

---

## Notas

- O nome `ordem-servico.status-changed.v1` é preservado do legado (D3.7).
- Nome e e-mail do cliente não são replicados no Billing; o OS os busca em `clientes` ao publicar `pagamento-disponivel.v1` (D3.7).
- Nenhum link de pagamento é publicado antes da criação efetiva da cobrança no Mercado Pago (D3.7).
- Valores em centavos em todos os campos monetários (D3.12).
