-- CreateEnum
CREATE TYPE "PassoCompensacaoSaga" AS ENUM (
  'EXECUCAO',
  'CONSULTA_E10',
  'FINANCEIRO',
  'ESTOQUE',
  'ENCERRAMENTO',
  'CONCLUIDO'
);

CREATE TYPE "ResultadoExecucaoCompensacao" AS ENUM (
  'REPARO_NAO_INICIADO',
  'REPARO_INICIADO'
);

-- CreateTable
CREATE TABLE "estados_compensacao_os" (
  "ordem_servico_id" UUID NOT NULL,
  "rodada" INTEGER NOT NULL,
  "passo" "PassoCompensacaoSaga" NOT NULL DEFAULT 'EXECUCAO',
  "resultado_execucao" "ResultadoExecucaoCompensacao",
  "consulta_id_vigente" VARCHAR(256),
  "aguardando_resposta" BOOLEAN NOT NULL DEFAULT false,
  "reparo_iniciado_durante_cancelamento" BOOLEAN NOT NULL DEFAULT false,
  "fato_terminal_execucao" BOOLEAN NOT NULL DEFAULT false,
  "pecas_utilizadas" JSONB,
  "servicos_realizados" JSONB,
  "divergencias_execucao" JSONB,
  "condicoes_e10" JSONB,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "estados_compensacao_os_pkey" PRIMARY KEY ("ordem_servico_id")
);

ALTER TABLE "estados_compensacao_os"
  ADD CONSTRAINT "estados_compensacao_os_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;