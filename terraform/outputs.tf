output "os_in_queue_name" {
  description = "Nome da fila de entrada do OS"
  value       = aws_sqs_queue.os_in.name
}

output "os_in_queue_arn" {
  description = "ARN da fila de entrada do OS"
  value       = aws_sqs_queue.os_in.arn
}

output "os_in_queue_url" {
  description = "URL da fila de entrada do OS"
  value       = aws_sqs_queue.os_in.url
}

output "os_in_dlq_name" {
  description = "Nome da DLQ da fila de entrada do OS"
  value       = aws_sqs_queue.os_in_dlq.name
}

output "os_in_dlq_arn" {
  description = "ARN da DLQ da fila de entrada do OS"
  value       = aws_sqs_queue.os_in_dlq.arn
}

output "os_in_dlq_url" {
  description = "URL da DLQ da fila de entrada do OS"
  value       = aws_sqs_queue.os_in_dlq.url
}
