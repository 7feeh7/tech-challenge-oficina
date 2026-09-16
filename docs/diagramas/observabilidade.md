# Diagrama de Observabilidade

```mermaid
flowchart LR
  subgraph Borda
    GW[API Gateway]
  end

  subgraph EKS
    API[oficina-api\nNestJS + dd-trace]
    AGENT[Datadog Agent\nHelm]
    CA[Cluster Agent]
  end

  subgraph Mensageria
    SNS[SNS]
    SQS[SQS]
    DLQ[DLQ]
  end

  subgraph Serverless
    LAMBDA[Lambda notificacao]
    AUTH[Lambda auth-cpf]
  end

  subgraph Externos
    PG[(PostgreSQL RDS)]
    SG[SendGrid]
    SM[Secrets Manager]
  end

  subgraph Datadog
    LOGS[Logs]
    APM[Traces]
    MET[Metrics]
    DASH[Dashboards]
    MON[Monitors]
  end

  GW -->|HTTP + X-Correlation-Id| API
  GW --> AUTH
  API --> PG
  API --> SNS
  SNS --> SQS --> LAMBDA
  SQS --> DLQ
  LAMBDA --> SG
  LAMBDA --> SM
  AUTH --> PG
  AUTH --> SM

  API -->|JSON logs + DogStatsD + APM| AGENT
  LAMBDA -->|logs + X-Ray| LOGS
  AGENT --> CA
  AGENT --> LOGS
  AGENT --> APM
  AGENT --> MET
  MET --> DASH
  MET --> MON
  LOGS --> DASH
  APM --> DASH
```

## Coleta

| Fonte | Coletor | Destino Datadog |
| --- | --- | --- |
| Containers API | Agent (logs, APM, runtime) | Logs, Traces, Metrics |
| Métricas K8s | Cluster Agent | Infrastructure |
| Métricas negócio | dd-trace DogStatsD | Custom Metrics |
| Lambda | CloudWatch / extensão | Logs, AWS metrics |
| Gateway | CloudWatch access logs | Logs (opcional forward) |
