# Tech Challenge — API de Oficina Mecânica

API REST para gestão de uma oficina mecânica: clientes, veículos, peças, serviços, ordens de serviço, orçamentos e movimentações de estoque. Projeto do Tech Challenge (FIAP).

## Tecnologias

- [Node.js](https://nodejs.org/)
- [NestJS 11](https://nestjs.com/)
- [Fastify](https://fastify.dev/)
- [Prisma 7](https://www.prisma.io/)
- [PostgreSQL 16](https://www.postgresql.org/)
- [Swagger](https://swagger.io/)
- [Jest](https://jestjs.io/)
- [Docker](https://www.docker.com/)
- [SonarQube](https://www.sonarsource.com/products/sonarqube/)
- [AWS](https://aws.amazon.com/)
- [Terraform](https://www.terraform.io/)

## Arquitetura

Arquitetura do serviço em execução na AWS — entrada pelo Load Balancer, pods no EKS e a comunicação com o Amazon RDS e o SendGrid:

<img width="1201" height="811" alt="arquitetura" src="assets/ARQUITETURA-CLOUD.png" />

Estrutura do código, camadas e regra de dependência em [`docs/arquitetura.md`](docs/arquitetura.md).

## Pré-requisitos

- Node.js 24+
- Yarn 1.x
- Docker e Docker Compose (recomendado para subir o banco)

## Instalação e Execução

> OBS: É NECESSÁRIO CONFIGURAR O ARQUIVO .ENV

1. Clonar o repositório:

   ```bash
   git clone https://github.com/7feeh7/tech-challenge-oficina.git
   ```

2. Copiar as variáveis de ambiente:

   ```bash
   cp .env.example .env
   ```

3. Subir API + Postgres com Docker:

   ```bash
   docker compose up --build
   ```

4. Agora deve estar em execução:

- API: http://localhost:3000
- Swagger: http://localhost:3000/docs
- Postgres: localhost:5432

Variáveis de ambiente, scripts do `package.json` e execução sem Docker em [`docs/configuracao.md`](docs/configuracao.md).

## Comandos úteis

**Parar o serviço**:

```bash
docker compose down
```

## Endpoints

Contratos HTTP em [`docs/api.md`](docs/api.md) e especificação em [`docs/openapi.json`](docs/openapi.json).

Todas as rotas são protegidas por JWT, exceto `POST /auth/login` e as de health. Faça login e envie o token nas demais requisições:

```bash
curl --location 'http://localhost:3000/clientes' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer SEU_TOKEN'
```

Perfis, permissões e fluxo de login em [`docs/autenticacao.md`](docs/autenticacao.md).

Principais rotas:

- `POST /auth/login` — autenticação
- `GET|POST|PATCH|DELETE /clientes`, `/veiculos`, `/servicos`, `/pecas`
- `POST /ordens-servico` — abre a OS com cliente, veículo, serviços e peças
- `GET /ordens-servico` — fila de trabalho
- `GET /ordens-servico/:id` — status atual e detalhes da OS
- `PATCH /ordens-servico/:id` — muda o status da OS (notifica o cliente por e-mail)
- `GET /ordens-servico/metricas/tempo-medio` — tempo médio de execução / ciclo total
- `GET|POST|PATCH|DELETE /orcamentos` — aprovar orçamento baixa estoque automaticamente
- `GET|POST /movimentacoes-estoque`
- `GET|POST|PATCH|DELETE /usuarios` (somente ADMINISTRADOR)

Fila de OS, máquina de estados, renegociação, desistência e notificação por e-mail em [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md).

## Como rodar os testes

Executar toda a suite:

```bash
yarn test
```

Cobertura e end-to-end:

```bash
yarn test:cov
yarn test:e2e
```

Cobertura mínima, padrão dos testes e SonarQube em [`docs/testes-e-qualidade.md`](docs/testes-e-qualidade.md).

## Repositórios da solução (Fase 3)

| Repositório | Responsabilidade |
| --- | --- |
| **tech-challenge** (este) | API NestJS, Prisma, Dockerfile, manifests `k8s/` |
| [tech-challenge-serverless](../tech-challenge-serverless) | Functions de auth CPF e notificação |
| [tech-challenge-infra-kubernetes](../tech-challenge-infra-kubernetes) | VPC, EKS, ECR, Lambda shell, SSM |
| [tech-challenge-infra-database](../tech-challenge-infra-database) | RDS PostgreSQL, Secrets Manager |

## Infraestrutura e deploy

A aplicação roda em **EKS** com banco no **RDS**, imagem no **ECR** e autoescalonamento por **HPA**. Existe **um único ambiente provisionado**: `develop` valida automaticamente (sem tocar a AWS) e `main` implanta após merge de PR aprovado.

- ADR ambiente único: [`docs/adr/001-ambiente-unico-provisionado.md`](docs/adr/001-ambiente-unico-provisionado.md)

- Arquitetura e ordem de provisionamento: [`docs/infraestrutura.md`](docs/infraestrutura.md)
- Pipeline e secrets: [`docs/ci-cd.md`](docs/ci-cd.md)
- Governança de branches: [`docs/governanca-git.md`](docs/governanca-git.md)
- Manifests Kubernetes: [`k8s/README.md`](k8s/README.md)

> **Custos:** EKS, NAT Gateway e RDS geram custo enquanto ligados. Use `workflow_dispatch` → destroy nos repos de infra após a demonstração.

## Documentação

Índice completo em [`docs/README.md`](docs/README.md).

| Documento                                        | Conteúdo                                                    |
| ------------------------------------------------ | ----------------------------------------------------------- |
| [arquitetura](docs/arquitetura.md)               | Clean Architecture, estrutura de pastas e camadas           |
| [configuracao](docs/configuracao.md)             | Variáveis de ambiente, execução local e scripts             |
| [autenticacao](docs/autenticacao.md)             | Login JWT, perfis e permissões                              |
| [api](docs/api.md)                               | Contratos HTTP de todos os endpoints                        |
| [regras-de-negocio](docs/regras-de-negocio.md)   | Fila de OS, máquina de estados, orçamentos, estoque, e-mail |
| [testes-e-qualidade](docs/testes-e-qualidade.md) | Testes, cobertura e SonarQube                               |
| [infraestrutura](docs/infraestrutura.md)         | Fase 2: AWS, Terraform, Kubernetes e HPA                    |
| [ci-cd](docs/ci-cd.md)                           | Pipeline do GitHub Actions e secrets                        |

**Vídeo demonstrativo:** _adicionar link do YouTube/Vimeo aqui_.
