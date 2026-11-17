-- E29: pedidos emitidos e projeção financeira mínima (D4.2, D3.8)

CREATE TYPE "TipoPedidoSaga" AS ENUM (
  'INICIAR_DIAGNOSTICO',
  'GERAR_ORCAMENTO',
  'INICIAR_REPARO',
  'CANCELAR_TAREFA',
  'CANCELAR_FINANCEIRO',
  'CONSULTAR_SITUACAO_FINANCEIRA'
);

CREATE TYPE "SituacaoPedidoSaga" AS ENUM ('EMITIDO', 'CONCLUIDO', 'CANCELADO');

CREATE TABLE "pedidos_emitidos" (
  "id" UUID NOT NULL,
  "ordem_servico_id" UUID NOT NULL,
  "rodada" INTEGER NOT NULL,
  "tipo" "TipoPedidoSaga" NOT NULL,
  "destino" VARCHAR(64) NOT NULL,
  "event_id" UUID NOT NULL,
  "situacao" "SituacaoPedidoSaga" NOT NULL DEFAULT 'EMITIDO',
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pedidos_emitidos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pedidos_emitidos_event_id_key" ON "pedidos_emitidos"("event_id");
CREATE INDEX "pedidos_emitidos_ordem_rodada_tipo_idx"
  ON "pedidos_emitidos"("ordem_servico_id", "rodada", "tipo");

ALTER TABLE "pedidos_emitidos"
  ADD CONSTRAINT "pedidos_emitidos_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "TipoPendenciaOs" ADD VALUE 'FINANCEIRA';

CREATE TABLE "projecoes_financeiras_os" (
  "id" UUID NOT NULL,
  "ordem_servico_id" UUID NOT NULL,
  "rodada" INTEGER NOT NULL,
  "cobranca_id" UUID,
  "order_id" VARCHAR(128) NOT NULL,
  "valor_centavos" INTEGER,
  "event_id" UUID NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projecoes_financeiras_os_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projecoes_financeiras_os_ordem_rodada_order_key"
  ON "projecoes_financeiras_os"("ordem_servico_id", "rodada", "order_id");
CREATE INDEX "projecoes_financeiras_os_ordem_idx"
  ON "projecoes_financeiras_os"("ordem_servico_id");

ALTER TABLE "projecoes_financeiras_os"
  ADD CONSTRAINT "projecoes_financeiras_os_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;