import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import {
  ClienteDaOrdemNaoEncontradoError,
  VeiculoDaOrdemNaoEncontradoError,
  VeiculoNaoPertenceAoClienteError,
} from '../../domain/errors/ordem-servico.errors';
import { StatusOS } from '../../domain/status-os';
import {
  OrdemServicoOutput,
  OrdemServicoOutputMapper,
} from '../mappers/ordem-servico-output.mapper';
import { CatalogoGateway } from '../ports/catalogo.gateway';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';
import {
  adicionarItensNaOrdem,
  ItemPecaInput,
  ItemServicoInput,
} from './montar-itens';

export interface CriarOrdemServicoInput {
  clienteId: string;
  veiculoId: string;
  descricaoProblema?: string;
  diagnostico?: string;
  servicos?: ItemServicoInput[];
  pecas?: ItemPecaInput[];
}

export class CriarOrdemServicoUseCase {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly catalogo: CatalogoGateway,
  ) {}

  async execute(input: CriarOrdemServicoInput): Promise<OrdemServicoOutput> {
    await this.garantirClienteEVeiculo(input.clienteId, input.veiculoId);

    const ordem = new OrdemServico({
      clienteId: input.clienteId,
      veiculoId: input.veiculoId,
      descricaoProblema: input.descricaoProblema,
      diagnostico: input.diagnostico,
    });

    await adicionarItensNaOrdem(
      ordem,
      this.catalogo,
      input.servicos,
      input.pecas,
    );

    const detalhe = await this.ordens.criar(ordem, {
      statusAnterior: null,
      statusNovo: StatusOS.RECEBIDA,
      observacao: 'OS criada',
    });

    return OrdemServicoOutputMapper.toOutput(detalhe);
  }

  /** O veículo precisa existir e ser do cliente informado. */
  private async garantirClienteEVeiculo(
    clienteId: string,
    veiculoId: string,
  ): Promise<void> {
    if (!(await this.catalogo.clienteExiste(clienteId))) {
      throw new ClienteDaOrdemNaoEncontradoError(clienteId);
    }

    const veiculo = await this.catalogo.buscarVeiculo(veiculoId);
    if (!veiculo) {
      throw new VeiculoDaOrdemNaoEncontradoError(veiculoId);
    }
    if (veiculo.clienteId !== clienteId) {
      throw new VeiculoNaoPertenceAoClienteError();
    }
  }
}
