import { Peca } from '../../domain/entities/peca.entity';
import {
  CodigoPecaJaExisteError,
  PecaNaoEncontradaError,
} from '../../domain/errors/peca.errors';
import { PecaOutput, PecaOutputMapper } from '../mappers/peca-output.mapper';
import { PecaGateway } from '../ports/peca.gateway';

export interface AtualizarPecaInput {
  codigo?: string;
  nome?: string;
  descricao?: string;
  precoUnitario?: number;
  quantidadeEstoque?: number;
  estoqueMinimo?: number;
  ativo?: boolean;
}

export class AtualizarPecaUseCase {
  constructor(private readonly pecas: PecaGateway) {}

  async execute(id: string, input: AtualizarPecaInput): Promise<PecaOutput> {
    const peca = await this.pecas.buscarPorId(id);
    if (!peca) {
      throw new PecaNaoEncontradaError(id);
    }

    await this.garantirCodigoDisponivel(id, peca, input.codigo);

    if (input.codigo !== undefined) peca.alterarCodigo(input.codigo);
    if (input.nome !== undefined) peca.alterarNome(input.nome);
    if (input.descricao !== undefined) peca.alterarDescricao(input.descricao);
    if (input.precoUnitario !== undefined) {
      peca.alterarPrecoUnitario(input.precoUnitario);
    }
    if (input.quantidadeEstoque !== undefined) {
      peca.alterarQuantidadeEstoque(input.quantidadeEstoque);
    }
    if (input.estoqueMinimo !== undefined) {
      peca.alterarEstoqueMinimo(input.estoqueMinimo);
    }
    if (input.ativo !== undefined) {
      input.ativo ? peca.ativar() : peca.desativar();
    }

    return PecaOutputMapper.toOutput(await this.pecas.atualizar(id, peca));
  }

  private async garantirCodigoDisponivel(
    id: string,
    peca: Peca,
    codigo?: string,
  ): Promise<void> {
    if (codigo === undefined) return;

    const novoCodigo = Peca.normalizarCodigo(codigo);
    if (novoCodigo === peca.codigo) return;

    if (await this.pecas.codigoPertenceAOutraPeca(id, novoCodigo)) {
      throw new CodigoPecaJaExisteError();
    }
  }
}
