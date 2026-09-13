# Contrato de Rotas do API Gateway

Entrada pública única da solução. JWT e autorização de recurso são validados pela aplicação NestJS; o Gateway controla exposição, roteamento, CORS, throttling e logs.

## URL base

| Ambiente | URL |
| --- | --- |
| Produção | `https://{api-id}.execute-api.{region}.amazonaws.com` (SSM: `api_gateway_url`) |
| Local | `http://localhost:3000` (sem Gateway) |

Autenticação por CPF: `{api_gateway_url}/auth/cpf` (sem prefixo `/v1`).

APIs de negócio: `{api_gateway_url}/v1/...`

## Inventário e classificação

| Rota | Método | Integração | Autenticação | Público |
| --- | --- | --- | --- | --- |
| `/auth/cpf` | POST | Lambda auth-cpf | Nenhuma (CPF) | Sim |
| `/health` | GET | EKS (NLB) | Nenhuma | Sim (liveness) |
| `/docs` | GET | EKS | Nenhuma | Sim (decisão explícita) |
| `/v1/auth/login` | POST | EKS | Nenhuma | Sim |
| `/v1/auth/me` | GET | EKS | JWT | Interno |
| `/v1/clientes/**` | * | EKS | JWT + perfil | Interno |
| `/v1/usuarios/**` | * | EKS | JWT + ADMIN | Interno |
| `/v1/veiculos/**` | * | EKS | JWT + perfil | Interno |
| `/v1/pecas/**` | * | EKS | JWT (+ perfil escrita) | Interno |
| `/v1/servicos/**` | * | EKS | JWT (+ perfil escrita) | Interno |
| `/v1/ordens-servico/**` | * | EKS | JWT + perfil / ownership | Interno / cliente |
| `/v1/orcamentos/**` | * | EKS | JWT + perfil / ownership | Interno / cliente |
| `/v1/movimentacoes-estoque/**` | * | EKS | JWT + ALMOXARIFE/ADMIN | Interno |
| `/health/ready` | GET | — | — | Não exposto no Gateway (probe K8s) |

## Tabela de rotas do Gateway (Terraform)

| Route key | Target | Observação |
| --- | --- | --- |
| `POST /auth/cpf` | Lambda | Proxy AWS |
| `OPTIONS /auth/cpf` | Lambda | CORS preflight |
| `GET /health` | EKS via VPC Link | Healthcheck NLB |
| `GET /docs` | EKS | Swagger UI |
| `GET /docs/{proxy+}` | EKS | Assets Swagger |
| `ANY /v1/{proxy+}` | EKS via VPC Link | APIs protegidas |
| `OPTIONS /v1/{proxy+}` | EKS | CORS preflight |

## Respostas uniformes na borda

| Situação | Status | Origem | Corpo |
| --- | --- | --- | --- |
| Rota inexistente | 404 | Gateway | `{"message":"Not Found"}` |
| Throttling | 429 | Gateway | `{"message":"Too Many Requests"}` |
| Timeout integração | 504 | Gateway | `{"message":"Service Unavailable"}` |
| Integração indisponível | 502/503 | Gateway | Mensagem padrão AWS |
| Erro de negócio | 4xx | Aplicação/Lambda | JSON da integração |
| Sucesso | 2xx | Aplicação/Lambda | JSON da integração |

## Versionamento (`/v1`)

- Rotas de negócio usam prefixo `/v1`.
- `/auth/cpf` permanece fora do versionamento (contrato da Function).
- Evolução: nova versão `/v2` em paralelo; `/v1` depreciada com aviso em `Sunset` header antes da remoção.
- Quebra de contrato em `/v1` exige nova major ou coordenação com consumidores.

## Idempotência (escritas críticas)

Header opcional `Idempotency-Key`. Quando presente:

| Operação | Scope | Reenvio |
| --- | --- | --- |
| `POST /v1/ordens-servico` | `ordens-servico.create` | Mesmo status/corpo da 1ª resposta |
| `POST /v1/orcamentos` | `orcamentos.create` | Mesmo status/corpo |
| `PATCH /v1/orcamentos/:id` | `orcamentos.decide` | Mesmo status/corpo |
| `POST /v1/movimentacoes-estoque` | `movimentacoes-estoque.create` | Mesmo status/corpo |

Mesma chave com body diferente → `409 Conflict`. Decisão de orçamento com mesmo status também é idempotente por regra de domínio.

## Timeouts (ms)

| Camada | Valor | Motivo |
| --- | --- | --- |
| API Gateway integração | 29000 | Abaixo do máximo AWS (30s) |
| Lambda auth-cpf | 30000 | Alinhado ao Gateway |
| Aplicação / RDS | ≤ 25s | Gateway não expira antes de escrita iniciada |

## CORS (por ambiente)

Variável Terraform `api_cors_origins`. Produção: origens explícitas (não `*`). Headers: `Content-Type`, `Authorization`, `X-Correlation-Id`, `Idempotency-Key`.

## Correlação

Header `X-Correlation-Id`: propagado se enviado; gerado na borda se ausente; devolvido em toda resposta. Access logs JSON no CloudWatch (`/aws/apigateway/tech-challenge-{env}-api`).

## Throttling e rate limit

| Camada | Escopo | Burst | Rate | Resposta |
| --- | --- | --- | --- | --- |
| Stage default | Todas as rotas | 100 | 50 req/s | 429 `Too Many Requests` |
| Route `POST /auth/cpf` | Por IP de origem | 10 | 5 req/s | 429 uniforme |
| Lambda DynamoDB | Por CPF (hash SHA-256) | 5 tentativas / 300 s | — | 429 `RATE_LIMIT` |

Variáveis Terraform: `api_throttling_*`, `auth_route_throttling_*`, `auth_cpf_max_attempts`.

Teste de carga controlada: `scripts/security/test-auth-rate-limit.sh` (janela combinada).

## WAF

**Decisão:** não adotado nesta fase. Throttling no stage + validação JWT na aplicação cobrem o risco inicial; WAF gerenciado será reavaliado na spec de hardening se houver tráfego externo ampliado.
