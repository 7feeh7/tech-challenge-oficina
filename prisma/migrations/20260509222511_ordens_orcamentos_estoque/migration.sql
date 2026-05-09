/*
  Warnings:

  - You are about to drop the column `cpfCnpj` on the `clientes` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[cpf_cnpj]` on the table `clientes` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cpf_cnpj` to the `clientes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StatusOS" AS ENUM ('RECEBIDA', 'EM_DIAGNOSTICO', 'AGUARDANDO_APROVACAO', 'EM_EXECUCAO', 'FINALIZADA', 'ENTREGUE');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('AGUARDANDO_APROVACAO', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "TipoMovimentacaoEstoque" AS ENUM ('ENTRADA', 'BAIXA');

-- DropIndex
DROP INDEX "clientes_cpfCnpj_key";

-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "cpfCnpj",
ADD COLUMN     "cpf_cnpj" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ordens_servico" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "status" "StatusOS" NOT NULL DEFAULT 'RECEBIDA',
    "cliente_id" UUID NOT NULL,
    "veiculo_id" UUID NOT NULL,
    "descricao_problema" TEXT,
    "diagnostico" TEXT,
    "iniciada_em" TIMESTAMP(3),
    "finalizada_em" TIMESTAMP(3),
    "entregue_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordens_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens_servico_servicos" (
    "id" UUID NOT NULL,
    "ordem_servico_id" UUID NOT NULL,
    "servico_id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "preco_unitario" DECIMAL(10,2) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordens_servico_servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens_servico_pecas" (
    "id" UUID NOT NULL,
    "ordem_servico_id" UUID NOT NULL,
    "peca_id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "preco_unitario" DECIMAL(10,2) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordens_servico_pecas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL,
    "ordem_servico_id" UUID NOT NULL,
    "valor_total" DECIMAL(10,2) NOT NULL,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
    "observacoes" TEXT,
    "aprovado_em" TIMESTAMP(3),
    "rejeitado_em" TIMESTAMP(3),
    "motivo_rejeicao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_status_os" (
    "id" UUID NOT NULL,
    "ordem_servico_id" UUID NOT NULL,
    "status_anterior" "StatusOS",
    "status_novo" "StatusOS" NOT NULL,
    "alterado_por" TEXT,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_status_os_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" UUID NOT NULL,
    "peca_id" UUID NOT NULL,
    "tipo" "TipoMovimentacaoEstoque" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "ordem_servico_id" UUID,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_numero_key" ON "ordens_servico"("numero");

-- CreateIndex
CREATE INDEX "ordens_servico_cliente_id_idx" ON "ordens_servico"("cliente_id");

-- CreateIndex
CREATE INDEX "ordens_servico_veiculo_id_idx" ON "ordens_servico"("veiculo_id");

-- CreateIndex
CREATE INDEX "ordens_servico_status_idx" ON "ordens_servico"("status");

-- CreateIndex
CREATE INDEX "ordens_servico_servicos_ordem_servico_id_idx" ON "ordens_servico_servicos"("ordem_servico_id");

-- CreateIndex
CREATE INDEX "ordens_servico_pecas_ordem_servico_id_idx" ON "ordens_servico_pecas"("ordem_servico_id");

-- CreateIndex
CREATE INDEX "orcamentos_ordem_servico_id_idx" ON "orcamentos"("ordem_servico_id");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "historico_status_os_ordem_servico_id_idx" ON "historico_status_os"("ordem_servico_id");

-- CreateIndex
CREATE INDEX "historico_status_os_status_novo_idx" ON "historico_status_os"("status_novo");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_peca_id_idx" ON "movimentacoes_estoque"("peca_id");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_ordem_servico_id_idx" ON "movimentacoes_estoque"("ordem_servico_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cpf_cnpj_key" ON "clientes"("cpf_cnpj");

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "veiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico_servicos" ADD CONSTRAINT "ordens_servico_servicos_ordem_servico_id_fkey" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico_servicos" ADD CONSTRAINT "ordens_servico_servicos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico_pecas" ADD CONSTRAINT "ordens_servico_pecas_ordem_servico_id_fkey" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico_pecas" ADD CONSTRAINT "ordens_servico_pecas_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_ordem_servico_id_fkey" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status_os" ADD CONSTRAINT "historico_status_os_ordem_servico_id_fkey" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
