# API — Oficina Mecânica

Documentação dos contratos HTTP expostos pelo serviço.

Base local: `http://localhost:3000`. Swagger interativo em `http://localhost:3000/docs` (botão **Authorize** para o Bearer Token).

## Convenções gerais

Todas as rotas são **privadas** (JWT global), exceto as marcadas como públicas: `POST /auth/login`, `GET /health` e `GET /health/ready`.

Envie o token nas rotas privadas:

```
Authorization: Bearer <token>
```

Exemplo:

```bash
curl --location 'http://localhost:3000/clientes' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer SEU_TOKEN'
```

### Envelope de listagem

Todas as rotas `GET` de coleção são paginadas e devolvem o mesmo envelope:

```json
{
  "data": [],
  "meta": { "total": 42, "page": 1, "limit": 10, "totalPages": 5 }
}
```

| Parâmetro | Obrigatório | Padrão | Descrição                       |
| --------- | ----------- | ------ | ------------------------------- |
| `page`    | Não         | `1`    | Página                          |
| `limit`   | Não         | `10`   | Itens por página                |
| `search`  | Não         | —      | Busca textual (onde disponível) |

### Envelope de erro

Erros de domínio são traduzidos por `DomainExceptionFilter` no padrão do Nest:

```json
{
  "statusCode": 404,
  "message": "Cliente não encontrado: uuid-c1",
  "error": "Not Found"
}
```

| Erro de domínio           | HTTP |
| ------------------------- | ---- |
| `DomainValidationError`   | 400  |
| `DomainUnauthorizedError` | 401  |
| `DomainNotFoundError`     | 404  |
| `DomainConflictError`     | 409  |
| Demais `DomainError`      | 500  |

Erros de validação de DTO (`class-validator`) respondem **400** com `message` como array de mensagens.

Perfil sem permissão para a rota responde **403**; token ausente ou inválido responde **401**. Ver [autenticacao.md](autenticacao.md).

## Autenticação

### POST /auth/login

Rota **pública**. Valida as credenciais e devolve o token JWT.

#### Corpo da requisição

```json
{
  "email": "admin@oficina.com",
  "senha": "senhaSegura123"
}
```

#### Resposta de sucesso (200)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

O payload do JWT carrega `sub` (id do usuário), `email` e `perfil`.

#### Erros

| HTTP | Mensagem                 |
| ---- | ------------------------ |
| 400  | Dados inválidos          |
| 401  | `Credenciais inválidas.` |

### GET /auth/me

Devolve os dados do usuário autenticado, extraídos do token.

#### Resposta de sucesso (200)

```json
{
  "sub": "uuid-do-usuario",
  "email": "admin@oficina.com",
  "perfil": "ADMINISTRADOR"
}
```

| HTTP | Descrição       |
| ---- | --------------- |
| 401  | Não autenticado |

## Health

Rotas **públicas**, usadas pelas probes do Kubernetes.

| Rota                | Descrição                       | Respostas                                         |
| ------------------- | ------------------------------- | ------------------------------------------------- |
| `GET /health`       | Liveness: o processo está de pé | `200` Aplicação viva.                             |
| `GET /health/ready` | Readiness: a aplicação atende   | `200` Pronta / `503` Banco de dados indisponível. |

## Usuários

Acesso: **ADMINISTRADOR**.

### POST /usuarios

```json
{
  "nome": "Maria Souza",
  "email": "maria@oficina.com",
  "senha": "senhaSegura123",
  "perfil": "ATENDENTE"
}
```

`perfil`: `ADMINISTRADOR` | `ATENDENTE` | `MECANICO` | `ALMOXARIFE`.

#### Resposta de sucesso (201)

```json
{
  "id": "uuid-do-usuario",
  "nome": "Maria Souza",
  "email": "maria@oficina.com",
  "perfil": "ATENDENTE",
  "ativo": true
}
```

A senha nunca volta na resposta — é persistida como hash bcrypt.

#### Erros

| HTTP | Descrição            |
| ---- | -------------------- |
| 400  | Dados inválidos      |
| 409  | E-mail já cadastrado |

### Demais rotas

