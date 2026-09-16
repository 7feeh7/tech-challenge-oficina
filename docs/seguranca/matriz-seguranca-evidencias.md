# Matriz Segurança — Controle, Spec e Evidência

Atualizar após cada deploy relevante.

| Ameaça (ID) | Controle                | Spec | Evidência verificável                                             | Exceção                                                   |
| ----------- | ----------------------- | ---- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| A1          | 401 uniforme            | 002  | `tech-challenge-serverless/tests/auth-cpf.service.spec.ts`        | —                                                         |
| A2          | Timing pad 300 ms       | 010  | `timing-pad.service.ts` + testes                                  | —                                                         |
| A3          | Throttle IP Gateway     | 003  | `api-gateway.tf` `route_settings` POST /auth/cpf                  | —                                                         |
| A4          | Rate limit CPF DynamoDB | 010  | `cpf-rate-limit.service.ts`, `auth-security.tf`                   | —                                                         |
| A5          | WAF distribuído         | 010  | Decisão documentada — [gateway-rotas.md](../gateway-rotas.md#waf) | Formal: não adotado                                       |
| A6–A7       | Sanitização logs        | 007  | `log-sanitizer.spec.ts`, `datadog.tf`                             | —                                                         |
| A8          | Ownership guard         | 002  | `ownership.guard.spec.ts`, `app.e2e-spec.ts`                      | —                                                         |
| A9          | Segredos SM + scan      | 010  | TruffleHog nos 4 `pr-validation.yml`                              | —                                                         |
| A10         | OIDC + trust main       | 010  | `github-oidc.tf`, deploy.yml `role-to-assume`                     | Bootstrap: ver [rotacao-segredos.md](rotacao-segredos.md) |
| A11         | Dependabot/audit/Sonar  | 010  | `dependabot.yml`, `pr-validation.yml`                             | —                                                         |
| A12         | tfsec/checkov           | 010  | Infra `pr-validation.yml`                                         | —                                                         |

## Testes de validação

| Teste              | Script / comando                                 | Resultado esperado         |
| ------------------ | ------------------------------------------------ | -------------------------- |
| PII ausente em log | `bash scripts/security/verify-no-pii-in-logs.sh` | Exit 0                     |
| Rate limit auth    | `bash scripts/security/test-auth-rate-limit.sh`  | HTTP 429 após N tentativas |
| Ownership          | `yarn test:e2e` (filtro ownership)               | 403 cross-client           |
| Scan histórico     | TruffleHog `fetch-depth: 0` em PR                | Sem segredos verified      |

## Evidências GitHub (coleta manual)

```bash
bash scripts/security/collect-github-evidence.sh <org-github>
```

Arquivos gerados em `evidence/` (nomes de secrets apenas, sem valores).

## Publicação (vídeo/PDF)

Checklist: [checklist-publicacao.md](checklist-publicacao.md)
