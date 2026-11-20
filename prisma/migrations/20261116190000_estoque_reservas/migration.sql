-- E26: quantidade reservada, reservas por OS/rodada/peça, pendências de inventário (D1.14, D2.20, D4.8)

ALTER TABLE "pecas"
  ADD COLUMN "quantidade_reservada" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "pecas"
  ADD CONSTRAINT "pecas_quantidade_reservada_nonneg"
  CHECK ("quantidade_reservada" >= 0);

ALTER TABLE "pecas"
  ADD CONSTRAINT "pecas_fisico_gte_reservado"
  CHECK ("quantidade_estoque" >= "quantidade_reservada");

CREATE TYPE "SituacaoReservaEstoque" AS ENUM ('ATIVA', 'LIBERADA', 'CONSUMIDA');

CREATE TABLE "reservas_estoque" (
  "id" UUID NOT NULL,
  "grupo_reserva_id" UUID NOT NULL,
  "ordem_servico_id" UUID NOT NULL,
  "rodada" INTEGER NOT NULL,
  "peca_id" UUID NOT NULL,
  "quantidade" INTEGER NOT NULL,
  "quantidade_consumida" INTEGER NOT NULL DEFAULT 0,
  "situacao" "SituacaoReservaEstoque" NOT NULL DEFAULT 'ATIVA',
  "prazo_referencia" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reservas_estoque_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reservas_estoque"
  ADD CONSTRAINT "reservas_estoque_quantidade_positiva" CHECK ("quantidade" > 0);

ALTER TABLE "reservas_estoque"
  ADD CONSTRAINT "reservas_estoque_consumida_valida"
  CHECK ("quantidade_consumida" >= 0 AND "quantidade_consumida" <= "quantidade");

CREATE UNIQUE INDEX "reservas_estoque_ordem_rodada_peca_key"
  ON "reservas_estoque"("ordem_servico_id", "rodada", "peca_id");

CREATE INDEX "reservas_estoque_grupo_reserva_id_idx" ON "reservas_estoque"("grupo_reserva_id");
CREATE INDEX "reservas_estoque_ordem_servico_id_idx" ON "reservas_estoque"("ordem_servico_id");
CREATE INDEX "reservas_estoque_peca_id_idx" ON "reservas_estoque"("peca_id");

ALTER TABLE "reservas_estoque"
  ADD CONSTRAINT "reservas_estoque_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservas_estoque"
  ADD CONSTRAINT "reservas_estoque_peca_id_fkey"
  FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "TipoPendenciaOs" AS ENUM ('INVENTARIO');

CREATE TABLE "pendencias_os" (
  "id" UUID NOT NULL,
  "ordem_servico_id" UUID NOT NULL,
  "rodada" INTEGER NOT NULL,
  "tipo" "TipoPendenciaOs" NOT NULL,
  "resolvida" BOOLEAN NOT NULL DEFAULT false,
  "detalhes" JSONB NOT NULL,
  "resolvida_em" TIMESTAMP(3),
  "resolvida_por_id" UUID,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pendencias_os_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pendencias_os_ordem_resolvida_idx"
  ON "pendencias_os"("ordem_servico_id", "resolvida");

ALTER TABLE "pendencias_os"
  ADD CONSTRAINT "pendencias_os_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ajustes_estoque_administrativos" (
  "id" UUID NOT NULL,
  "peca_id" UUID NOT NULL,
  "ordem_servico_id" UUID,
  "pendencia_id" UUID,
  "quantidade_fisica_anterior" INTEGER NOT NULL,
  "quantidade_fisica_nova" INTEGER NOT NULL,
  "motivo" VARCHAR(500) NOT NULL,
  "responsavel_id" UUID NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ajustes_estoque_administrativos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ajustes_estoque_administrativos"
  ADD CONSTRAINT "ajustes_estoque_administrativos_peca_id_fkey"
  FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ajustes_estoque_administrativos"
  ADD CONSTRAINT "ajustes_estoque_administrativos_pendencia_id_fkey"
  FOREIGN KEY ("pendencia_id") REFERENCES "pendencias_os"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ajustes_estoque_administrativos_peca_id_idx"
  ON "ajustes_estoque_administrativos"("peca_id");