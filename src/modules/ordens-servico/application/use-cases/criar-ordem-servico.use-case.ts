import { randomUUID } from 'crypto';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import {
  ClienteDaOrdemNaoEncontradoError,
  OrdemServicoNaoEncontradaError,
  PecaDaOrdemNaoEncontradaError,
  ServicoDaOrdemNaoEncontradoError,
  VeiculoDaOrdemNaoEncontradoError,
  VeiculoNaoPertenceAoClienteError,
} from '../../domain/errors/ordem-servico.errors';
import {
  OrdemServicoOutput,
  OrdemServicoOutputMapper,
} from '../mappers/ordem-servico-output.mapper';
import { CatalogoGateway } from '../ports/catalogo.gateway';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';

export interface ItemServicoInput {
  servicoId: string;
  quantidade?: number;
}

export interface ItemPecaInput {
  pecaId: string;
  quantidade: number;
}

export interface CriarOrdemServicoInput {
  clienteId: string;
  veiculoId: string;
  descricaoProblema?: string;
  servicos?: ItemServicoInput[];
  pecas?: ItemPecaInput[];
}

export class CriarOrdemServicoUseCase {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly catalogo: CatalogoGateway,
    private readonly unitOfWork: UnitOfWork,
    private readonly transicoes: TransicaoOrdemServicoService,
  ) {}

  async execute(input: CriarOrdemServicoInput): Promise<OrdemServicoOutput> {
    await this.garantirClienteEVeiculo(input.clienteId, input.veiculoId);

    const ordem = new OrdemServico({
      clienteId: input.clienteId,
      veiculoId: input.veiculoId,
      descricaoProblema: input.descricaoProblema,
      correlationId: randomUUID(),
    });
    await this.adicionarSugestoes(ordem, input);

    const criada = await this.unitOfWork.executar((contexto) =>
      this.transicoes.abrir(contexto, ordem),
    );
    this.transicoes.registrarMetricasDaAbertura();

    return await this.montarSaida(criada.ordem.id!);
  }

  private async montarSaida(id: string): Promise<OrdemServicoOutput> {
    const detalhe = await this.ordens.buscarDetalhePorId(id);
    if (!detalhe) {
      throw new OrdemServicoNaoEncontradaError(id);
    }
    return OrdemServicoOutputMapper.toOutput(detalhe);
  }

  /** Sugestões não têm preço: o preço congela só na conclusão do diagnóstico. */
  private async adicionarSugestoes(
    ordem: OrdemServico,
    input: CriarOrdemServicoInput,
  ): Promise<void> {
    for (const item of input.servicos ?? []) {
      if (!(await this.catalogo.servicoExiste(item.servicoId))) {
        throw new ServicoDaOrdemNaoEncontradoError(item.servicoId);
      }
      ordem.adicionarSugestao({
        tipo: 'SERVICO',
        itemId: item.servicoId,
        quantidade: item.quantidade ?? 1,
      });
    }

    for (const item of input.pecas ?? []) {
      if (!(await this.catalogo.pecaExiste(item.pecaId))) {
        throw new PecaDaOrdemNaoEncontradaError(item.pecaId);
      }
      ordem.adicionarSugestao({
        tipo: 'PECA',
        itemId: item.pecaId,
        quantidade: item.quantidade,
      });
    }
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
