terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }

  # Estado local para simplicidade da entrega academica.
  # Para uso em equipe, migre para um backend remoto (S3 + DynamoDB):
  #
  # backend "s3" {
  #   bucket         = "tech-challenge-tfstate"
  #   key            = "fase2/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "tech-challenge-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "Terraform"
      Phase     = "fase-2"
    }
  }
}

# Provider Helm autenticado no cluster EKS criado abaixo.
provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}
