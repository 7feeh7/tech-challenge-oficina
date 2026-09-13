-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "auditoria_cliente_status" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "ativo_anterior" BOOLEAN NOT NULL,
    "ativo_novo" BOOLEAN NOT NULL,
    "alterado_por_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_cliente_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_cliente_status_cliente_id_idx" ON "auditoria_cliente_status"("cliente_id");

-- AddForeignKey
ALTER TABLE "auditoria_cliente_status" ADD CONSTRAINT "auditoria_cliente_status_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
