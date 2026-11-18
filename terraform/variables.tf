variable "project_name" {
  type        = string
  description = "Prefixo do projeto"
  default     = "tech-challenge"
}

variable "environment" {
  type        = string
  description = "Ambiente (producao)"
  default     = "producao"
}

variable "aws_region" {
  type        = string
  description = "Região AWS"
  default     = "us-east-1"
}

variable "sqs_max_receive_count" {
  type        = number
  description = "maxReceiveCount da fila principal"
  default     = 5

  validation {
    condition     = var.sqs_max_receive_count >= 1
    error_message = "maxReceiveCount deve ser no mínimo 1."
  }
}

# Pior caso do lote do consumidor com erro permanente (E12, complemento): 3 mensagens x
# (20 s de transação + 45 s de envio à DLQ + 45 s de confirmação) = 330 s, contados do
# recebimento. O mínimo de 360 s soma 30 s de margem a esse valor; o padrão de 600 s dá
# folga para o recálculo da E10. Recalcule antes de reduzir ou de aumentar lote e prazos.
variable "sqs_visibility_timeout_seconds" {
  type        = number
  description = "Visibilidade da os-in: maior que o pior caso de processamento de um lote do consumidor (330 s com erro permanente)"
  default     = 600

  validation {
    condition     = var.sqs_visibility_timeout_seconds >= 360 && var.sqs_visibility_timeout_seconds <= 43200
    error_message = "A visibilidade deve ficar entre 360 s (330 s do pior caso + 30 s de margem) e 43200 s (máximo do SQS)."
  }
}
