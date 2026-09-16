# RFC-001 — Escolha da AWS como nuvem

**Status:** aceito  
**Autores:** equipe Tech Challenge  
**Revisores:** —  
**Data:** 2026-09-13  
**ADR relacionado:** — _(decisão transversal; serviços específicos têm ADRs próprias)_

## Contexto

A Fase 3 exige API Gateway, Functions serverless, Kubernetes gerenciado, banco relacional gerenciado, mensageria, observabilidade e IaC com Terraform. A equipe já operava EKS/RDS na Fase 2 neste mesmo ecossistema.

## Proposta

Adotar **Amazon Web Services (AWS)** como nuvem única da solução, região `us-east-1`, com serviços gerenciados:

- API Gateway HTTP API, Lambda, EKS, RDS, SNS/SQS, Secrets Manager, CloudWatch, ECR, S3.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| **AWS** (escolhida) | EKS/RDS/Lambda/Gateway nativos; amplo material FIAP; Terraform maduro; integração Datadog | Custo NAT/EKS; curva IAM/VPC |
| **Google Cloud (GKE + Cloud SQL + Cloud Functions)** | GKE competitivo; Cloud SQL PostgreSQL | Retrabalho Terraform; API Gateway/Functions diferentes do já implementado; menor familiaridade do time |
| **Azure (AKS + Azure Database + Functions)** | AKS sólido; PostgreSQL flexível | Mesmo retrabalho; Functions cold start e modelo de rede distintos |

### Critérios de decisão

| Critério | AWS | GCP | Azure |
| --- | --- | --- | --- |
| Conhecimento prévio (Fase 2) | Alto | Baixo | Baixo |
| Serviços gerenciados exigidos | Completo | Completo | Completo |
| Integração Terraform | Excelente | Boa | Boa |
| Custo estimado ambiente demo | ~USD 120–140/mês | Similar | Similar |
| Tempo de entrega Fase 3 | Menor (evolução) | Maior (reescrita) | Maior (reescrita) |

## Consequências

### Positivas

- Reaproveitamento de módulos Terraform e manifests Kubernetes da Fase 2.
- Documentação e runbooks alinhados ao que já foi demonstrado.
- Marketplace Datadog/SendGrid com integrações prontas.

### Negativas / trade-offs

- Vendor lock-in moderado nos serviços de mensageria e IAM.
- NAT Gateway e control plane EKS são custos fixos relevantes para demo acadêmica.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Estouro de custo | Teardown documentado; ambiente único ([ADR-001](../adrs/001-ambiente-unico-provisionado.md)) |
| Complexidade operacional | Segregação em quatro repos + SSM como contrato |

## Discussão e conclusão

GCP e Azure atenderiam requisitos funcionais, mas implicariam reescrever Gateway, mensageria, CI e manifests sem ganho proporcional ao prazo. AWS mantém continuidade técnica e reduz risco de entrega.

## Referências

- [visao-geral-nuvem.md](../local/arquitetura/visao-geral-nuvem.md)
- [infraestrutura.md](../local/arquitetura/infraestrutura.md)
- Repositórios `tech-challenge-infra-kubernetes`, `tech-challenge-infra-database`
