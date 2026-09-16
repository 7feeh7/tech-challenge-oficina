-- Spec 006: integridade relacional, índices compostos e constraints de domínio.

-- Remove duplicatas acidentais antes das unicidades nas tabelas de junção.
DELETE FROM "ordens_servico_servicos" AS a
USING "ordens_servico_servicos" AS b
WHERE a."id" > b."id"
  AND a."ordem_servico_id" = b."ordem_servico_id"
  AND a."servico_id" = b."servico_id";

DELETE FROM "ordens_servico_pecas" AS a
USING "ordens_servico_pecas" AS b
WHERE a."id" > b."id"
  AND a."ordem_servico_id" = b."ordem_servico_id"
  AND a."peca_id" = b."peca_id";

-- CreateIndex
CREATE INDEX "ordens_servico_status_criado_em_idx" ON "ordens_servico"("status", "criado_em");

-- CreateIndex
CREATE INDEX "ordens_servico_criado_em_idx" ON "ordens_servico"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_servicos_ordem_servico_id_servico_id_key" ON "ordens_servico_servicos"("ordem_servico_id", "servico_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_pecas_ordem_servico_id_peca_id_key" ON "ordens_servico_pecas"("ordem_servico_id", "peca_id");

-- CreateIndex
CREATE INDEX "orcamentos_ordem_servico_id_status_idx" ON "orcamentos"("ordem_servico_id", "status");

-- CreateIndex
CREATE INDEX "historico_status_os_ordem_servico_id_criado_em_idx" ON "historico_status_os"("ordem_servico_id", "criado_em");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_peca_id_criado_em_idx" ON "movimentacoes_estoque"("peca_id", "criado_em");

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_ordem_servico_id_fkey" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Check constraints (domínio; complementam validações da aplicação)
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_preco_base_nonneg" CHECK ("preco_base" >= 0);
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_tempo_estimado_pos" CHECK ("tempo_estimado_min" > 0);

ALTER TABLE "pecas" ADD CONSTRAINT "pecas_preco_unitario_nonneg" CHECK ("preco_unitario" >= 0);
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_quantidade_estoque_nonneg" CHECK ("quantidade_estoque" >= 0);
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_estoque_minimo_nonneg" CHECK ("estoque_minimo" >= 0);

ALTER TABLE "ordens_servico_servicos" ADD CONSTRAINT "oss_quantidade_pos" CHECK ("quantidade" >= 1);
ALTER TABLE "ordens_servico_servicos" ADD CONSTRAINT "oss_preco_unitario_nonneg" CHECK ("preco_unitario" >= 0);

ALTER TABLE "ordens_servico_pecas" ADD CONSTRAINT "osp_quantidade_pos" CHECK ("quantidade" >= 1);
ALTER TABLE "ordens_servico_pecas" ADD CONSTRAINT "osp_preco_unitario_nonneg" CHECK ("preco_unitario" >= 0);

ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_valor_total_nonneg" CHECK ("valor_total" >= 0);

ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "mov_quantidade_pos" CHECK ("quantidade" > 0);