| Rota                    | Descrição                  | Respostas                                      |
| ----------------------- | -------------------------- | ---------------------------------------------- |
| `GET /usuarios`         | Lista paginada             | `200`                                          |
| `GET /usuarios/{id}`    | Busca por ID               | `200` / `404` Usuário não encontrado           |
| `PATCH /usuarios/{id}`  | Atualiza (campos parciais) | `200` / `400` / `404` / `409` E-mail já em uso |
| `DELETE /usuarios/{id}` | Remove                     | `200` / `404`                                  |

O corpo do `PATCH` aceita qualquer subconjunto de `nome`, `email`, `senha`, `perfil`.

## Clientes

Acesso: **ADMINISTRADOR**, **ATENDENTE**.

### POST /clientes

```json
{
  "nome": "João da Silva",
  "cpfCnpj": "12345678901",
  "email": "joao@email.com",
  "telefone": "11999999999"
}
```

`cpfCnpj` é validado (CPF ou CNPJ, com dígitos verificadores) pelo validador de `shared/validators`.

#### Resposta de sucesso (201)

```json
{
  "id": "uuid-do-cliente",
  "nome": "João da Silva",
  "cpfCnpj": "12345678901",
  "email": "joao@email.com",
  "telefone": "11999999999"
}
```

#### Erros

| HTTP | Descrição                        |
| ---- | -------------------------------- |
| 400  | Dados inválidos                  |
| 409  | E-mail ou CPF/CNPJ já cadastrado |

### GET /clientes/{id}

Devolve o cliente **com os veículos** associados:

```json
{
  "id": "uuid-do-cliente",
  "nome": "João da Silva",
  "cpfCnpj": "12345678901",
  "email": "joao@email.com",
  "telefone": "11999999999",
  "veiculos": [
    {
      "id": "uuid-do-veiculo",
      "placa": "ABC1D23",
      "marca": "Toyota",
      "modelo": "Corolla",
      "ano": 2023
    }
  ]
}
```

### Demais rotas

| Rota                    | Descrição      | Respostas                                               |
| ----------------------- | -------------- | ------------------------------------------------------- |
| `GET /clientes`         | Lista paginada | `200`                                                   |
| `PATCH /clientes/{id}`  | Atualiza       | `200` / `400` / `404` / `409` E-mail ou CPF/CNPJ em uso |
| `DELETE /clientes/{id}` | Remove         | `200` / `404`                                           |

## Veículos

Acesso: **ADMINISTRADOR**, **ATENDENTE**.

### POST /veiculos

```json
{
  "placa": "ABC1D23",
  "marca": "Toyota",
  "modelo": "Corolla",
  "ano": 2023,
  "clienteId": "uuid-do-cliente"
}
```

A placa aceita os dois formatos brasileiros: Mercosul (`ABC1D23`) e o antigo (`ABC1234`).

#### Resposta de sucesso (201)

```json
{
  "id": "uuid-do-veiculo",
  "placa": "ABC1D23",
  "marca": "Toyota",
  "modelo": "Corolla",
  "ano": 2023,
  "clienteId": "uuid-do-cliente"
}
```

#### Erros

| HTTP | Descrição              |
| ---- | ---------------------- |
| 400  | Dados inválidos        |
| 404  | Cliente não encontrado |
| 409  | Placa já cadastrada    |

### GET /veiculos/{id}

Devolve o veículo **com o dono**:

```json
{
  "id": "uuid-do-veiculo",
  "placa": "ABC1D23",
  "marca": "Toyota",
  "modelo": "Corolla",
  "ano": 2023,
  "clienteId": "uuid-do-cliente",
  "cliente": { "id": "uuid-do-cliente", "nome": "João da Silva" }
}
```

### Demais rotas

| Rota                    | Descrição      | Respostas                                              |
| ----------------------- | -------------- | ------------------------------------------------------ |
| `GET /veiculos`         | Lista paginada | `200`                                                  |
| `PATCH /veiculos/{id}`  | Atualiza       | `200` / `400` / `404` Veículo ou cliente / `409` Placa |
| `DELETE /veiculos/{id}` | Remove         | `200` / `404`                                          |

## Serviços

Leitura: qualquer perfil autenticado. Escrita (`POST`, `PATCH`, `DELETE`): **ADMINISTRADOR**.

### POST /servicos

