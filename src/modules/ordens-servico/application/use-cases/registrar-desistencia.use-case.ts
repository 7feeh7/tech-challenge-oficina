import type { CompensacaoAvancoPort } from '@/shared/saga/compensacao-avanco.port';
import {
  OrdemServicoOutput,
  OrdemServicoOutputMapper,
} from '../mappers/ordem-servico-output.mapper';
import { MudancaOrdemServicoUseCase } from './mudanca-ordem-servico.use-case';
import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';

export interface RegistrarDesistenciaInput {
  motivo: string;
}

/**
 * Leva a OS a `EM_CANCELAMENTO` e dispara a compensação na mesma transação (E42).
 */
export class RegistrarDesistenciaUseCase extends MudancaOrdemServicoUseCase {
  constructor(
    ordens: OrdemServicoGateway,
    unitOfWork: UnitOfWork,
    transicoes: TransicaoOrdemServicoService,
    private readonly compensacao: CompensacaoAvancoPort,
  ) {
    super(ordens, unitOfWork, transicoes);
  }

  async execute(
    id: string,
    input: RegistrarDesistenciaInput,
  ): Promise<OrdemServicoOutput> {
    const resultado = await this.unitOfWork.executar(async (contexto) => {
      const transicao = await this.transicoes.aplicar(contexto, {
        ordemServicoId: id,
        aplicar: (ordem, ocorridoEm) =>
          ordem.registrarDesistencia(input.motivo, ocorridoEm),
        motivo: input.motivo.trim(),
        observacao: 'Desistência registrada',
      });
      if (transicao.mudouStatus && transicao.eventId) {
        await this.compensacao.avancarAposEntradaEmCancelamento(contexto, {
          ordemServicoId: id,
          rodada: transicao.bloqueada.ordem.rodadaVigente,
          causationId: transicao.eventId,
        });
      }
      return transicao;
    });
    await this.transicoes.registrarMetricasDaMudanca(resultado);

    const detalhe = await this.ordens.buscarDetalhePorId(id);
    if (!detalhe) {
      throw new OrdemServicoNaoEncontradaError(id);
    }
    return OrdemServicoOutputMapper.toOutput(detalhe);
  }
}
