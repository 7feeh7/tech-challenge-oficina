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

# Pior caso do lote do consumidor com erro permanente (docs/tempos-processadores-os.md):
# 3 mensagens x (2 execuções da transação de 20 s + 45 s de envio à DLQ + 45 s de
# confirmação) = 390 s, contados do recebimento. O mínimo de 420 s soma 30 s de margem
# a esse valor; o padrão de 600 s deixa 210 s de folga. Recalcule antes de reduzir ou de
# aumentar lote e prazos.
variable "sqs_visibility_timeout_seconds" {
  type        = number
  description = "Visibilidade da os-in: maior que o pior caso de processamento de um lote do consumidor (390 s com erro permanente)"
  default     = 600

  validation {
    condition     = var.sqs_visibility_timeout_seconds >= 420 && var.sqs_visibility_timeout_seconds <= 43200
    error_message = "A visibilidade deve ficar entre 420 s (390 s do pior caso + 30 s de margem) e 43200 s (máximo do SQS)."
  }
}
