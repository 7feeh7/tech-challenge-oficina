# Infraestrutura — Terraform (AWS)

Provisiona toda a infraestrutura da Fase 2 na AWS usando Terraform.

## Recursos criados

| Recurso | Descrição |
| --- | --- |
| **VPC** (`vpc.tf`) | Rede com 2 AZs, subnets públicas (LoadBalancer/NAT) e privadas (nodes e RDS), 1 NAT Gateway. |
| **EKS** (`eks.tf`) | Cluster Kubernetes gerenciado + managed node group (`t3.small`, 2–4 nodes) nas subnets privadas. |
| **metrics-server** (`eks.tf`) | Instalado via Helm no cluster; necessário para o **HPA** coletar métricas de CPU/memória. |
| **RDS PostgreSQL** (`rds.tf`) | Instância `db.t3.micro`, PostgreSQL 16, privada, acessível apenas pelos nodes do EKS na porta 5432. |
| **ECR** (`ecr.tf`) | Repositório da imagem Docker da API, com scan on push e retenção das 10 imagens mais recentes. |

## Pré-requisitos

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configurado (`aws configure`)
- [kubectl](https://kubernetes.io/docs/tasks/tools/) para acessar o cluster

## Como aplicar

```bash
cd infra

# 1. Crie o arquivo de variáveis a partir do exemplo
cp terraform.tfvars.example terraform.tfvars
# edite terraform.tfvars e defina db_password (ou use TF_VAR_db_password)

# 2. Inicialize os providers e módulos
terraform init

# 3. Revise o que será criado
terraform plan

# 4. Provisione a infraestrutura (leva ~15-20 min por causa do EKS/RDS)
terraform apply

# 5. Configure o kubectl para o cluster recém-criado
$(terraform output -raw kubeconfig_command)
```

## Outputs úteis

```bash
terraform output ecr_repository_url   # URL da imagem no ECR
terraform output rds_endpoint         # host:porta do banco
terraform output -raw database_url    # connection string para o Secret do k8s
terraform output -raw kubeconfig_command
```

Use `database_url` para popular o GitHub Secret `DATABASE_URL` (consumido pelo CI/CD ao criar o Secret do Kubernetes).

## Destruir a infraestrutura

> O EKS, o NAT Gateway e o RDS geram custo enquanto ligados. Rode o destroy após a demonstração/vídeo.

```bash
terraform destroy
```

## Segurança

- `terraform.tfvars` e arquivos de state estão no `.gitignore` — nunca commite senhas.
- Prefira exportar a senha via ambiente: `export TF_VAR_db_password="..."`.
- O RDS **não** é publicamente acessível; só os nodes do EKS o alcançam.
