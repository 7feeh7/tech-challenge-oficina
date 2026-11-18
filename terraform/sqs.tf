locals {
  # A DLQ guarda as mensagens por mais tempo que a fila para dar prazo à investigação e
  # ao reenvio; o SQS exige retenção da DLQ maior ou igual à da fila de origem.
  os_in_retention_seconds     = 345600  # 4 dias
  os_in_dlq_retention_seconds = 1209600 # 14 dias (máximo do SQS)
}

resource "aws_sqs_queue" "os_in_dlq" {
  name                      = "${local.name_prefix}-os-in-dlq"
  message_retention_seconds = local.os_in_dlq_retention_seconds
  sqs_managed_sse_enabled   = true

  tags = {
    Name = "${local.name_prefix}-os-in-dlq"
  }
}

resource "aws_sqs_queue" "os_in" {
  name                       = "${local.name_prefix}-os-in"
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds
  message_retention_seconds  = local.os_in_retention_seconds
  receive_wait_time_seconds  = 10
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.os_in_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })

  tags = {
    Name = "${local.name_prefix}-os-in"
  }
}

resource "aws_sqs_queue_policy" "os_in" {
  queue_url = aws_sqs_queue.os_in.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowBillingAndExecutionSend"
        Effect    = "Allow"
        Principal = { AWS = [local.billing_irsa_role_arn, local.execution_irsa_role_arn] }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.os_in.arn
      },
      {
        Sid       = "AllowOsServiceConsume"
        Effect    = "Allow"
        Principal = { AWS = local.os_irsa_role_arn }
        Action    = ["sqs:ReceiveMessage", "sqs:DeleteMessage"]
        Resource  = aws_sqs_queue.os_in.arn
      }
    ]
  })
}

# O consumidor do OS encaminha erros permanentes direto à DLQ, sem passar pelo redrive (E12).
resource "aws_sqs_queue_policy" "os_in_dlq" {
  queue_url = aws_sqs_queue.os_in_dlq.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowOsServiceSend"
        Effect    = "Allow"
        Principal = { AWS = local.os_irsa_role_arn }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.os_in_dlq.arn
      }
    ]
  })
}
