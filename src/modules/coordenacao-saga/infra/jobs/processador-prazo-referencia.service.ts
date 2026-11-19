import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { PrismaService } from '@/shared/database/prisma.service';
import { runWithObservabilityContext } from '@/shared/http/correlation-id.context';
import { AgendadorCicloProcessador } from '@/shared/messaging/infra/agendador-ciclo-processador';
import { ConsultaPrazoReferenciaService } from '../../application/services/consulta-prazo-referencia.service';
import { PrismaConsultaPrazoOrdemGateway } from '../persistence/prisma-consulta-prazo-ordem.gateway';

@Injectable()
export class ProcessadorPrazoReferenciaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProcessadorPrazoReferenciaService.name);
  private agendador?: AgendadorCicloProcessador;
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
      this.config.get<string>('PRAZO_REFERENCIA_VERIFICADOR_LOTE') ?? '5',
    );
    this.posseMs = Number(
      this.config.get<string>('PRAZO_REFERENCIA_REIVINDICACAO_MS') ?? '150000',
    );
  }

  onModuleInit(): void {
    if (!this.habilitado) {
      return;
    }
    this.agendador = new AgendadorCicloProcessador(
      this.intervaloMs,
      () => this.processarLote(),
      this.logger,
      'Falha no verificador de prazo de referência',
    );
    this.agendador.iniciar();
  }

  async onModuleDestroy(): Promise<void> {
    await this.agendador?.parar();
  }

  async processarLote(): Promise<void> {
    const ids = await this.reivindicacao.reivindicarElegiveis(
      this.lote,
      this.posseMs,
    );
    for (const ordemServicoId of ids) {
      await this.emitirConsultaDaOrdem(ordemServicoId);
    }
  }

  // A leitura do correlationId fica na mesma transação da emissão: cada OS usa uma
  // conexão só, o que mantém o pior caso por OS em espera por conexão + transação.
  private async emitirConsultaDaOrdem(ordemServicoId: string): Promise<void> {
    await this.unitOfWork.executar(async (contexto) => {
      const cliente = obterClienteTransacao(contexto, this.prisma);
      const meta = await cliente.ordemServico.findUnique({
        where: { id: ordemServicoId },
        select: { correlationId: true, rodadaVigente: true },
      });
      if (!meta) {
        return;
      }
      await runWithObservabilityContext(
        {
          correlationId: meta.correlationId,
          ordemServicoId,
          rodada: meta.rodadaVigente,
        },
        () =>
          this.consulta.emitirConsultaVigente(
            contexto,
            ordemServicoId,
            randomUUID(),
            false,
          ),
      );
    });
  }
}
