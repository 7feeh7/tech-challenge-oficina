# Demonstração Fase 3 — Roteiro reproduzível

Roteiro para vídeo (máx. **15 min**), ensaio cronometrado e validação pré-gravação. Dados **fictícios**; nunca use CPF, e-mail ou credencial real na gravação.

## Pré-requisitos

1. Ambiente AWS operacional (Gateway, EKS, RDS, Lambda, SNS/SQS, SendGrid, Datadog) ou stack local para ensaio.
2. Seed de demo aplicado **manualmente** (nunca no deploy):

   ```bash
   ./scripts/seed-demo.sh
   # remoto: ./scripts/seed-demo.sh --url "$DATABASE_URL"
   ```

3. Terminal e navegador sem tokens visíveis; dashboards Datadog sem PII.

## Dados fictícios (seed)

| Entidade      | Valor                                               | Uso                                             |
| ------------- | --------------------------------------------------- | ----------------------------------------------- |
| CPF ativo     | `529.982.247-25`                                    | Auth CPF → JWT                                  |
| CPF inativo   | `390.533.447-05`                                    | 401 sem enumeração                              |
| CPF inválido  | `111.111.111-11`                                    | 400 validação                                   |
| Admin interno | `admin@oficina.com` / senha do secret `ADMIN_SENHA` | Login `/v1/auth/login`                          |
| OS demo       | UUID fixo no seed                                   | `GET /v1/ordens-servico/{id}` com token cliente |

## Tempo sugerido (≤ 15 min)

| Bloco               |    Min | Conteúdo                                                 |
| ------------------- | -----: | -------------------------------------------------------- |
| 1. Auth CPF         |      2 | Sucesso + falha (inativo/inválido)                       |
| 2. API protegida    |      2 | JWT cliente + 401/403 sem token ou ownership             |
| 3. CI/CD            |      3 | PR → `develop` (validação) → merge `main` (deploy)       |
| 4. Kubernetes       |      2 | Rollout, imagem/commit implantado                        |
| 5. OS + notificação |      2 | PATCH status → fila → Lambda notificação                 |
| 6. Observabilidade  |      4 | Dashboards, logs JSON, trace por `correlationId`, alerta |
| **Total**           | **15** | Reservar tempo para **resultado ao vivo**, não só código |

## 1. Autenticação por CPF

```bash
API="${API_GATEWAY_URL}"  # SSM: /tech-challenge/producao/infra/api_gateway_url

# Sucesso — cliente ativo
curl -sS -X POST "${API}/auth/cpf" \
  -H 'Content-Type: application/json' \
  -d '{"cpf":"529.982.247-25"}' | jq .

# Falha — mesmo corpo genérico (sem revelar se cadastro existe)
curl -sS -X POST "${API}/auth/cpf" \
  -H 'Content-Type: application/json' \
  -d '{"cpf":"390.533.447-05"}' | jq .

curl -sS -X POST "${API}/auth/cpf" \
  -H 'Content-Type: application/json' \
  -d '{"cpf":"111.111.111-11"}' | jq .
```

## 2. API protegida (JWT)

```bash
TOKEN="<accessToken do passo anterior>"

# Com ownership — OS do próprio cliente
curl -sS "${API}/v1/ordens-servico/55555555-5555-4555-8555-555555555001" \
  -H "Authorization: Bearer ${TOKEN}" | jq .

# Sem token
curl -sS -o /dev/null -w '%{http_code}\n' \
  "${API}/v1/ordens-servico/55555555-5555-4555-8555-555555555001"

# Sem ownership — login interno e tentar OS de outro cliente → 403
```

Swagger público (produção): `{api_gateway_url}/docs` · OpenAPI: [`openapi.json`](../api/openapi.json)

## 3. Pipeline CI/CD

1. Branch `feature/demo-check` → PR para `develop` → workflow **PR Validation** verde.
2. PR `develop` → `main` → merge → **deploy.yml** dispara build + deploy.
3. Mostrar run do GitHub Actions (sem expor secrets nos logs).

Repositórios: [tech-challenge](https://github.com/7feeh7/tech-challenge-oficina), [serverless](https://github.com/7feeh7/tech-challenge-serverless), [infra-k8s](https://github.com/7feeh7/tech-challenge-infra-kubernetes), [infra-db](https://github.com/7feeh7/tech-challenge-infra-database).

## 4. Rollout Kubernetes

```bash
kubectl rollout status deployment/oficina-api -n oficina
kubectl get pods -n oficina -o wide
kubectl describe deployment/oficina-api -n oficina | grep -E 'Image:|Replicas'
```

Mostrar tag da imagem ECR = commit SHA do merge em `main`.

## 5. Mudança de OS e notificação

Login interno (atendente/admin) → `PATCH /v1/ordens-servico/{id}` com novo status (ex.: `AGUARDANDO_APROVACAO`).

Verificar: métrica `oficina.ordem_servico.criada`, fila SQS, logs da Lambda `notificacao` (sem e-mail completo nos logs).

## 6. Observabilidade

| Evidência                          | Onde                                                          |
| ---------------------------------- | ------------------------------------------------------------- |
| Latência, CPU, memória, uptime     | Dashboard técnico Datadog (Terraform `datadog-dashboards.tf`) |
| Volume diário OS, tempo por status | Dashboard negócio                                             |
| Falhas de integração               | Dashboard integrações                                         |
| Logs JSON + `correlationId`        | CloudWatch Gateway + Datadog `oficina-api` + Lambda           |
| Trace ponta a ponta                | APM Datadog — mesmo `correlationId`                           |
| Alerta                             | Monitor provisionado ou evento recente + recuperação          |

Runbook: [`runbooks/correlacao-observabilidade.md`](../operacao/runbooks/correlacao-observabilidade.md)

## Checklist pré-gravação

- [ ] `./scripts/seed-demo.sh` executado no ambiente alvo
- [ ] Gateway, API, RDS, Lambdas e Datadog respondendo
- [ ] Terminal sem `AWS_*`, JWT ou senhas visíveis
- [ ] Cronômetro ≤ 15 min
- [ ] Link do vídeo (YouTube/Vimeo público ou não listado) testado em sessão anônima

## Referências

- Demo legado Fase 2 (local): [`legado/demo-end-to-end.md`](../legado/demo-end-to-end.md)
- PDF de entrega: [`entrega-fase3.md`](entrega-fase3.md)
