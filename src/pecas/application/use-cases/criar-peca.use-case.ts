import { Peca } from '../../domain/entities/peca.entity';
import { CodigoPecaJaExisteError } from '../../domain/errors/peca.errors';
import { PecaOutput, PecaOutputMapper } from '../mappers/peca-output.mapper';
import { PecaGateway } from '../ports/peca.gateway';

export interface CriarPecaInput {
  codigo: string;
  nome: string;
  descricao?: string;
  precoUnitario: number;
  quantidadeEstoque?: number;
  estoqueMinimo?: number;
  ativo?: boolean;
}

export class CriarPecaUseCase {
  constructor(private readonly pecas: PecaGateway) {}

  async execute(input: CriarPecaInput): Promise<PecaOutput> {
    const peca = new Peca(input);

    if (await this.pecas.existeComCodigo(peca.codigo)) {
      throw new CodigoPecaJaExisteError();
    }

    return PecaOutputMapper.toOutput(await this.pecas.criar(peca));
  }
}
