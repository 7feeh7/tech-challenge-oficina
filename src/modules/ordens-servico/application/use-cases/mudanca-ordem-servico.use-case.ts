import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import {
  OrdemServicoOutput,
  OrdemServicoOutputMapper,
} from '../mappers/ordem-servico-output.mapper';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';
import {
  AplicarMudancaInput,
  TransicaoOrdemServicoService,
} from '../services/transicao-ordem-servico.service';

/**
 * Base dos casos de uso de uma só mudança na OS: uma unidade de trabalho com o
 * efeito centralizado, métricas depois do commit e a OS atualizada na resposta.
 */
export abstract class MudancaOrdemServicoUseCase {
  constructor(
    protected readonly ordens: OrdemServicoGateway,
    protected readonly unitOfWork: UnitOfWork,
    protected readonly transicoes: TransicaoOrdemServicoService,
  ) {}

  protected async aplicarMudanca(
    input: AplicarMudancaInput,
  ): Promise<OrdemServicoOutput> {
    const resultado = await this.unitOfWork.executar((contexto) =>
      this.transicoes.aplicar(contexto, input),
    );
    await this.transicoes.registrarMetricasDaMudanca(resultado);

    const detalhe = await this.ordens.buscarDetalhePorId(input.ordemServicoId);
    if (!detalhe) {
      throw new OrdemServicoNaoEncontradaError(input.ordemServicoId);
    }
    return OrdemServicoOutputMapper.toOutput(detalhe);
  }
}