```json
{
  "nome": "Troca de óleo",
  "descricao": "Troca de óleo do motor com filtro",
  "precoBase": 150,
  "tempoEstimadoMin": 60,
  "ativo": true
}
```

#### Resposta de sucesso (201)

```json
{
  "id": "uuid-do-servico",
  "nome": "Troca de óleo",
  "descricao": "Troca de óleo do motor com filtro",
  "precoBase": 150,
  "tempoEstimadoMin": 60,
  "ativo": true
}
```

#### Erros

| HTTP | Descrição                     |
| ---- | ----------------------------- |
| 400  | Dados inválidos               |
| 409  | Nome de serviço já cadastrado |

### Demais rotas

| Rota                    | Descrição      | Respostas                                 |
| ----------------------- | -------------- | ----------------------------------------- |
| `GET /servicos`         | Lista paginada | `200`                                     |
| `GET /servicos/{id}`    | Busca por ID   | `200` / `404`                             |
| `PATCH /servicos/{id}`  | Atualiza       | `200` / `400` / `404` / `409` Nome em uso |
| `DELETE /servicos/{id}` | Remove         | `200` / `404`                             |

## Peças

Leitura: qualquer perfil autenticado. Escrita (`POST`, `PATCH`, `DELETE`): **ADMINISTRADOR**, **ALMOXARIFE**.

### POST /pecas

```json
{
  "codigo": "FLT-001",
  "nome": "Filtro de óleo",
  "descricao": "Filtro de óleo para motores 1.0 a 2.0",
  "precoUnitario": 29.9,
  "quantidadeEstoque": 10,
  "estoqueMinimo": 2,
  "ativo": true
}
```

#### Resposta de sucesso (201)

```json
{
  "id": "uuid-da-peca",
  "codigo": "FLT-001",
  "nome": "Filtro de óleo",
  "descricao": "Filtro de óleo para motores 1.0 a 2.0",
  "precoUnitario": 29.9,
  "quantidadeEstoque": 10,
  "estoqueMinimo": 2,
  "ativo": true
}
```

#### Erros

| HTTP | Descrição                    |
| ---- | ---------------------------- |
| 400  | Dados inválidos              |
| 409  | Código de peça já cadastrado |

### Demais rotas

| Rota                 | Descrição      | Respostas                                   |
| -------------------- | -------------- | ------------------------------------------- |
| `GET /pecas`         | Lista paginada | `200`                                       |
| `GET /pecas/{id}`    | Busca por ID   | `200` / `404`                               |
| `PATCH /pecas/{id}`  | Atualiza       | `200` / `400` / `404` / `409` Código em uso |
| `DELETE /pecas/{id}` | Remove         | `200` / `404`                               |

## Ordens de Serviço

Acesso: **ADMINISTRADOR**, **ATENDENTE**, **MECANICO**.

As regras de negócio da OS (fila, máquina de estados, notificação por e-mail) estão em [regras-de-negocio.md](regras-de-negocio.md).

### POST /ordens-servico

Abre a OS com cliente, veículo, serviços e peças. Os itens gravam o **preço congelado** no momento da abertura.

```json
{
  "clienteId": "uuid-do-cliente",
  "veiculoId": "uuid-do-veiculo",
  "descricaoProblema": "Barulho na suspensão dianteira",
  "diagnostico": null,
  "servicos": [{ "servicoId": "uuid-do-servico", "quantidade": 1 }],
  "pecas": [{ "pecaId": "uuid-da-peca", "quantidade": 2 }]
}
```

`servicos` e `pecas` são opcionais. Em `servicos`, `quantidade` é opcional (padrão `1`).

#### Resposta de sucesso (201)

