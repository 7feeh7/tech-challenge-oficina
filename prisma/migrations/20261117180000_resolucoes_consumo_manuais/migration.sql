-- Complemento E42: resolução administrativa de consumo (D2.18, aditiva)

CREATE TABLE "resolucoes_consumo_manuais" (
  "id" UUID NOT NULL,
  "ordem_servico_id" UUID NOT NULL,
  "rodada" INTEGER NOT NULL,
  "pendencia_id" UUID NOT NULL,
  "itens_consumidos" JSONB NOT NULL,
  "itens_liberados" JSONB NOT NULL,
  "motivo" VARCHAR(500) NOT NULL,
  "responsavel_id" UUID NOT NULL,
  "resolvido_em" TIMESTAMP(3) NOT NULL,
  "fato_tardio_event_id" UUID,
  "fato_tardio_recebido_em" TIMESTAMP(3),
  "fato_tardio_conteudo" JSONB,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "resolucoes_consumo_manuais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resolucoes_consumo_manuais_ordem_rodada_key"
  ON "resolucoes_consumo_manuais"("ordem_servico_id", "rodada");

CREATE UNIQUE INDEX "resolucoes_consumo_manuais_pendencia_id_key"
  ON "resolucoes_consumo_manuais"("pendencia_id");

ALTER TABLE "resolucoes_consumo_manuais"
  ADD CONSTRAINT "resolucoes_consumo_manuais_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resolucoes_consumo_manuais"
  ADD CONSTRAINT "resolucoes_consumo_manuais_pendencia_id_fkey"
  FOREIGN KEY ("pendencia_id") REFERENCES "pendencias_os"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;