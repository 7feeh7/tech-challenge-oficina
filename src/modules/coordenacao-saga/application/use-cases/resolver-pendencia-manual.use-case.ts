import { randomUUID } from 'crypto';
import type {
  ContextoTransacao,
  UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { obterInstanteBanco } from '@/shared/database/obter-instante-banco';
import { PrismaService } from '@/shared/database/prisma.service';
import { IdempotencyService } from '@/shared/idempotency/idempotency.service';
import type { RetomadaSagaInventarioPort } from '@/shared/saga/retomada-saga-inventario.port';
import { TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import type { ReservaEstoqueGateway } from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { ehP2002Idempotencia } from '@/modules/rotas-internas/application/tratar-erro-prisma-interno';
import { PendenciaNaoEncontradaError } from '../../domain/errors/pendencia.errors';
import {
  decidirResolucaoManual,
  divergenciasDaPendencia,
} from '../../domain/resolucao-manual-pendencia';
import type { PendenciaOsGateway } from '../ports/pendencia-os.gateway';

export const SCOPE_RESOLUCAO_MANUAL_PENDENCIA = 'os.pendencia.resolucao_manual';

const STATUS_HTTP_SEM_CONTEUDO = 204;

export interface ResolverPendenciaManualInput {
  ordemServicoId: string;
  pendenciaId: string;
  motivo: string;
  responsavelId: string;
  idempotencyKey: string;
}

export class ResolverPendenciaManualUseCase {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly pendencias: PendenciaOsGateway,
    private readonly reservas: ReservaEstoqueGateway,
    private readonly retomadaInventario: RetomadaSagaInventarioPort,
    private readonly unitOfWork: UnitOfWork,
    private readonly idempotency: IdempotencyService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: ResolverPendenciaManualInput): Promise<void> {
    const requestHash = this.idempotency.hashRequest({
      ordemServicoId: input.ordemServicoId,
      pendenciaId: input.pendenciaId,
      motivo: input.motivo,
    });
    const trabalho = (contexto: ContextoTransacao) =>
      this.resolver(contexto, input, requestHash);

    try {
      await this.unitOfWork.executar(trabalho);
    } catch (erro) {
      if (!ehP2002Idempotencia(erro)) {
        throw erro;
      }
      // Outra transação gravou a mesma chave depois da consulta: a repetição
      // devolve a resposta guardada ou recusa o conteúdo divergente.
      await this.unitOfWork.executar(trabalho);
    }
  }

  private async resolver(
    contexto: ContextoTransacao,
    input: ResolverPendenciaManualInput,
    requestHash: string,
  ): Promise<void> {
    const ordem = await this.ordens.bloquearParaAtualizacao(
      contexto,
      input.ordemServicoId,
    );
    if (!ordem) {
      throw new OrdemServicoNaoEncontradaError(input.ordemServicoId);
    }

    const repeticao = await this.idempotency.buscarNaTransacao(
      contexto,
      input.idempotencyKey,
      SCOPE_RESOLUCAO_MANUAL_PENDENCIA,
      requestHash,
    );
    if (repeticao) {
      return;
    }

    const pendencia = await this.pendencias.bloquearDaOrdem(
      contexto,
      input.ordemServicoId,
      input.pendenciaId,
    );
    if (!pendencia) {
      throw new PendenciaNaoEncontradaError(input.pendenciaId);
    }

    const pecasNoCatalogo = await this.pecasDivergentesNoCatalogo(
      contexto,
      pendencia.tipo,
      pendencia.detalhes,
    );
    const { caso, evidencia } = decidirResolucaoManual(
      pendencia,
      pecasNoCatalogo,
    );

    const resolvidaEm = await obterInstanteBanco(contexto, this.prisma);
    await this.pendencias.registrarResolucaoManual(contexto, {
      pendenciaId: pendencia.id,
      responsavelId: input.responsavelId,
      resolvidaEm,
      resolucaoManual: {
        motivo: input.motivo,
        responsavelId: input.responsavelId,
        resolvidaEm: resolvidaEm.toISOString(),
        caso,
        evidencia,
      },
    });

    if (pendencia.tipo === TipoPendenciaOs.INVENTARIO) {
      await this.retomadaInventario.retomarAposResolucaoInventario(
        contexto,
        input.ordemServicoId,
        randomUUID(),
      );
    }

    await this.idempotency.gravarNaTransacao(
      contexto,
      input.idempotencyKey,
      SCOPE_RESOLUCAO_MANUAL_PENDENCIA,
      requestHash,
      STATUS_HTTP_SEM_CONTEUDO,
      { pendenciaId: pendencia.id, caso },
    );
  }

  private async pecasDivergentesNoCatalogo(
    contexto: ContextoTransacao,
    tipo: TipoPendenciaOs,
    detalhes: Record<string, unknown>,
  ): Promise<string[]> {
    const divergencias = divergenciasDaPendencia(detalhes);
    if (tipo !== TipoPendenciaOs.INVENTARIO || divergencias.length === 0) {
      return [];
    }
    return this.reservas.listarPecasDivergentesNoCatalogo(
      contexto,
      divergencias,
    );
  }
}
