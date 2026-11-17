import { createHash } from 'crypto';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { obterInstanteBanco } from '@/shared/database/obter-instante-banco';
import { PrismaService } from '@/shared/database/prisma.service';
import { IdempotencyService } from '@/shared/idempotency/idempotency.service';
import { SCOPE_INTERNO_DIAGNOSTICO } from '@/shared/idempotency/escopos-internos';
import { CatalogoGateway } from '@/modules/ordens-servico/application/ports/catalogo.gateway';
import { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import {
  montarItensDiagnostico,
  type ItemDiagnosticoInput,
  type ItemOficialSaida,
} from '../montar-itens-diagnostico';
import {
  ehP2002Idempotencia,
  traduzirErroPrismaInterno,
} from '../tratar-erro-prisma-interno';
import {
  recusarIdempotenciaSeCancelada,
  validarRodadaEVidaOs,
} from '../validar-os-interna';
import { EstadoIncompativelInternaError } from '../../domain/erros-internos';

export interface ConcluirDiagnosticoInternoInput {
  ordemServicoId: string;
  rodada: number;
  tarefaId: string;
  laudo: string;
  itens: ItemDiagnosticoInput[];
  idempotencyKey: string;
}

export interface ConcluirDiagnosticoInternoOutput {
  rodada: number;
  itensOficiais: ItemOficialSaida[];
}

export class ConcluirDiagnosticoInternoUseCase {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly catalogo: CatalogoGateway,
    private readonly unitOfWork: UnitOfWork,
    private readonly transicoes: TransicaoOrdemServicoService,
    private readonly idempotency: IdempotencyService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    input: ConcluirDiagnosticoInternoInput,
  ): Promise<ConcluirDiagnosticoInternoOutput> {
    const requestHash = this.hashCorpo(input);

    const trabalho = async () =>
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
          SCOPE_INTERNO_DIAGNOSTICO,
          requestHash,
        );
        if (replay) {
          recusarIdempotenciaSeCancelada(bloqueada.ordem);
          return replay.body as ConcluirDiagnosticoInternoOutput;
        }

        validarRodadaEVidaOs(bloqueada.ordem, input.rodada);
        if (
          bloqueada.ordem.status !== StatusOS.EM_DIAGNOSTICO ||
          bloqueada.ordem.diagnosticoConcluidoEm
        ) {
          throw new EstadoIncompativelInternaError(
            'O status atual da OS não permite a conclusão do diagnóstico.',
            bloqueada.ordem.status,
          );
        }

        const montados = await montarItensDiagnostico(
          bloqueada.ordem,
          this.catalogo,
          input.itens,
        );
        const ocorridoEm = await obterInstanteBanco(contexto, this.prisma);
        bloqueada.ordem.substituirItensOficiais(
          montados.servicos,
          montados.pecas,
        );
        bloqueada.ordem.concluirDiagnostico(input.laudo, ocorridoEm);

        await this.ordens.salvar(contexto, bloqueada.ordem, undefined);

        await this.transicoes.registrarGerarOrcamentoNaOutbox(
          contexto,
          bloqueada,
          null,
          montados.itensGerarOrcamento,
        );

        const output: ConcluirDiagnosticoInternoOutput = {
          rodada: bloqueada.ordem.rodadaVigente,
          itensOficiais: montados.saida,
        };

        await this.idempotency.gravarNaTransacao(
          contexto,
          input.idempotencyKey,
          SCOPE_INTERNO_DIAGNOSTICO,
          requestHash,
          200,
          output,
        );

        return output;
      });

    try {
      return await trabalho();
    } catch (erro) {
      if (ehP2002Idempotencia(erro)) {
        const replay = await this.idempotency.findReplay(
          input.idempotencyKey,
          SCOPE_INTERNO_DIAGNOSTICO,
          requestHash,
        );
        if (replay) {
          const detalhe = await this.ordens.buscarPorId(input.ordemServicoId);
          if (detalhe) {
            recusarIdempotenciaSeCancelada(detalhe);
          }
          return replay.body as ConcluirDiagnosticoInternoOutput;
        }
      }
      traduzirErroPrismaInterno(erro);
    }
  }

  private hashCorpo(input: ConcluirDiagnosticoInternoInput): string {
    const { idempotencyKey, ...corpo } = input;
    void idempotencyKey;
    return createHash('sha256').update(JSON.stringify(corpo)).digest('hex');
  }
}