```json
{
  "id": "uuid-da-os",
  "numero": 1,
  "status": "RECEBIDA",
  "cliente": {
    "id": "uuid-do-cliente",
    "nome": "João da Silva",
    "email": "joao@email.com",
    "telefone": "11999999999"
  },
  "veiculo": {
    "id": "uuid-do-veiculo",
    "placa": "ABC1D23",
    "marca": "Toyota",
    "modelo": "Corolla",
    "ano": 2023
  },
  "descricaoProblema": "Barulho na suspensão dianteira",
  "criadoEm": "2025-01-10T12:00:00.000Z",
  "diagnostico": null,
  "servicos": [
    {
      "id": "uuid-item",
      "servico": { "id": "uuid-do-servico", "nome": "Troca de óleo" },
      "quantidade": 1,
      "precoUnitario": 150
    }
  ],
  "pecas": [
    {
      "id": "uuid-item",
      "peca": { "id": "uuid-da-peca", "codigo": "FLT-001", "nome": "Filtro de óleo" },
      "quantidade": 2,
      "precoUnitario": 29.9
    }
  ],
  "valorTotal": 209.8,
  "orcamentos": [],
  "historicoStatus": [],
  "iniciadaEm": null,
  "finalizadaEm": null,
  "entregueEm": null
}
```

#### Erros

| HTTP | Descrição                                         |
| ---- | ------------------------------------------------- |
| 400  | Veículo não pertence ao cliente informado.        |
| 404  | Cliente, veículo, serviço ou peça não encontrado. |

### GET /ordens-servico

Sem filtro, devolve a **fila de trabalho** (OS `FINALIZADA` e `ENTREGUE` ficam fora). Ver [regras-de-negocio.md](regras-de-negocio.md).

| Parâmetro | Obrigatório | Descrição                                            |
| --------- | ----------- | ---------------------------------------------------- |
| `page`    | Não         | Página (padrão `1`)                                  |
| `limit`   | Não         | Itens por página (padrão `10`)                       |
| `status`  | Não         | Filtra um status específico, inclusive os encerrados |

Cada item é o **resumo** da OS:

```json
{
  "data": [
    {
      "id": "uuid-da-os",
      "numero": 1,
      "status": "EM_EXECUCAO",
      "cliente": { "id": "uuid-do-cliente", "nome": "João da Silva" },
      "veiculo": { "id": "uuid-do-veiculo", "placa": "ABC1D23", "modelo": "Corolla" },
      "descricaoProblema": "Barulho na suspensão dianteira",
      "criadoEm": "2025-01-10T12:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 10, "totalPages": 1 }
}
```

### GET /ordens-servico/{id}

Devolve a OS completa — o mesmo contrato do `POST`, já com `orcamentos` e `historicoStatus` preenchidos: a negociação inteira fica auditável aqui.

| HTTP | Descrição          |
| ---- | ------------------ |
| 404  | OS não encontrada. |

### PATCH /ordens-servico/{id}

Atualiza status, dados ou itens da OS. Aceita qualquer subconjunto dos campos do `POST`, mais `status`.

```json
{
  "status": "EM_DIAGNOSTICO",
  "diagnostico": "Amortecedor dianteiro esquerdo com folga"
}
```

`status`: `RECEBIDA` | `EM_DIAGNOSTICO` | `AGUARDANDO_APROVACAO` | `EM_EXECUCAO` | `FINALIZADA` | `ENTREGUE`.

Toda mudança efetiva de status notifica o cliente por e-mail e grava uma entrada em `historicoStatus`.

| HTTP | Descrição                     |
| ---- | ----------------------------- |
| 200  | OS atualizada.                |
| 400  | Transição de status inválida. |
| 404  | OS não encontrada.            |

### DELETE /ordens-servico/{id}

| HTTP | Descrição          |
| ---- | ------------------ |
| 200  | OS removida.       |
| 404  | OS não encontrada. |

### GET /ordens-servico/metricas/tempo-medio

Tempo médio de **execução** (`iniciadaEm` → `finalizadaEm`) e de **ciclo total** (`criadoEm` → `entregueEm`).

| Parâmetro    | Obrigatório | Descrição                   |
| ------------ | ----------- | --------------------------- |
| `dataInicio` | Não         | Data ISO inicial do recorte |
| `dataFim`    | Não         | Data ISO final do recorte   |

#### Resposta de sucesso (200)

```json
{
  "totalOrdens": 12,
  "totalFinalizadas": 9,
  "totalEntregues": 7,
  "tempoMedioExecucaoMs": 7200000,
  "tempoMedioExecucaoHoras": 2,
  "tempoMedioCicloTotalMs": 172800000,
  "tempoMedioCicloTotalHoras": 48,
  "filtros": { "dataInicio": null, "dataFim": null }
}
```

