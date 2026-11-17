-- Complemento E29: registro persistente de consumo aplicado por OS e rodada (D2.18)

CREATE TYPE "SituacaoReconciliacaoConsumo" AS ENUM (
  'APLICADO',
  'DIVERGENCIA_PENDENTE',
  'DIVERGENCIA_RESOLVIDA'
);

CREATE TYPE "TipoFatoConsumoEstoque" AS ENUM (
  'REPARO_CONCLUIDO',
  'REPARO_FALHOU',
  'REPARO_INTERROMPIDO'
);

CREATE TABLE "consumos_aplicados_os" (
  "id" UUID NOT NULL,
  "ordem_servico_id" UUID NOT NULL,
  "rodada" INTEGER NOT NULL,
  "event_id" UUID NOT NULL,
  "fato_ocorrido_em" TIMESTAMP(3) NOT NULL,
  "concluido_em" TIMESTAMP(3),
  "tipo_fato" "TipoFatoConsumoEstoque" NOT NULL,
  "responsavel_id" VARCHAR(256),
  "consumo_efetivo" JSONB NOT NULL,
  "divergencias" JSONB NOT NULL,
  "situacao_reconciliacao" "SituacaoReconciliacaoConsumo" NOT NULL,
  "aguardando_finalizacao" BOOLEAN NOT NULL DEFAULT false,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "consumos_aplicados_os_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consumos_aplicados_os_ordem_rodada_key"
  ON "consumos_aplicados_os"("ordem_servico_id", "rodada");

CREATE INDEX "consumos_aplicados_os_event_id_idx"
  ON "consumos_aplicados_os"("event_id");

ALTER TABLE "consumos_aplicados_os"
  ADD CONSTRAINT "consumos_aplicados_os_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;