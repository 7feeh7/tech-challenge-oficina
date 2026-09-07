# Configuração e Execução Local

## Pré-requisitos

- Node.js 24+
- Yarn 1.x
- Docker e Docker Compose (recomendado para subir o banco)

## Variáveis de ambiente

1. Copie o arquivo de variáveis de ambiente:

   ```bash
   cp .env.example .env
   ```

2. Edite o `.env` conforme necessário. As variáveis principais:

   | Variável                                                               | Descrição                                                                      |
   | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
   | `DATABASE_URL`                                                         | Connection string do PostgreSQL (Prisma)                                       |
   | `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | Credenciais do container Postgres                                              |
   | `JWT_SECRET`                                                           | Segredo usado para assinar os tokens JWT (**obrigatório alterar em produção**) |
   | `PORT`                                                                 | Porta da API (padrão `3000`)                                                   |
   | `SENDGRID_API_KEY`                                                     | Chave da API do SendGrid (notificação de status da OS)                         |
   | `SENDGRID_FROM_EMAIL`                                                  | Remetente dos e-mails — precisa ser um _Verified Sender_ no SendGrid           |

   > Sem as variáveis do SendGrid a API sobe normalmente: o envio é apenas registrado como aviso no log. A notificação é _best-effort_ e nunca bloqueia a atualização da OS.

   Em nuvem existe ainda a variável `DATABASE_SSL`, ligada pelo ConfigMap do Kubernetes — ver [infraestrutura.md](infraestrutura.md).

## Como rodar

### Docker Compose

Sobe API + Postgres em containers:

```bash
docker compose up --build
```

A API ficará disponível em `http://localhost:3000` e o Postgres em `localhost:5432`.

### Documentação interativa (Swagger)

Após subir a API, acesse:

```
http://localhost:3000/docs
```

A documentação inclui todos os endpoints, schemas e o botão **Authorize** para autenticar com Bearer Token. Os contratos também estão escritos em [api.md](api.md).

## Scripts disponíveis

| Script                       | Descrição                                    |
| ---------------------------- | -------------------------------------------- |
| `yarn start:dev`             | Inicia a API em modo watch                   |
| `yarn start:prod`            | Executa o build de produção (`dist/main.js`) |
| `yarn build`                 | Compila o projeto                            |
| `yarn test`                  | Executa os testes unitários                  |
| `yarn test:watch`            | Testes em modo watch                         |
| `yarn test:cov`              | Testes com relatório de cobertura            |
| `yarn test:e2e`              | Testes end-to-end                            |
| `yarn lint`                  | ESLint com autofix                           |
| `yarn format`                | Prettier                                     |
| `yarn prisma migrate dev`    | Cria e aplica nova migration (dev)           |
| `yarn prisma migrate deploy` | Aplica migrations existentes (prod/CI)       |
| `yarn prisma studio`         | Abre o Prisma Studio                         |