As duas médias só contam OS que passaram pela execução: uma OS encerrada sem execução tem `entregueEm` mas nunca `iniciadaEm`, e distorceria o tempo real de atendimento. Sem amostra, as médias voltam `0`.

## Orçamentos

Acesso: **ADMINISTRADOR**, **ATENDENTE**.

### POST /orcamentos

Cria o orçamento e move a OS para `AGUARDANDO_APROVACAO`.

```json
{
  "ordemServicoId": "uuid-da-os",
  "valorTotal": 350,
  "observacoes": "Inclui mão de obra e peças"
}
```

#### Resposta de sucesso (201)

```json
{
  "id": "uuid-do-orcamento",
  "ordemServicoId": "uuid-da-os",
  "valorTotal": 350,
  "status": "AGUARDANDO_APROVACAO",
  "observacoes": "Inclui mão de obra e peças",
  "aprovadoEm": null,
  "rejeitadoEm": null,
  "motivoRejeicao": null,
  "criadoEm": "2025-01-10T13:00:00.000Z"
}
```

#### Erros

| HTTP | Descrição                                                 |
| ---- | --------------------------------------------------------- |
| 404  | OS não encontrada.                                        |
| 409  | Já existe um orçamento aguardando aprovação para essa OS. |

### PATCH /orcamentos/{id}

Aprovar ou recusar. **Aprovar** move a OS para `EM_EXECUCAO` e **dá baixa no estoque** das peças, na mesma transação. **Recusar** exige `motivoRejeicao` e devolve a OS para `EM_DIAGNOSTICO`.

```json
{
  "status": "REJEITADO",
  "motivoRejeicao": "Valor acima do esperado pelo cliente"
}
```

`status`: `AGUARDANDO_APROVACAO` | `APROVADO` | `REJEITADO`.

Reenviar a mesma decisão é idempotente: a OS não muda de status e nenhum e-mail novo sai.

| HTTP | Descrição                                           |
| ---- | --------------------------------------------------- |
| 200  | Orçamento atualizado.                               |
| 400  | Motivo de rejeição ausente ou estoque insuficiente. |
| 404  | Orçamento não encontrado.                           |

### Demais rotas

| Rota                      | Descrição                                   | Respostas     |
| ------------------------- | ------------------------------------------- | ------------- |
| `GET /orcamentos`         | Lista paginada; filtra por `ordemServicoId` | `200`         |
| `GET /orcamentos/{id}`    | Busca por ID                                | `200` / `404` |
| `DELETE /orcamentos/{id}` | Remove                                      | `200` / `404` |

## Movimentações de Estoque

Acesso: **ADMINISTRADOR**, **ALMOXARIFE**.

### POST /movimentacoes-estoque

Registra entrada ou baixa. A movimentação e o ajuste do saldo da peça acontecem na **mesma transação** — histórico e saldo nunca divergem.

```json
{
  "pecaId": "uuid-da-peca",
  "tipo": "ENTRADA",
  "quantidade": 10,
  "ordemServicoId": null,
  "observacao": "Reposição do fornecedor"
}
```

`tipo`: `ENTRADA` | `BAIXA`.

#### Resposta de sucesso (201)

```json
{
  "id": "uuid-da-movimentacao",
  "pecaId": "uuid-da-peca",
  "peca": { "id": "uuid-da-peca", "codigo": "FLT-001", "nome": "Filtro de óleo" },
  "tipo": "ENTRADA",
  "quantidade": 10,
  "ordemServicoId": null,
  "observacao": "Reposição do fornecedor",
  "criadoEm": "2025-01-10T14:00:00.000Z"
}
```

#### Erros

| HTTP | Descrição                        |
| ---- | -------------------------------- |
| 400  | Estoque insuficiente para baixa. |
| 404  | Peça não encontrada.             |

### Demais rotas

| Rota                              | Descrição                           | Respostas     |
| --------------------------------- | ----------------------------------- | ------------- |
| `GET /movimentacoes-estoque`      | Lista paginada; filtra por `pecaId` | `200`         |
| `GET /movimentacoes-estoque/{id}` | Busca por ID                        | `200` / `404` |

## Especificação OpenAPI

O contrato exportado do Swagger está em [openapi.json](openapi.json) e pode ser importado no Postman, Insomnia ou Swagger Editor.
