-- CreateTable
CREATE TABLE "outbox_mensagens" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "correlation_id" UUID NOT NULL,
    "destino" TEXT NOT NULL,
    "bloqueado_ate" TIMESTAMP(3),
    "token_reivindicacao" UUID,
    "enviado_em" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_processadas" (
    "event_id" UUID NOT NULL,
    "hash_conteudo" TEXT NOT NULL,
    "processado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_processadas_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_mensagens_event_id_key" ON "outbox_mensagens"("event_id");

-- CreateIndex
CREATE INDEX "outbox_mensagens_enviado_em_bloqueado_ate_idx" ON "outbox_mensagens"("enviado_em", "bloqueado_ate");