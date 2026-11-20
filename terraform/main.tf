terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

data "aws_caller_identity" "current" {}

# Os nomes das IRSAs são definidos pelo infra-kubernetes (E06). Os ARNs são montados
# por convenção para que este stack não dependa do apply de outro repositório (D6.2).
locals {
  name_prefix             = "${var.project_name}-${var.environment}"
  irsa_role_arn_prefix    = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}"
  os_irsa_role_arn        = "${local.irsa_role_arn_prefix}-os-service"
  billing_irsa_role_arn   = "${local.irsa_role_arn_prefix}-billing-service"
  execution_irsa_role_arn = "${local.irsa_role_arn_prefix}-execution-service"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "tech-challenge-oficina"
    }
  }
}
