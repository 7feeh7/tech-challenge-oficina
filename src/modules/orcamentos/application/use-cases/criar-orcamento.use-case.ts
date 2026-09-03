import { NotificadorDeStatusGateway } from '@/modules/ordens-servico/application/ports/notificador-status.gateway';
import { Orcamento } from '../../domain/entities/orcamento.entity';
import {
  OrcamentoEmAbertoError,
  OrdemDoOrcamentoNaoEncontradaError,
} from '../../domain/errors/orcamento.errors';
import {
  OrcamentoOutput,
  OrcamentoOutputMapper,
} from '../mappers/orcamento-output.mapper';
import { OrcamentoGateway } from '../ports/orcamento.gateway';
import { notificarTransicao } from './notificar-transicao';

export interface CriarOrcamentoInput {
  ordemServicoId: string;
  valorTotal: number;
  observacoes?: string;
}

export class CriarOrcamentoUseCase {
  constructor(
    private readonly orcamentos: OrcamentoGateway,
    private readonly notificador: NotificadorDeStatusGateway,
  ) {}

  async execute(input: CriarOrcamentoInput): Promise<OrcamentoOutput> {
    const ordem = await this.orcamentos.buscarOrdemComPecas(
      input.ordemServicoId,
    );
    if (!ordem) {
      throw new OrdemDoOrcamentoNaoEncontradaError(input.ordemServicoId);
    }

    const jaTemProposta =
      await this.orcamentos.existeOrcamentoAguardandoAprovacao(
        input.ordemServicoId,
      );
    if (jaTemProposta) {
      throw new OrcamentoEmAbertoError(input.ordemServicoId);
    }

    const orcamento = new Orcamento(input);

    const resultado =
      await this.orcamentos.criarEEnviarParaAprovacao(orcamento);
    console.log('chegou aqui');

    await notificarTransicao(this.notificador, resultado.transicao);

    return OrcamentoOutputMapper.toOutput(resultado.orcamento);
  }
}
