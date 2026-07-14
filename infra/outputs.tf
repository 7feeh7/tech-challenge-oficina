output "aws_region" {
  description = "Regiao AWS utilizada."
  value       = var.aws_region
}

output "cluster_name" {
  description = "Nome do cluster EKS."
  value       = module.eks.cluster_name
}

output "ecr_repository_url" {
  description = "URL do repositorio ECR (usar no CI/CD e no deployment)."
  value       = aws_ecr_repository.api.repository_url
}

output "rds_endpoint" {
  description = "Endpoint (host:porta) do banco RDS."
  value       = aws_db_instance.postgres.endpoint
}

output "database_url" {
  description = "Connection string do Prisma para o Secret do Kubernetes."
  value       = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${var.db_name}?schema=public"
  sensitive   = true
}

output "kubeconfig_command" {
  description = "Comando para configurar o kubectl apontando para o cluster."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}
