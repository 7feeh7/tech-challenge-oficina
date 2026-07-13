# Tech Challenge — API de Oficina Mecânica

API REST para gestão de uma oficina mecânica: clientes, veículos, peças, serviços, ordens de serviço, orçamentos e movimentações de estoque. Projeto do Tech Challenge (FIAP).

## Tecnologias

- **Node.js 24** + **TypeScript 5**
- **NestJS 11** com adapter **Fastify**
- **Prisma 7** ORM
- **PostgreSQL 16**
- **JWT** (autenticação) + **bcryptjs** (hash de senha)
- **class-validator** / **class-transformer** (validação de DTOs)
- **Swagger / OpenAPI** (documentação interativa)
- **Jest** (testes unitários e e2e)
- **Docker** / **Docker Compose**
- **SonarQube** (análise de qualidade)

## Estrutura do Projeto

Os módulos **`usuarios`**, **`clientes`**, **`veiculos`** e **`servicos`** já seguem a **Clean Architecture**: as dependências apontam sempre de fora para dentro (`infra` → `application` → `domain`), e a camada de domínio não conhece NestJS, Prisma nem HTTP. Os demais módulos ainda seguem o layout flat da Fase 1 (`*.controller.ts` + `*.service.ts`) e estão sendo migrados para esse mesmo padrão.

```
src/
├── usuarios/                        # ✅ Refatorado para Clean Architecture (módulo de referência)
│   ├── domain/                      # Camada mais interna — zero dependências externas
│   │   ├── entities/
│   │   │   └── usuario.entity.ts    # Entidade rica: valida e normaliza nome, e-mail e senha
│   │   ├── errors/
│   │   │   └── usuario.errors.ts    # Erros de domínio (herdam de DomainError)
│   │   └── perfil-usuario.ts        # Enum de domínio (ADMINISTRADOR, ATENDENTE, MECANICO, ALMOXARIFE)
│   ├── application/                 # Regras da aplicação — não conhece Nest nem Prisma
│   │   ├── ports/                   # Interfaces implementadas pela infra (inversão de dependência)
│   │   │   ├── usuario.gateway.ts   # Porta de persistência
│   │   │   ├── senha-hasher.ts      # Porta de criptografia (hash / comparar)
│   │   │   └── tokens.ts            # Símbolos de injeção das portas
│   │   ├── use-cases/               # Um caso de uso por arquivo, classes puras (sem decorators)
│   │   │   ├── criar-usuario.use-case.ts
│   │   │   ├── listar-usuarios.use-case.ts
│   │   │   ├── buscar-usuario.use-case.ts
│   │   │   ├── atualizar-usuario.use-case.ts
│   │   │   ├── remover-usuario.use-case.ts
│   │   │   └── validar-credenciais.use-case.ts   # Consumido pelo módulo auth
│   │   └── mappers/
│   │       └── usuario-output.mapper.ts          # Entidade → saída da API (nunca expõe senhaHash)
│   ├── infra/                       # Adaptadores — camada mais externa
│   │   ├── http/
│   │   │   ├── controllers/         # UsuariosController (injeta os casos de uso diretamente)
│   │   │   └── dtos/                # Contrato de entrada HTTP (class-validator + Swagger)
│   │   ├── persistence/             # PrismaUsuarioGateway + mapper Prisma ↔ domínio
│   │   └── crypto/                  # BcryptSenhaHasher
│   ├── admin-seed.service.ts        # Cria o administrador inicial no bootstrap
│   └── usuarios.module.ts           # Wiring: liga as portas aos adaptadores
│
├── auth/                            # Autenticação JWT + autorização por perfil
│   ├── decorators/                  # @Public(), @Roles()
│   ├── guards/                      # JwtAuthGuard (global) e RolesGuard
│   ├── dto/                         # LoginDto
│   └── auth.service.ts              # Assina o JWT; a validação de credenciais é um caso de uso
│
├── clientes/                        # ✅ Refatorado para Clean Architecture (mesmas camadas)
│   ├── domain/
│   │   ├── entities/                # Cliente: nome, e-mail, telefone e CPF/CNPJ validados
│   │   └── errors/                  # Erros de domínio de cliente
│   ├── application/
│   │   ├── ports/                   # ClienteGateway + token de injeção
│   │   ├── use-cases/               # criar, listar, buscar, atualizar e remover cliente
│   │   └── mappers/                 # Entidade → saída da API
│   ├── infra/
│   │   ├── http/
│   │   │   ├── controllers/         # ClientesController (injeta os casos de uso)
│   │   │   └── dtos/                # Contrato de entrada HTTP
│   │   └── persistence/             # PrismaClienteGateway + mapper Prisma ↔ domínio
│   └── clientes.module.ts
│
├── veiculos/                        # ✅ Refatorado para Clean Architecture (mesmas camadas)
│   ├── domain/
│   │   ├── entities/                # Veiculo: placa (Mercosul/antiga), marca, modelo e ano validados
│   │   └── errors/                  # Erros de domínio de veículo
│   ├── application/
│   │   ├── ports/                   # VeiculoGateway + ClienteConsultaGateway (o dono precisa existir)
│   │   ├── use-cases/               # criar, listar, buscar, atualizar e remover veículo
│   │   └── mappers/                 # Entidade → saída da API
│   ├── infra/
│   │   ├── http/
│   │   │   ├── controllers/         # VeiculosController (injeta os casos de uso)
│   │   │   └── dtos/                # Contrato de entrada HTTP
│   │   └── persistence/             # PrismaVeiculoGateway + PrismaClienteConsultaGateway
│   └── veiculos.module.ts
│
├── servicos/                        # ✅ Refatorado para Clean Architecture (mesmas camadas)
│   ├── domain/
│   │   ├── entities/                # Servico: nome único, preço base, tempo estimado e ativo
│   │   └── errors/                  # Erros de domínio de serviço
│   ├── application/
│   │   ├── ports/                   # ServicoGateway + token de injeção
│   │   ├── use-cases/               # criar, listar, buscar, atualizar e remover serviço
│   │   └── mappers/                 # Entidade → saída da API
│   ├── infra/
│   │   ├── http/
│   │   │   ├── controllers/         # ServicosController (injeta os casos de uso)
│   │   │   └── dtos/                # Contrato de entrada HTTP
│   │   └── persistence/             # PrismaServicoGateway + mapper (Decimal ↔ number)
│   └── servicos.module.ts
│
├── pecas/                           # Catálogo de peças
├── movimentacoes-estoque/           # Entradas e saídas de estoque
├── ordens-servico/                  # Ordens de serviço + máquina de estados (status-os.transitions.ts)
├── orcamentos/                      # Orçamentos (aprovação baixa o estoque)
│
├── common/                          # Blocos compartilhados entre módulos
│   ├── exceptions/                  # DomainError: base dos erros de domínio (validação, conflito, ...)
│   ├── filters/                     # DomainExceptionFilter: traduz erro de domínio em status HTTP
│   └── validators/                  # Validador de CPF/CNPJ
│
├── database/                        # PrismaService e PrismaModule
├── generated/prisma/                # Client gerado pelo Prisma (não versionar manualmente)
├── app.module.ts                    # Composição raiz: módulos, guards e filtros globais
└── main.ts                          # Bootstrap (Fastify, ValidationPipe, Swagger)
```

