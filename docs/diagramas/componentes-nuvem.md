# Diagrama de componentes — nuvem completa

**Versão:** 2026-09-13
**Ambiente:** `producao` (único provisionado)

```mermaid
flowchart TB
    subgraph consumidores["Consumidores (fora da AWS)"]
        WEB["Portal / App cliente"]
        INT["Funcionários / integrações"]
    end

    subgraph repo_k8s["tech-challenge-infra-kubernetes"]
        GW["API Gateway HTTP API"]
        VPC["VPC + subnets públicas/privadas"]
        NAT["NAT Gateway"]
        EKS["Amazon EKS"]
        ECR["Amazon ECR"]
        NLB["NLB interno"]
        VL["VPC Link"]
        SNS["Amazon SNS"]
        SQS["Amazon SQS"]
        DLQ["SQS DLQ"]
        CW["CloudWatch Logs"]
        DD["Datadog Agent / APM"]
        S3["S3 artefatos Lambda"]
    end

    subgraph repo_sl["tech-challenge-serverless"]
        LAuth["Lambda auth-cpf"]
        LNotif["Lambda notificacao"]
    end

    subgraph repo_app["tech-challenge"]
        API["oficina-api (NestJS pods)"]
        HPA["HorizontalPodAutoscaler"]
    end

    subgraph repo_db["tech-challenge-infra-database"]
        RDS["Amazon RDS PostgreSQL 16"]
        SM["Secrets Manager"]
    end

    subgraph externos["Serviços externos"]
        SG["SendGrid"]
        DDCloud["Datadog SaaS"]
    end

    WEB --> GW
    INT --> GW

    GW -->|"POST /auth/cpf"| LAuth
    GW -->|"VPC Link"| VL
    VL --> NLB
    NLB --> EKS
    EKS --> API
    HPA -.-> API

    LAuth --> SM
    LAuth --> RDS
    API --> RDS
    API --> SM

    API -->|"SNS publish"| SNS
    SNS --> SQS
    SQS --> LNotif
    SQS -.->|"maxReceiveCount"| DLQ
    LNotif --> SG

    ECR -.->|"pull image"| API
    S3 -.->|"ZIP deploy"| LAuth
    S3 -.-> LNotif

    GW --> CW
    API --> DD
    LAuth --> CW
    LNotif --> CW
    DD --> DDCloud
    CW -.-> DDCloud

    classDef repo fill:#f5f5f5,stroke:#333,stroke-dasharray:5 5
    class repo_k8s,repo_sl,repo_app,repo_db repo
```

## Limites de rede

| Zona    | Componentes                       | Acesso            |
| ------- | --------------------------------- | ----------------- |
| Público | API Gateway                       | Internet → HTTPS  |
| Privado | EKS nodes, Lambda (VPC), RDS      | Sem IP público    |
| NAT     | Saída para SendGrid, Datadog, ECR | Egress controlado |

## Legenda de repositório

Caixas tracejadas agrupam recursos pelo repositório Terraform/código responsável pelo deploy daquele artefato.
