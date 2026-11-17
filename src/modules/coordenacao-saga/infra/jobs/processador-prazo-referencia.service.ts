import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { PrismaService } from '@/shared/database/prisma.service';
import { runWithObservabilityContext } from '@/shared/http/correlation-id.context';
import { ConsultaPrazoReferenciaService } from '../../application/services/consulta-prazo-referencia.service';
import { PrismaConsultaPrazoOrdemGateway } from '../persistence/prisma-consulta-prazo-ordem.gateway';

@Injectable()
export class ProcessadorPrazoReferenciaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProcessadorPrazoReferenciaService.name);
  private intervalo?: NodeJS.Timeout;
  private readonly habilitado: boolean;
  private readonly intervaloMs: number;
  private readonly lote: number;
  private readonly posseMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly reivindicacao: PrismaConsultaPrazoOrdemGateway,
    private readonly consulta: ConsultaPrazoReferenciaService,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly prisma: PrismaService,
  ) {
    this.habilitado =
      this.config.get<string>('PRAZO_REFERENCIA_VERIFICADOR_HABILITADO') ===
      'true';
    this.intervaloMs = Number(
      this.config.get<string>('PRAZO_REFERENCIA_VERIFICADOR_INTERVAL_MS') ??
        '10000',
    );
    this.lote = Number(
      this.config.get<string>('PRAZO_REFERENCIA_VERIFICADOR_LOTE') ?? '10',
    );
    this.posseMs = Number(
      this.config.get<string>('PRAZO_REFERENCIA_REIVINDICACAO_MS') ?? '60000',
    );
  }

  onModuleInit(): void {
    if (!this.habilitado) {
      return;
    }
    this.intervalo = setInterval(() => {
      void this.processarLote().catch((erro) =>
        this.logger.error('Falha no verificador de prazo de referência', erro),
      );
    }, this.intervaloMs);
  }

  onModuleDestroy(): void {
    if (this.intervalo) {
      clearInterval(this.intervalo);
    }
  }

  async processarLote(): Promise<void> {
    const ids = await this.reivindicacao.reivindicarElegiveis(
      this.lote,
      this.posseMs,
    );
    for (const ordemServicoId of ids) {
      const meta = await this.prisma.ordemServico.findUnique({
        where: { id: ordemServicoId },
        select: { correlationId: true, rodadaVigente: true },
      });
      if (!meta) {
        continue;
      }
      await runWithObservabilityContext(
        {
          correlationId: meta.correlationId,
          ordemServicoId,
          rodada: meta.rodadaVigente,
        },
        async () => {
          await this.unitOfWork.executar(async (contexto) => {
            await this.consulta.emitirConsultaVigente(
              contexto,
              ordemServicoId,
              randomUUID(),
              false,
            );
          });
        },
      );
    }
  }
}
