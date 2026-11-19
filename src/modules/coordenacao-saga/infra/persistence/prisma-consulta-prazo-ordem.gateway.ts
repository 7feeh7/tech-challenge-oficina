import { Injectable } from '@nestjs/common';
import { executarTransacaoComLimite } from '@/shared/database/executar-transacao-com-limite';
import { PrismaService } from '@/shared/database/prisma.service';

// Entra no pior caso da posse do verificador (docs/tempos-processadores-os.md).
export const LIMITE_REIVINDICACAO_MS = 5000;

@Injectable()
export class PrismaConsultaPrazoOrdemGateway {
  constructor(private readonly prisma: PrismaService) {}

  async reivindicarElegiveis(
    limite: number,
    posseMs: number,
  ): Promise<string[]> {
    return executarTransacaoComLimite(
      this.prisma,
      LIMITE_REIVINDICACAO_MS,
      async (tx) => {
        const linhas = await tx.$queryRaw<{ id: string }[]>`
          SELECT id
          FROM ordens_servico
          WHERE status = 'AGUARDANDO_PAGAMENTO'
            AND prazo_referencia_reserva IS NOT NULL
            AND prazo_referencia_reserva <= NOW()
            AND (
              consulta_prazo_proxima_em IS NULL
              OR consulta_prazo_proxima_em <= NOW()
            )
            AND (
              consulta_prazo_reivindicado_em IS NULL
              OR consulta_prazo_reivindicado_em < NOW()
            )
          ORDER BY prazo_referencia_reserva ASC
          LIMIT ${limite}
          FOR UPDATE SKIP LOCKED`;

        if (linhas.length === 0) {
          return [];
        }

        const ids = linhas.map((l) => l.id);
        // A posse usa o relógio do banco, o mesmo que a seleção compara com NOW(): sem
        // dependência do relógio de cada pod.
        await tx.$executeRaw`
          UPDATE ordens_servico
          SET consulta_prazo_reivindicado_em = NOW() + ${posseMs} * INTERVAL '1 millisecond'
          WHERE id = ANY(${ids}::uuid[])`;
        return ids;
      },
    );
  }
}
