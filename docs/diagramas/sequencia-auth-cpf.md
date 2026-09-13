# Sequência — autenticação por CPF

**Versão:** 2026-09-13 (spec 008)  
**Implementação:** `tech-challenge-serverless/src/functions/auth-cpf/`, guards NestJS em `tech-challenge/src/modules/auth/`.

```mermaid
sequenceDiagram
    autonumber
    participant C as Consumidor
    participant GW as API Gateway
    participant L as Lambda auth-cpf
    participant SM as Secrets Manager
    participant DB as RDS PostgreSQL
    participant API as oficina-api (EKS)

    C->>GW: POST /auth/cpf { cpf }
    Note over GW: Gera/propaga X-Correlation-Id
    GW->>L: Proxy integration

    L->>L: Valida body e dígitos do CPF
    alt CPF inválido ou body malformado
        L-->>GW: 400 BODY_INVALIDO / CPF_*
        GW-->>C: 400 + X-Correlation-Id
    end

    L->>SM: Obtém credenciais DB (runtime)
    L->>DB: SELECT cliente WHERE cpf_cnpj = $1 AND LENGTH = 11
    alt Cliente inexistente ou ativo=false
        L-->>GW: 401 NAO_AUTORIZADO
        Note over L: Mesma resposta evita enumeração
        GW-->>C: 401 + X-Correlation-Id
    end

    L->>SM: Obtém JWT_SECRET (se JWT_SECRET_ARN)
    L->>L: Emite JWT HS256 (sub, tipo, perfil, iss, aud, jti, exp=1h)
    Note over L: Sem CPF/nome/e-mail no token
    L-->>GW: 200 { accessToken, tokenType, expiresIn }
    GW-->>C: 200 + X-Correlation-Id

    C->>GW: GET /v1/ordens-servico/:id<br/>Authorization: Bearer JWT
    GW->>API: VPC Link → NLB → NodePort
    API->>API: JwtAuthGuard valida iss/aud/exp
    API->>API: OwnershipGuard (sub = clienteId)
    API->>DB: Consulta OS
    API-->>GW: 200 ou 403
    GW-->>C: Resposta
```

## Referências

- [contrato-auth-cpf.md](../../../tech-challenge-serverless/docs/contrato-auth-cpf.md)
- [autenticacao.md](../autenticacao.md)
- [RFC-003](../rfcs/003-autenticacao-cpf-jwt.md)
