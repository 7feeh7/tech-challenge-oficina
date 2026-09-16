# Diagrama — repositório tech-challenge-serverless

**Versão:** 2026-09-13

```mermaid
flowchart TB
    subgraph triggers["Triggers"]
        GW["API Gateway POST /auth/cpf"]
        SQS["SQS fila notificacao-status"]
    end

    subgraph functions["Functions (código deste repo)"]
        AUTH["auth-cpf/handler.ts"]
        NOTIF["notificacao/handler.ts"]
    end

    subgraph shared["shared/"]
        VAL["validators/cpf"]
        JWT["services/jwt"]
        DB["services/cliente.repository"]
        LOG["logger + correlationId"]
    end

    subgraph aws["AWS (provisionado em infra-kubernetes)"]
        SM["Secrets Manager"]
        RDS["RDS PostgreSQL"]
        SG["SendGrid API"]
        S3["S3 ZIP deploy"]
    end

    GW --> AUTH
    SQS --> NOTIF
    AUTH --> VAL
    AUTH --> JWT
    AUTH --> DB --> RDS
    AUTH --> SM
    NOTIF --> SG
    NOTIF --> LOG
    S3 -.->|"update-function-code"| AUTH
    S3 -.-> NOTIF
```

Contratos: [contrato-auth-cpf.md](../../../tech-challenge-serverless/docs/contrato-auth-cpf.md), [contrato-evento-notificacao.md](../../../tech-challenge-serverless/docs/contrato-evento-notificacao.md).