Fora de `src/`:

```
prisma/                              # schema.prisma e migrations
test/                                # testes end-to-end
docs/                                # material de apoio
Dockerfile · docker-compose.yml      # containerização
```

### Camadas e regra de dependência

| Camada | O que vive aqui | Pode depender de |
|---|---|---|
| `domain` | Entidades, enums e erros de negócio | Nada (nem framework, nem banco) |
| `application` | Casos de uso, portas e mappers de saída | `domain` |
| `infra` | Controllers, DTOs HTTP, gateway Prisma, hasher bcrypt | `application` e `domain` |

Os **DTOs ficam em `infra/http/dtos/`** porque são o contrato do mecanismo de entrega: carregam decorators de `class-validator` e Swagger, e só o controller os conhece. O contrato da camada de aplicação são as interfaces `...Input` declaradas junto de cada caso de uso, e o `...Output` dos mappers — esses sim independem de HTTP.

Os casos de uso dependem apenas de **interfaces** (`UsuarioGateway`, `SenhaHasher`). Quem escolhe as implementações concretas é o `usuarios.module.ts`, o que permite testá-los isoladamente com dublês — sem banco e sem subir o Nest.

Erros de domínio (`UsuarioNaoEncontradoError`, `EmailUsuarioJaExisteError`, ...) herdam das categorias de `common/exceptions` e são convertidos em respostas HTTP (404, 409, 400, 401) pelo `DomainExceptionFilter`, registrado globalmente. Assim nenhum caso de uso precisa importar exceções do NestJS.

Os testes (`*.spec.ts`) ficam ao lado do arquivo que exercitam.

## Pré-requisitos

- Node.js 24+
- Yarn 1.x
- Docker e Docker Compose (recomendado para subir o banco)

