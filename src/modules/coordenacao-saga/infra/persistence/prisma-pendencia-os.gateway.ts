import { Injectable } from '@nestjs/common';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { Prisma } from '@/shared/generated/prisma/client';
import type {
  PendenciaOsBloqueada,
  PendenciaOsGateway,
  RegistroResolucaoManual,
} from '../../application/ports/pendencia-os.gateway';

@Injectable()
export class PrismaPendenciaOsGateway implements PendenciaOsGateway {
  constructor(private readonly prisma: PrismaService) {}

  async bloquearDaOrdem(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    pendenciaId: string,
  ): Promise<PendenciaOsBloqueada | null> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const bloqueadas = await cliente.$queryRaw<{ id: string }[]>`
      SELECT id FROM pendencias_os
      WHERE id = ${pendenciaId}::uuid
        AND ordem_servico_id = ${ordemServicoId}::uuid
      FOR UPDATE
    `;
    if (bloqueadas.length === 0) {
      return null;
    }
    // Relida depois do bloqueio: lê o estado commitado pela transação que
    // resolveu a pendência antes desta.
    const pendencia = await cliente.pendenciaOs.findUnique({
      where: { id: pendenciaId },
    });
    if (!pendencia) {
      return null;
    }
    return {
      id: pendencia.id,
      ordemServicoId: pendencia.ordemServicoId,
      tipo: pendencia.tipo,
      resolvida: pendencia.resolvida,
      detalhes: pendencia.detalhes as Record<string, unknown>,
    };
  }

  async registrarResolucaoManual(
    contexto: ContextoTransacao,
    registro: RegistroResolucaoManual,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const pendencia = await cliente.pendenciaOs.findUniqueOrThrow({
      where: { id: registro.pendenciaId },
      select: { detalhes: true },
    });
    await cliente.pendenciaOs.update({
      where: { id: registro.pendenciaId },
      data: {
        resolvida: true,
        resolvidaPorId: registro.responsavelId,
        resolvidaEm: registro.resolvidaEm,
        detalhes: {
          ...(pendencia.detalhes as Record<string, unknown>),
          resolucaoManual: registro.resolucaoManual,
        } as Prisma.InputJsonObject,
      },
    });
  }
}
