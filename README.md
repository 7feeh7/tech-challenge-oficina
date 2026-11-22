# Tech Challenge — OS Service (Oficina Mecânica)

Serviço central da oficina mecânica: clientes, veículos, catálogo, estoque e ordens de serviço. Projeto do Tech Challenge (FIAP).

Na **Fase 4** a solução foi dividida em seis repositórios independentes. Este é o **OS Service** e **orquestra a SAGA** das ordens de serviço: envia comandos ao Billing e ao Execution e é o único que muda o status da OS.

## Tecnologias

| Tecnologia         | Uso                                         |
| ------------------ | ------------------------------------------- |
| Node.js 24+        | Runtime                                     |
| NestJS 11          | Framework, com Fastify 5                    |
| TypeScript         | Linguagem                                   |
| Prisma 7           | ORM e migrations                            |
| PostgreSQL 16      | Banco relacional (RDS em produção)          |
| Amazon SQS / SNS   | Mensageria (comandos, eventos, notificação) |
| Jest 30 + ESLint   | Testes e lint                               |
| Docker             | `Dockerfile` multi-stage na raiz            |
| dd-trace (Datadog) | Tracing e métricas                          |

## Arquitetura

- **Responsabilidade:** clientes, veículos, usuários e login (`POST /v1/auth/login`, JWT RS256), catálogo (serviços e peças), estoque com reservas, ordens de serviço com histórico de status e idempotência por `Idempotency-Key`. Prefixo global `/v1`.
- **Deploy:** EKS, namespace `oficina`, com `Deployment`, `HPA`, `Service` e `ServiceAccount` (IRSA) em [`k8s/`](k8s/README.md). O isolamento entre serviços vem de namespace, IAM/IRSA e credenciais e banco próprios.
- **Banco:** database `oficina` na instância RDS PostgreSQL compartilhada, com usuário próprio. Não é acessado pelos outros serviços.
- **SAGA orquestrada:** o OS envia comandos por filas SQS ponto a ponto (`billing-in`, `execution-in`) e recebe os fatos na fila `os-in`, criada em [`terraform/`](terraform/README.md). Billing e Execution não consomem eventos um do outro. Quando a cobrança expira ou o cliente desiste, o OS executa a compensação (cancela a tarefa, cancela ou estorna o financeiro e libera a reserva de estoque).
- **Outbox e idempotência:** mensagens saem pela tabela `outbox_mensagens` (Transactional Outbox) e o consumo é idempotente por `mensagens_processadas`.
- **REST interno:** rotas `/internal/...`, fora do API Gateway e protegidas por token de chamador. Recebe o diagnóstico do Execution, a reserva de estoque do Billing e a consulta de cliente por CPF da Lambda de autenticação.
- **Notificação:** o OS publica as mudanças de status e a disponibilização de pagamento no SNS. O SNS só notifica e não participa da orquestração.
- **Borda:** todo acesso externo passa pelo API Gateway (provisionado no `tech-challenge-infra-kubernetes`).

## Execução e desenvolvimento

Pré-requisitos: Node.js 24+, Yarn 1.x e Docker com Docker Compose.

```bash
git clone https://github.com/7feeh7/tech-challenge-oficina.git
cd tech-challenge-oficina
cp .env.example .env   # ajuste os valores
docker compose up --build
```

- API: http://localhost:3000
- Swagger: http://localhost:3000/docs
- Health: http://localhost:3000/health
- PostgreSQL: `localhost:5432`

O compose aplica as migrations (`yarn prisma migrate deploy`) antes de iniciar. Os processadores de SQS e do outbox vêm desligados no `.env.example`. Para parar: `docker compose down`.

Execução sem Docker (com um PostgreSQL local e `DATABASE_URL` no `.env`):

```bash
yarn install
yarn prisma generate
yarn prisma migrate deploy
yarn start:dev
```

Testes e qualidade:

```bash
yarn test       # unitários
yarn test:cov   # unitários com cobertura
yarn test:int   # integração (PostgreSQL local; inclui BDD e contratos)
yarn test:e2e   # end-to-end
yarn lint
yarn build
```

O CI (`pr-validation.yml`) roda auditoria de dependências (`audit-ci`), lint, build, cobertura, integração e e2e. O deploy para a `main` está em `deploy.yml`.

## Documentação

- Arquitetura (RFCs, ADRs e diagramas): [`docs/README.md`](docs/README.md)
- Decisões da Fase 4: [ADR-008 microsserviços](docs/adrs/008-divisao-em-microsservicos.md), [ADR-009 SAGA orquestrada](docs/adrs/009-saga-orquestrada.md), [ADR-010 SQS e outbox](docs/adrs/010-mensageria-sqs-outbox.md), [ADR-011 persistência poliglota](docs/adrs/011-persistencia-poliglota.md)
- Saga: [`docs/saga-fato-estado.md`](docs/saga-fato-estado.md)
- Contratos: [eventos](docs/contratos/eventos-os.md), [REST interno](docs/contratos/rest-interno-os.md), [pendências](docs/contratos/pendencias-os.md)
- API: [`docs/local/api/api.md`](docs/local/api/api.md), [OpenAPI](docs/local/api/openapi.json), [rotas do gateway](docs/local/api/gateway-rotas.md), [autenticação](docs/local/api/autenticacao.md), [configuração](docs/local/api/configuracao.md)
- Regras de negócio: [`docs/local/api/regras-de-negocio.md`](docs/local/api/regras-de-negocio.md)
- Testes: [`docs/testes-bdd-e-contratos.md`](docs/testes-bdd-e-contratos.md), [`docs/local/operacao/testes-e-qualidade.md`](docs/local/operacao/testes-e-qualidade.md)
- Operação: [CI/CD](docs/local/operacao/ci-cd.md), [observabilidade](docs/local/operacao/observabilidade.md), [runbook de produção](docs/local/operacao/runbook-subir-producao.md)
- Manifests Kubernetes: [`k8s/README.md`](k8s/README.md)

## Repositórios da solução

| Repositório                       | Responsabilidade                                      |
| --------------------------------- | ----------------------------------------------------- |
| **tech-challenge-oficina** (este) | OS Service e orquestrador da SAGA                     |
| tech-challenge-billing            | Orçamentos, cobranças e Mercado Pago                  |
| tech-challenge-execution          | Tarefas de diagnóstico e reparo                       |
| tech-challenge-infra-kubernetes   | EKS, API Gateway, mensageria de notificação e Datadog |
| tech-challenge-infra-database     | RDS PostgreSQL                                        |
| tech-challenge-serverless         | Lambdas de autenticação por CPF e notificação         |

Todos em `github.com/7feeh7/<repositório>`; o OS Service é `tech-challenge-oficina`.