## Configuração

1. Copie o arquivo de variáveis de ambiente:

   ```bash
   cp .env.example .env
   ```

2. Edite o `.env` conforme necessário. As variáveis principais:

   | Variável | Descrição |
   |---|---|
   | `DATABASE_URL` | Connection string do PostgreSQL (Prisma) |
   | `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | Credenciais do container Postgres |
   | `JWT_SECRET` | Segredo usado para assinar os tokens JWT (**obrigatório alterar em produção**) |
   | `PORT` | Porta da API (padrão `3000`) |

## Como rodar

### Opção 1 — Tudo via Docker Compose (recomendado)

Sobe API + Postgres em containers:

```bash
docker compose up --build
```

A API ficará disponível em `http://localhost:3000` e o Postgres em `localhost:5432`.

> Na primeira execução, rode as migrations a partir da máquina host (ver passo abaixo) ou execute dentro do container.

### Opção 2 — API local + Postgres em Docker

1. Suba apenas o banco:

   ```bash
   docker compose up -d postgres
   ```

2. Instale dependências e gere o client Prisma:

   ```bash
   yarn install
   yarn prisma generate
   ```

3. Aplique as migrations:

   ```bash
   yarn prisma migrate deploy
   ```

4. Rode a API em modo de desenvolvimento:

   ```bash
   yarn start:dev
   ```

## Documentação da API (Swagger)

Após subir a API, acesse:

```
http://localhost:3000/docs
```

A documentação inclui todos os endpoints, schemas e o botão **Authorize** para autenticar com Bearer Token.

## Autenticação

A API é protegida globalmente por JWT. Rotas marcadas com `@Public()` (ex.: `POST /auth/login`) não exigem token.

1. Faça login:

   ```http
   POST /auth/login
   {
     "email": "usuario@oficina.com",
     "senha": "senha123"
   }
   ```

2. Use o `access_token` retornado no header das demais requisições:

   ```
   Authorization: Bearer <token>
   ```

### Perfis e permissões

O acesso aos endpoints é controlado por `@Roles` + `RolesGuard`:

| Perfil | Acesso |
|---|---|
| `ADMINISTRADOR` | Acesso total |
| `ATENDENTE` | Clientes, veículos, ordens de serviço, orçamentos |
| `MECANICO` | Ordens de serviço |
| `ALMOXARIFE` | Peças e movimentações de estoque |

## Scripts disponíveis

| Script | Descrição |
|---|---|
| `yarn start:dev` | Inicia a API em modo watch |
| `yarn start:prod` | Executa o build de produção (`dist/main.js`) |
| `yarn build` | Compila o projeto |
| `yarn test` | Executa os testes unitários |
| `yarn test:watch` | Testes em modo watch |
| `yarn test:cov` | Testes com relatório de cobertura |
| `yarn test:e2e` | Testes end-to-end |
| `yarn lint` | ESLint com autofix |
| `yarn format` | Prettier |
| `yarn prisma migrate dev` | Cria e aplica nova migration (dev) |
| `yarn prisma migrate deploy` | Aplica migrations existentes (prod/CI) |
| `yarn prisma studio` | Abre o Prisma Studio |

## Qualidade de código (SonarQube)

```bash
yarn sonar:up      # sobe o SonarQube local
yarn sonar         # roda testes com cobertura + scanner
yarn sonar:down    # encerra o SonarQube
```

SonarQube fica em `http://localhost:9000`.

## Testes

```bash
yarn test               # unitários
yarn test:cov           # cobertura
yarn test:e2e           # end-to-end
```

Domínios críticos (`clientes`, `veiculos`, `servicos`, `ordens-servico`, `orcamentos`) seguem o padrão **Arrange / Act / Assert** com mínimo de 80% de cobertura.

## Principais endpoints

- `POST /auth/login` — autenticação
- `GET|POST|PATCH|DELETE /clientes`
- `GET|POST|PATCH|DELETE /veiculos`
- `GET|POST|PATCH|DELETE /servicos`
- `GET|POST|PATCH|DELETE /pecas`
- `GET|POST|PATCH|DELETE /ordens-servico`
- `GET /ordens-servico/metricas/tempo-medio` — tempo médio de execução / ciclo total
- `GET|POST|PATCH|DELETE /orcamentos` — aprovar orçamento baixa estoque automaticamente
- `GET|POST /movimentacoes-estoque`
- `GET|POST|PATCH|DELETE /usuarios` (somente ADMINISTRADOR)

Consulte o Swagger (`/docs`) para a documentação completa de cada endpoint.
