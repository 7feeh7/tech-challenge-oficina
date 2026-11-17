import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';

@Injectable()
export class PrismaConsultaPrazoOrdemGateway {
  constructor(private readonly prisma: PrismaService) {}

  async reivindicarElegiveis(
    limite: number,
    posseMs: number,
  ): Promise<string[]> {
    const agora = new Date();
    const bloqueadoAte = new Date(agora.getTime() + posseMs);

    return this.prisma.$transaction(async (tx) => {
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
      await tx.ordemServico.updateMany({
        where: { id: { in: ids } },
        data: { consultaPrazoReivindicadoEm: bloqueadoAte },
      });
      return ids;
    });
  }
}
