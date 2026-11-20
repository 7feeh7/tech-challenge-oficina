ALTER TABLE "ordens_servico"
  ADD COLUMN "consulta_prazo_tentativa" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "consulta_prazo_proxima_em" TIMESTAMP(3),
  ADD COLUMN "consulta_prazo_reivindicado_em" TIMESTAMP(3);

CREATE INDEX "ordens_servico_consulta_prazo_idx"
  ON "ordens_servico" ("status", "prazo_referencia_reserva", "consulta_prazo_proxima_em");

ALTER TABLE "projecoes_financeiras_os"
  ADD COLUMN "natureza" VARCHAR(16) NOT NULL DEFAULT 'PAGAMENTO',
  ADD COLUMN "orcamento_id" UUID,
  ADD COLUMN "link_pagamento" VARCHAR(2048);

CREATE UNIQUE INDEX "projecoes_financeiras_os_orcamento_rodada_key"
  ON "projecoes_financeiras_os" ("ordem_servico_id", "rodada", "orcamento_id")
  WHERE "orcamento_id" IS NOT NULL;