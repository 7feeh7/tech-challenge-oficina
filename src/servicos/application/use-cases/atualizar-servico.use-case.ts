import { Servico } from '../../domain/entities/servico.entity';
import {
  NomeServicoJaExisteError,
  ServicoNaoEncontradoError,
} from '../../domain/errors/servico.errors';
import {
  ServicoOutput,
  ServicoOutputMapper,
} from '../mappers/servico-output.mapper';
import { ServicoGateway } from '../ports/servico.gateway';

export interface AtualizarServicoInput {
  nome?: string;
  descricao?: string;
  precoBase?: number;
  tempoEstimadoMin?: number;
  ativo?: boolean;
}

export class AtualizarServicoUseCase {
  constructor(private readonly servicos: ServicoGateway) {}

  async execute(
    id: string,
    input: AtualizarServicoInput,
  ): Promise<ServicoOutput> {
    const servico = await this.servicos.buscarPorId(id);
    if (!servico) {
      throw new ServicoNaoEncontradoError(id);
    }

    await this.garantirNomeDisponivel(id, servico, input.nome);

    if (input.nome !== undefined) servico.alterarNome(input.nome);
    if (input.descricao !== undefined)
      servico.alterarDescricao(input.descricao);
    if (input.precoBase !== undefined)
      servico.alterarPrecoBase(input.precoBase);
    if (input.tempoEstimadoMin !== undefined) {
      servico.alterarTempoEstimado(input.tempoEstimadoMin);
    }
    if (input.ativo !== undefined) {
      input.ativo ? servico.ativar() : servico.desativar();
    }

    return ServicoOutputMapper.toOutput(
      await this.servicos.atualizar(id, servico),
    );
  }

  private async garantirNomeDisponivel(
    id: string,
    servico: Servico,
    nome?: string,
  ): Promise<void> {
    if (nome === undefined) return;

    const novoNome = Servico.normalizarNome(nome);
    if (novoNome === servico.nome) return;

    if (await this.servicos.nomePertenceAOutroServico(id, novoNome)) {
      throw new NomeServicoJaExisteError();
    }
  }
}
