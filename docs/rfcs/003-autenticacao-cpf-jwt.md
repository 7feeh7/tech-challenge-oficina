# RFC-003 — Autenticação por CPF/JWT

**Status:** aceito  
**Autores:** equipe Tech Challenge  
**Revisores:** —  
**Data:** 2026-09-13  
**ADR relacionado:** [ADR-002](../adrs/002-api-gateway-borda-unica.md) _(borda); autorização na app_

## Contexto

Clientes da oficina devem consultar OS e orçamentos sem credencial de funcionário. O enunciado exige Function serverless que valide CPF, consulte status do cliente e emita JWT para APIs protegidas (R-02 a R-05).

## Proposta

1. **`POST /auth/cpf`** no API Gateway → Lambda `auth-cpf` (VPC).
2. Validar formato/dígitos do CPF; consultar `clientes` por CPF (11 dígitos, query parametrizada).
3. Resposta **401 idêntica** para CPF inexistente ou cliente `ativo=false` (anti-enumeração).
4. Emitir JWT **HS256**, TTL **1 h**, claims: `sub`, `tipo: CLIENTE`, `perfil: CLIENTE`, `iss`, `aud`, `jti` — **sem PII**.
5. API NestJS valida `iss`/`aud`/expiração e aplica **ownership** (`sub` = `clienteId`).
6. **Sem refresh token** — reautenticação por CPF após expiração.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| **Lambda + JWT HS256** (escolhida) | Serverless conforme enunciado; secret compartilhado via Secrets Manager | Rotação manual do secret |
| JWT authorizer no Gateway | Validação na borda | Não cobre ownership/perfil; duplica regras |
| Cognito + custom auth | Gerenciamento de usuários | Overhead; CPF como username exige customização |
| OAuth2/OIDC externo | Padrão corporativo | Fora do escopo acadêmico; dependência externa |
| Refresh token | UX melhor para app mobile | Superfície de ataque maior; não exigido |

## Consequências

### Positivas

- Function isolada na VPC com acesso mínimo ao RDS.
- Tokens curtos limitam janela de abuso se vazados.
- Mesma resposta 401 mitiga enumeração de CPFs cadastrados.

### Negativas / trade-offs

- Tokens emitidos antes da inativação permanecem válidos até expirar.
- HS256 exige rotação coordenada secret Lambda + API.
- CNPJ não autenticável pela Function (apenas CPF de pessoa física).

## Riscos

| Risco | Mitigação |
| --- | --- |
| Enumeração de CPF | 401 uniforme; rate limit Gateway + DynamoDB por CPF; timing pad |
| Vazamento de JWT | TTL 1 h; sem PII no payload; logs sanitizados |
| Secret comprometido | Rotação via Secrets Manager + redeploy API/Lambda |

## Modelo de ameaças

Matriz completa em [modelo-ameacas.md](../local/seguranca/modelo-ameacas.md).

## Discussão e conclusão

Gateway authorizer foi rejeitado na ADR-002 — regras de ownership permanecem na aplicação. Cognito descartado por complexidade. Proposta aceita e implementada conforme `tech-challenge-serverless/docs/contrato-auth-cpf.md`.

## Referências

- [sequencia-auth-cpf.md](../diagramas/sequencia-auth-cpf.md)
- [autenticacao.md](../local/api/autenticacao.md)
- [modelo-ameacas.md](../local/seguranca/modelo-ameacas.md)
- `tech-challenge-serverless/docs/contrato-auth-cpf.md`
