import { createHash, randomUUID } from 'crypto';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { obterInstanteBanco } from '@/shared/database/obter-instante-banco';
import { PrismaService } from '@/shared/database/prisma.service';
import { IdempotencyService } from '@/shared/idempotency/idempotency.service';
import { SCOPE_INTERNO_RESERVA } from '@/shared/idempotency/escopos-internos';
import { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { EstoqueInsuficienteReservaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ReservarEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import {
  ehP2002Idempotencia,
  traduzirErroPrismaInterno,
} from '../tratar-erro-prisma-interno';
import {
  recusarIdempotenciaSeCancelada,
  validarRodadaEVidaOs,
} from '../validar-os-interna';
import { EstadoIncompativelInternaError } from '../../domain/erros-internos';

const MS_POR_MINUTO = 60_000;

export interface ReservarOsInternoInput {
  ordemServicoId: string;
  rodada: number;
  orcamentoId: string;
  idempotencyKey: string;
}

export interface ReservarOsInternoOutput {
  reservaId: string;
  prazoReferencia: string;
}

export class ReservarOsInternoUseCase {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly unitOfWork: UnitOfWork,
    private readonly transicoes: TransicaoOrdemServicoService,
    private readonly reservarEstoque: ReservarEstoqueUseCase,
    private readonly idempotency: IdempotencyService,
    private readonly prisma: PrismaService,
    private readonly prazoReservaMinutos: number,
  ) {}

  async execute(
    input: ReservarOsInternoInput,
  ): Promise<ReservarOsInternoOutput> {
    const requestHash = this.hashCorpo(input);

    const trabalho = () =>
      this.unitOfWork.executar(async (contexto) => {
        const bloqueada = await this.ordens.bloquearParaAtualizacao(
          contexto,
          input.ordemServicoId,
        );
        if (!bloqueada) {
          throw new OrdemServicoNaoEncontradaError(input.ordemServicoId);
        }

        const replay = await this.idempotency.buscarNaTransacao(
          contexto,
          input.idempotencyKey,
          SCOPE_INTERNO_RESERVA,
          requestHash,
        );
        if (replay) {
          recusarIdempotenciaSeCancelada(bloqueada.ordem);
          return replay.body as ReservarOsInternoOutput;
        }

        validarRodadaEVidaOs(bloqueada.ordem, input.rodada);
        if (bloqueada.ordem.status !== StatusOS.AGUARDANDO_APROVACAO) {
          throw new EstadoIncompativelInternaError(
            'O status atual da OS não permite a reserva.',
            bloqueada.ordem.status,
          );
        }

        const agora = await obterInstanteBanco(contexto, this.prisma);
        const prazoReferencia = new Date(
          agora.getTime() + this.prazoReservaMinutos * MS_POR_MINUTO,
        );
        const itensReserva = bloqueada.ordem.pecas.map((p) => ({
          pecaId: p.pecaId,
          quantidade: p.quantidade,
        }));
        let grupoReservaId: string;
        if (itensReserva.length === 0) {
          grupoReservaId = randomUUID();
        } else {
          try {
            const reserva = await this.reservarEstoque.execute(
              {
                ordemServicoId: input.ordemServicoId,
                rodada: input.rodada,
                itens: itensReserva,
                prazoReferencia,
                idempotencyKey: `estoque:${input.idempotencyKey}`,
              },
              contexto,
            );
            grupoReservaId = reserva.grupoReservaId;
          } catch (erro) {
            traduzirErroPrismaInterno(erro);
          }
        }

        await this.transicoes.aplicar(contexto, {
          ordemServicoId: input.ordemServicoId,
          aplicar: (os, ocorridoEm) =>
            os.registrarReservaConfirmada(prazoReferencia, ocorridoEm),
          observacao: 'Reserva confirmada pela rota interna',
          ocorridoEm: agora,
        });

        const output: ReservarOsInternoOutput = {
          reservaId: grupoReservaId,
          prazoReferencia: prazoReferencia.toISOString(),
        };

        await this.idempotency.gravarNaTransacao(
          contexto,
          input.idempotencyKey,
          SCOPE_INTERNO_RESERVA,
          requestHash,
          200,
          output,
        );

        return output;
      });

    try {
      return await trabalho();
    } catch (erro) {
      if (erro instanceof EstoqueInsuficienteReservaError) {
        throw erro;
      }
      if (ehP2002Idempotencia(erro)) {
        const replay = await this.idempotency.findReplay(
          input.idempotencyKey,
          SCOPE_INTERNO_RESERVA,
          requestHash,
        );
        if (replay) {
          const detalhe = await this.ordens.buscarPorId(input.ordemServicoId);
          if (detalhe) {
            recusarIdempotenciaSeCancelada(detalhe);
          }
          return replay.body as ReservarOsInternoOutput;
        }
      }
      traduzirErroPrismaInterno(erro);
    }
  }

  private hashCorpo(input: ReservarOsInternoInput): string {
    const { idempotencyKey, ...corpo } = input;
    void idempotencyKey;
    return createHash('sha256').update(JSON.stringify(corpo)).digest('hex');
  }
}
