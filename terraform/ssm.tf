locals {
  ssm_prefix = "/tech-challenge/${var.environment}"
}

# Lido pelos pipelines de Billing e Execution (SQS_OS_IN_URL).
resource "aws_ssm_parameter" "os_in_queue_url" {
  name        = "${local.ssm_prefix}/infra/os_in_queue_url"
  type        = "String"
  description = "URL da fila de entrada do OS (os-in)."
  value       = aws_sqs_queue.os_in.url
}

# Lido pelo pipeline do OS (SQS_OS_IN_DLQ_URL).
resource "aws_ssm_parameter" "os_in_dlq_url" {
  name        = "${local.ssm_prefix}/infra/os_in_dlq_url"
  type        = "String"
  description = "URL da DLQ da fila de entrada do OS (os-in-dlq)."
  value       = aws_sqs_queue.os_in_dlq.url
}
