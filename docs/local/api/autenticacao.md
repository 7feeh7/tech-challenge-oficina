# Autenticação e Autorização

A API é protegida globalmente por JWT. Entrada pública via **API Gateway** (ver [gateway-rotas.md](gateway-rotas.md) e [ADR-002](../../adrs/002-api-gateway-borda-unica.md)). Rotas marcadas com `@Public()` (ex.: `POST /v1/auth/login` e `/health`) não exigem token.

Fluxo completo: [diagramas/sequencia-auth-cpf.md](../../diagramas/sequencia-auth-cpf.md) · RFC: [rfcs/003-autenticacao-cpf-jwt.md](../../rfcs/003-autenticacao-cpf-jwt.md)

## Funcionários internos

1. Faça login:

   ```http
   POST /v1/auth/login
   {
     "email": "usuario@oficina.com",
     "senha": "senha123"
   }
   ```

2. Use o `token` retornado:

   ```
   Authorization: Bearer <token>
   ```

O payload carrega `sub` (id do usuário), `tipo: INTERNO`, `email` e `perfil`.

## Clientes (CPF via Function serverless)

1. Autentique-se pelo API Gateway:

   ```http
   POST /auth/cpf
   {
     "cpf": "529.982.247-25"
   }
   ```

2. Use o `accessToken` retornado nas rotas permitidas ao perfil `CLIENTE`:

   ```
   Authorization: Bearer <accessToken>
   ```

Claims do token de cliente: `sub` (= `clienteId`), `tipo: CLIENTE`, `perfil: CLIENTE`, `iss`, `aud`, `iat`, `exp`, `jti`. Sem CPF, nome ou e-mail no token.

Contrato completo da Function: repositório `tech-challenge-serverless` em `docs/contrato-auth-cpf.md`.

## Convivência de tokens

| Origem | `tipo` | `perfil` | Uso |
| --- | --- | --- | --- |
| `POST /v1/auth/login` | `INTERNO` | `ADMINISTRADOR`, `ATENDENTE`, etc. | Rotas administrativas |
| `POST /auth/cpf` | `CLIENTE` | `CLIENTE` | Consulta da própria OS e decisão sobre o próprio orçamento |

A API valida `iss` e `aud` nos tokens de cliente (`JWT_ISSUER`, `JWT_AUDIENCE`).

## Ownership

Token de cliente só acessa recursos cujo `clienteId` coincide com `sub`:

- `GET /v1/ordens-servico/:id`
- `GET /v1/orcamentos/:id`
- `PATCH /v1/orcamentos/:id` (apenas aprovar/rejeitar)

Tentativa de acesso cruzado retorna `403`.

## Perfis internos e permissões

| Perfil          | Acesso                                            |
| --------------- | ------------------------------------------------- |
| `ADMINISTRADOR` | Acesso total                                      |
| `ATENDENTE`     | Clientes, veículos, ordens de serviço, orçamentos |
| `MECANICO`      | Ordens de serviço                                 |
| `ALMOXARIFE`    | Peças e movimentações de estoque                  |

`CLIENTE` **não** existe como perfil de usuário interno — não é possível criar funcionário com esse perfil.

## Status do cliente e autenticação

Clientes possuem campo `ativo`. Inativos recebem `401` na Function (mesma resposta de CPF inexistente). Inativação é auditada em `auditoria_cliente_status`. OS em andamento pode ser concluída pela oficina; reativação por `ADMINISTRADOR` ou `ATENDENTE` via `PATCH /clientes/:id/status`.

## Renovação e revogação

Sem refresh token: expirado o JWT, o cliente autentica novamente por CPF. Inativar o cliente impede novas emissões; tokens já emitidos continuam válidos até expirar (TTL curto de 1h).

## Configuração

Ver [configuracao.md](configuracao.md) — `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`.
