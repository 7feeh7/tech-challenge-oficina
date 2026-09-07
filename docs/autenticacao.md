# Autenticação e Autorização

A API é protegida globalmente por JWT. Rotas marcadas com `@Public()` (ex.: `POST /auth/login` e as de health) não exigem token.

1. Faça login:

   ```http
   POST /auth/login
   {
     "email": "usuario@oficina.com",
     "senha": "senha123"
   }
   ```

2. Use o `token` retornado no header das demais requisições:

   ```
   Authorization: Bearer <token>
   ```

A senha do usuário é persistida como hash **bcryptjs** e nunca volta em nenhuma resposta. O payload do JWT carrega `sub` (id do usuário), `email` e `perfil`.

O administrador inicial é criado pelo seed do módulo `usuarios` — a senha vem da variável `ADMIN_SENHA` (ver [configuracao.md](configuracao.md) e [ci-cd.md](ci-cd.md)).

## Perfis e permissões

O acesso aos endpoints é controlado por `@Roles` + `RolesGuard`:

| Perfil          | Acesso                                            |
| --------------- | ------------------------------------------------- |
| `ADMINISTRADOR` | Acesso total                                      |
| `ATENDENTE`     | Clientes, veículos, ordens de serviço, orçamentos |
| `MECANICO`      | Ordens de serviço                                 |
| `ALMOXARIFE`    | Peças e movimentações de estoque                  |

Os catálogos de **serviços** e **peças** são de leitura livre para qualquer perfil autenticado; a escrita é restrita (serviços: `ADMINISTRADOR`; peças: `ADMINISTRADOR` e `ALMOXARIFE`). O detalhamento rota a rota está em [api.md](api.md).
