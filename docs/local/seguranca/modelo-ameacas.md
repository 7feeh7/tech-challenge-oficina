# Modelo de Ameaças — Tech Challenge Fase 3

**Versão:** 1.0  
**Data:** 2026-09-13  
**Spec:** [010-seguranca-e-privacidade-de-dados](../../../spec/changes/010-seguranca-e-privacidade-de-dados/spec.md)

## Ativos protegidos

| Ativo | Localização | Impacto se comprometido |
| --- | --- | --- |
| Base de clientes (CPF, nome, e-mail, placa) | RDS PostgreSQL | Violação LGPD; fraude; phishing |
| CPF como credencial | `POST /auth/cpf` | Enumeração; impersonação |
| JWT de cliente | Lambda auth + API NestJS | Acesso indevido a OS/orçamentos |
| Credencial RDS | Secrets Manager | Exfiltração total da base |
| Chave SendGrid | Secrets Manager | Spam; phishing em nome da oficina |
| Segredo JWT | Secrets Manager | Emissão de tokens falsos |
| State Terraform | S3 + DynamoDB lock | Alteração/destruição de infra |
| Credencial CI/CD | GitHub Environment `producao` + roles OIDC | Deploy malicioso; exfiltração |

## Superfícies públicas

| Superfície | Ameaça principal |
| --- | --- |
| `POST /auth/cpf` | Força bruta, enumeração, timing attack |
| Rotas `/v1/**` com JWT | Escalada horizontal (ownership bypass) |
| Swagger `/docs` | Exposição de contrato (aceito; sem PII) |
| API Gateway (access logs) | Vazamento de IP; sem body |
| Artefatos de entrega (vídeo, PDF) | CPF real ou segredo em captura |

## Matriz ameaça → controle → spec

| ID | Ameaça | I | P | Controle | Spec implementadora | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Enumeração CPF (corpo/código) | A | M | 401 idêntico inexistente/inativo | 002 auth | `auth-cpf.service.spec.ts` |
| A2 | Timing attack auth | M | M | Padding ~300 ms + jitter | 010 | `timing-pad.service.ts` |
| A3 | Força bruta por IP | A | M | Throttling Gateway (429 uniforme) | 003 borda | `api-gateway.tf` route_settings |
| A4 | Força bruta por CPF | A | M | DynamoDB rate limit (429) | 010 | `cpf-rate-limit.service.ts` |
| A5 | Varredura distribuída | M | L | Throttling + rate CPF; WAF não adotado | 003/010 | [gateway-rotas.md](../api/gateway-rotas.md#waf) |
| A6 | PII em logs/traces | A | M | Sanitização app + Datadog Agent | 007 | `log-sanitizer.ts`, `datadog.tf` |
| A7 | JWT em log | A | M | Regex JWT/Bearer redacted | 007 | `log-sanitizer.spec.ts` |
| A8 | Ownership bypass | A | M | Guard `sub` = recurso | 002 | `ownership.guard.spec.ts`, e2e |
| A9 | Segredo em código/state | A | L | SM + GitHub Secrets; TruffleHog | 010 | `pr-validation.yml` |
| A10 | CI de branch não-main | A | M | OIDC trust `refs/heads/main` | 010 | `github-oidc.tf` |
| A11 | Dependência vulnerável | M | M | Dependabot + npm audit + Sonar | 010 | `dependabot.yml`, `pr-validation.yml` |
| A12 | IaC misconfig | M | M | tfsec + checkov em PR | 010 | `pr-validation.yml` infra |

**Legenda impacto (I) e probabilidade (P):** A=alto, M=médio, L=baixo.

## Decisões registradas

- **WAF gerenciado:** não adotado nesta fase; throttling em camadas + rate limit por CPF cobrem o risco acadêmico. Reavaliar com tráfego externo ampliado.
- **CPF em resposta de perfil interno:** permitido para funcionários autenticados; minimizado em logs e mensageria.

## Referências

- [RFC-003 — Autenticação CPF/JWT](../../rfcs/003-autenticacao-cpf-jwt.md)
- [Matriz de evidências](matriz-seguranca-evidencias.md)
- [Ciclo de vida de dados pessoais](ciclo-vida-dados-pessoais.md)
