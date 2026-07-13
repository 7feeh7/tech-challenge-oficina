import { Orcamento } from '../../domain/entities/orcamento.entity';
import { OrdemDoOrcamentoNaoEncontradaError } from '../../domain/errors/orcamento.errors';
import {
  OrcamentoOutput,
  OrcamentoOutputMapper,
} from '../mappers/orcamento-output.mapper';
import { OrcamentoGateway } from '../ports/orcamento.gateway';

export interface CriarOrcamentoInput {
  ordemServicoId: string;
  valorTotal: number;
  observacoes?: string;
}

export class CriarOrcamentoUseCase {
  constructor(private readonly orcamentos: OrcamentoGateway) {}

  async execute(input: CriarOrcamentoInput): Promise<OrcamentoOutput> {
    const ordem = await this.orcamentos.buscarOrdemComPecas(
      input.ordemServicoId,
    );
    if (!ordem) {
      throw new OrdemDoOrcamentoNaoEncontradaError(input.ordemServicoId);
    }

    const orcamento = new Orcamento(input);

    return OrcamentoOutputMapper.toOutput(
      await this.orcamentos.criarEEnviarParaAprovacao(orcamento),
    );
  }
}
