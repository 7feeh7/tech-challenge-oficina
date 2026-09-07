# API — miniapp-edt

Documentação dos contratos HTTP expostos pelo serviço.

## GET /v1/link/validate

Rota **pública** (sem autenticação). Valida o link de assinatura pelo CPF e devolve os dados da assinatura com URLs pré-assinadas de upload.

### Query parameters

| Parâmetro  | Obrigatório | Descrição      |
| ---------- | ----------- | -------------- |
| `Document` | Sim         | CPF do filiado |

### Resposta de sucesso (200)

Contrato em produção (`ResponseValidateLinkDto`):

```json
{
  "linkValido": true,
  "isEDT": true,
  "idFiliado": 123,
  "idContrato": 456,
  "name": "João Silva",
  "cpf": "12345678900",
  "pathID": "guid",
  "uploadUrls": [
    {
      "tipoDoc": "jpg",
      "uploadDocFrente": "https://...",
      "uploadSelfie": "https://...",
      "uploadCompEndereco": "https://..."
    }
  ],
  "downloadUrls": [
    {
      "downloadDocFrente": "",
      "downloadSelfie": "",
      "downloadCompEndereco": ""
    }
  ]
}
```

- `uploadUrls`: uma entrada por extensão suportada (`.jpg`, `.jpeg`, `.png`, `.pdf`), com três URLs de upload cada (`DOC_FRENTE`, `SELFIE`, `COMPROVANTE_ENDERECO`).
- `downloadUrls`: lista com um item de strings vazias, mantida por compatibilidade com o legado.

### Divergência de contrato documentada

Documentação antiga descrevia o campo `urlUploadFiles` com estrutura `extensionType` / `extensionName` / `uploadUrl` / `downloadUrl`. **Esse formato não existe no código .NET em produção.** A fonte de verdade é `uploadUrls` + `downloadUrls`, conforme acima.

### Erros

| HTTP | Mensagem                                                         |
| ---- | ---------------------------------------------------------------- |
| 400  | `Documento não informado.`                                       |
| 400  | `Não foi possível localizar os dados para esse CPF.`             |
| 400  | `CPF não possui uma solicitação de assinatura.`                  |
| 400  | Mensagem de `toValidateDescription(STATUS_EDT)` quando aplicável |
| 500  | `Erro ao registrar assinatura.`                                  |

## POST /v1/subscription

Rota **privada** (Basic Auth + `private: true`). Valida os dados da assinatura digital, atualiza os status no CTN e publica a requisição na fila SQS de criação para processamento assíncrono pelo consumidor .NET.

### Corpo da requisição

```json
{
  "AffiliateId": "456",
  "AffiliateContractId": "789",
  "FileId": "path-id-123",
  "SignatureKey": "signature-key",
  "Contracts": [{ "Key": "contract-key" }],
  "Person": {
    "MaritalStatus": "Solteiro",
    "Nationality": "Brasileira",
    "Occupation": "Engenheiro",
    "Birthday": "1990-01-01T00:00:00"
  },
  "UtilityCompany": {
    "UtilityCompanyId": 10
  }
}
```

O `ClientType` do contexto de autenticação é injetado no payload publicado na fila (não vem no body HTTP).

### Resposta de sucesso (200)

```json
{
  "status": 200,
  "title": "Sucesso",
  "detail": ""
}
```

### Erros de entrada (400)

| HTTP | Mensagem                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 400  | `O corpo da requisição está vazio.`                                                                      |
| 400  | `O corpo da requisição possui um formato inválido.`                                                      |
| 400  | Mensagens em inglês concatenadas por `; ` (`AffiliateId is required.`, `Contract Key is required.`, ...) |

### Erros de negócio

| HTTP | Mensagem                                     |
| ---- | -------------------------------------------- |
| 404  | `Não foi possível localizar os dados no CTN` |
| 400  | `Não possui requisição de assinatura.`       |
| 500  | `Erro inesperado ao criar assinatura.`       |

## POST /v1/validarfatura

Rota **privada** (Basic Auth + `private: true`). Valida fatura de energia via Amazon Textract (fluxo v2 legado, exposto em `/v1/validarfatura`).

### Corpo da requisição

```json
{
  "FileId": "path-id",
  "Documento": "12345678901",
  "Nome": "João Silva"
}
```

### Resposta de sucesso (200)

```json
{
  "isValid": true,
  "message": "Fatura validada com sucesso.",
  "requestInvoice": false,
  "fields": {
    "concessionaire": 10,
    "installationNumber": { "value": "987654321" },
    "customerCode": { "value": "123456789" },
    "averageConsumption": { "value": "120" }
  }
}
```

Quando a validação de negócio falha, a API responde **400** com o mesmo contrato, `isValid: false`, `fields: null` e `requestInvoice` indicando se o cliente deve reenviar a fatura.

### Erros de entrada (400, envelope legado)

| HTTP | Mensagem                                    |
| ---- | ------------------------------------------- |
| 400  | `Request body is empty.`                    |
| 400  | `Invalid request format.`                   |
| 400  | `FileId, Documento, and Nome are required.` |
| 400  | `Erro ao processar fatura de energia.`      |

### Erros internos (500, envelope legado)

| HTTP | Mensagem                                        |
| ---- | ----------------------------------------------- |
| 500  | `Failed to extract data from invoice document.` |
| 500  | `No energy distributors configured.`            |

## POST /v1/contrato/edt

Rota **privada** (Basic Auth + `private: true`). Gera o contrato EDT a partir do template `.docx`, converte para PDF via ConvertAPI, armazena no S3 e devolve URL pré-assinada válida por **3 horas**.

### Corpo da requisição

```json
{
  "IdConcessionaria": 10,
  "Nome": "João Silva",
  "Cpf": "12345678901",
  "IdFiliado": 456,
  "NumIstalacao": "987654321",
  "NumCliente": "111222333",
  "ConsMedio": "120",
  "Nacionalidade": "Brasileira",
  "Profissao": "Engenheiro",
  "Aniversario": "01/01/1990",
  "EstCivil": "Solteiro",
  "FileId": "path-id-123"
}
```

### Resposta de sucesso (200)

```json
{
  "fileUrl": "https://signed-url.example/Contrato_EDT.pdf"
}
```

### Erros de entrada (400)

| HTTP | Mensagem                                             |
| ---- | ---------------------------------------------------- |
| 400  | `O corpo da requisição está vazio.`                  |
| 400  | `O corpo da requisição possui um formato inválido.`  |
| 400  | `Os seguintes campos estão vazios ou nulos: {Campo}` |

### Erros de negócio

| HTTP | Mensagem                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------- |
| 404  | `Não foi possível os dados do filiado com o id filiado {IdFiliado}`                                |
| 404  | `Não foi possível achar os dados da concessionaria`                                                |
| 400  | `Os seguintes campos estão vazios ou nulos: ...` (variáveis do contrato incompletas após montagem) |
| 500  | `Erro interno no servidor`                                                                         |
