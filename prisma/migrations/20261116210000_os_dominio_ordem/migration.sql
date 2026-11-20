-- E27: domínio da ordem de serviço — rodada, prioridade, correlationId, sugestões e histórico (D2.27, D3.9, D2.22)

CREATE TYPE "TipoSugestaoItemOs" AS ENUM ('PECA', 'SERVICO');

ALTER TABLE "ordens_servico"
  ADD COLUMN "rodada_vigente" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "prioridade_fila" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "correlation_id" UUID,
  ADD COLUMN "diagnostico_concluido_em" TIMESTAMP(3),
  ADD COLUMN "etapa_origem_cancelamento" "StatusOS",
  ADD COLUMN "motivo_encerramento" TEXT,
  ADD COLUMN "veiculo_liberado_retirada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "devolvida_em" TIMESTAMP(3),
  ADD COLUMN "prazo_referencia_reserva" TIMESTAMP(3);

UPDATE "ordens_servico"
SET "correlation_id" = gen_random_uuid()
WHERE "correlation_id" IS NULL;

ALTER TABLE "ordens_servico"
  ALTER COLUMN "correlation_id" SET NOT NULL;

UPDATE "ordens_servico" AS os
SET "prioridade_fila" = CASE os.status::text
  WHEN 'EM_EXECUCAO' THEN 1
  WHEN 'AGUARDANDO_EXECUCAO' THEN 2
  WHEN 'AGUARDANDO_PAGAMENTO' THEN 3
  WHEN 'AGUARDANDO_APROVACAO' THEN 4
  WHEN 'EM_DIAGNOSTICO' THEN 5
  WHEN 'RECEBIDA' THEN 6
  WHEN 'EM_CANCELAMENTO' THEN 7
  WHEN 'FINALIZADA' THEN 900
  WHEN 'CANCELADA' THEN 901
  WHEN 'ENTREGUE' THEN 902
  ELSE 6
END;

CREATE TABLE "sugestoes_itens_os" (
  "id" UUID NOT NULL,
  "ordem_servico_id" UUID NOT NULL,
  "tipo" "TipoSugestaoItemOs" NOT NULL,
  "item_id" UUID NOT NULL,
  "quantidade" INTEGER NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sugestoes_itens_os_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sugestoes_itens_os"
  ADD CONSTRAINT "sugestoes_itens_os_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "sugestoes_itens_os_ordem_servico_id_tipo_item_id_key"
  ON "sugestoes_itens_os"("ordem_servico_id", "tipo", "item_id");

CREATE INDEX "sugestoes_itens_os_ordem_servico_id_idx"
  ON "sugestoes_itens_os"("ordem_servico_id");

ALTER TABLE "historico_status_os"
  ADD COLUMN "event_id" UUID,
  ADD COLUMN "rodada" INTEGER,
  ADD COLUMN "ocorrido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "motivo" TEXT;

UPDATE "historico_status_os"
SET "ocorrido_em" = "criado_em",
    "rodada" = 1;

ALTER TABLE "ordens_servico"
  ADD CONSTRAINT "ordens_servico_rodada_vigente_positiva"
  CHECK ("rodada_vigente" >= 1);

ALTER TABLE "sugestoes_itens_os"
  ADD CONSTRAINT "sugestoes_itens_os_quantidade_positiva"
  CHECK ("quantidade" > 0);

CREATE INDEX "ordens_servico_prioridade_fila_criado_em_idx"
  ON "ordens_servico"("prioridade_fila", "criado_em");

DROP INDEX IF EXISTS "ordens_servico_status_criado_em_idx";