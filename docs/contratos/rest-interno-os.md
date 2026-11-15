# Contratos REST internos do OS Service

Dono: OS Service (`tech-challenge`). Versão: `v1`.

Especificação completa em [`spec/fase-4/03-service-boundaries.md`](../../spec/fase-4/03-service-boundaries.md).

## Cabeçalhos obrigatórios

Todas as rotas:

```
Authorization: Bearer <token do chamador>
X-Correlation-Id: <uuid da OS>
X-Request-Id: <uuid da requisição>
```

Rotas `POST`:

```
Idempotency-Key: <chave determinística>
```

---

## POST /internal/ordens-servico/{id}/diagnostico

Chamador: Execution Service.  
Idempotency-Key: `diagnostico:<tarefaId>`

### Corpo da requisição

```json
{
  "rodada": 1,
  "tarefaId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "laudo": "Desgaste prematuro nas pastilhas dianteiras e fluido de freio abaixo do nível.",
  "itens": [
    { "tipo": "PECA", "itemId": "a1b2c3d4-0001-0000-0000-000000000001", "quantidade": 2 },
    { "tipo": "SERVICO", "itemId": "a1b2c3d4-0002-0000-0000-000000000002", "quantidade": 1 }
  ]
}
```

### Resposta 200 — diagnóstico registrado

```json
{
  "rodada": 1,
  "itensOficiais": [
    {
      "tipo": "PECA",
      "itemId": "a1b2c3d4-0001-0000-0000-000000000001",
      "nome": "Pastilha de freio dianteira",
      "quantidade": 2
    },
    {
      "tipo": "SERVICO",
      "itemId": "a1b2c3d4-0002-0000-0000-000000000002",
      "nome": "Troca de fluido de freio",
      "quantidade": 1
    }
  ]
}
```

Sem preços na resposta: o Execution não guarda preços (D1.13).

### Erros

```json
{ "codigo": "RODADA_OBSOLETA", "mensagem": "A rodada 1 não é a rodada vigente da OS.", "detalhes": {} }
```

```json
{ "codigo": "OS_EM_CANCELAMENTO", "mensagem": "A OS está em cancelamento ou encerrada.", "detalhes": {} }
```

```json
{ "codigo": "ESTADO_INCOMPATIVEL", "mensagem": "O status atual da OS não permite a conclusão do diagnóstico.", "detalhes": { "status": "AGUARDANDO_APROVACAO" } }
```

```json
{ "codigo": "CONTEUDO_DIVERGENTE", "mensagem": "Mesma chave de idempotência com conteúdo diferente.", "detalhes": {} }
```

```json
{ "codigo": "ITEM_INVALIDO", "mensagem": "O item informado não existe, está inativo ou não pertence ao catálogo.", "detalhes": { "itemId": "a1b2c3d4-9999-0000-0000-000000000099" } }
```

---

## POST /internal/ordens-servico/{id}/reservas

Chamador: Billing Service (aprovação do orçamento).  
Idempotency-Key: `reserva:<orcamentoId>:<tentativaAprovacao>`

### Corpo da requisição

```json
{
  "rodada": 1,
  "orcamentoId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

### Resposta 200 — estoque reservado

```json
{
  "reservaId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "prazoReferencia": "2026-11-15T10:15:00.000Z"
}
```

`prazoReferencia` é o instante fixado pelo OS com o relógio do banco (D4.5).

### Erros

```json
{
  "codigo": "ESTOQUE_INSUFICIENTE",
  "mensagem": "Estoque insuficiente para reservar os itens do orçamento.",
  "detalhes": {
    "itensIndisponiveis": [
      { "itemId": "a1b2c3d4-0001-0000-0000-000000000001", "disponivelAtual": 1, "solicitado": 2 }
    ]
  }
}
```

```json
{ "codigo": "RODADA_OBSOLETA", "mensagem": "A rodada 1 não é a rodada vigente da OS.", "detalhes": {} }
```

```json
{ "codigo": "OS_EM_CANCELAMENTO", "mensagem": "A OS está em cancelamento ou encerrada.", "detalhes": {} }
```

```json
{ "codigo": "ESTADO_INCOMPATIVEL", "mensagem": "O status atual da OS não permite a reserva.", "detalhes": { "status": "EM_DIAGNOSTICO" } }
```

```json
{ "codigo": "CONTEUDO_DIVERGENTE", "mensagem": "Mesma chave de idempotência com conteúdo diferente.", "detalhes": {} }
```

---

## GET /internal/clientes?cpf={cpf}

Chamador: Lambda `auth-cpf`.  
Sem `Idempotency-Key` (consulta).

### Resposta 200 — cliente encontrado

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ativo": true
}
```

### Erro

```json
{ "codigo": "CLIENTE_NAO_ENCONTRADO", "mensagem": "Nenhum cliente encontrado com o CPF informado.", "detalhes": {} }
```

---

## Idempotência (D2.12)

- Chaves determinísticas; `tentativaAprovacao` é contador persistido pelo Billing.
- O OS grava a chave e a resposta 2xx na mesma transação do efeito.
- Respostas 4xx **não** são gravadas: `ESTOQUE_INSUFICIENTE` permite nova tentativa após reposição; `CONTEUDO_DIVERGENTE` indica erro de programação.
- Repetição idempotente de operação bem-sucedida com a OS em cancelamento responde 409 `OS_EM_CANCELAMENTO`.
