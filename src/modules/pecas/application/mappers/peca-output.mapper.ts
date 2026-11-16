import { Peca } from '../../domain/entities/peca.entity';

export interface PecaOutput {
  id?: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  precoUnitario: number;
  quantidadeEstoque: number;
  quantidadeDisponivel: number;
  estoqueMinimo: number;
  ativo: boolean;
}

export class PecaOutputMapper {
  static toOutput(this: void, peca: Peca): PecaOutput {
    return {
      id: peca.id,
      codigo: peca.codigo,
      nome: peca.nome,
      descricao: peca.descricao,
      precoUnitario: peca.precoUnitario,
      quantidadeEstoque: peca.quantidadeEstoque,
      quantidadeDisponivel: peca.quantidadeDisponivel,
      estoqueMinimo: peca.estoqueMinimo,
      ativo: peca.ativo,
    };
  }
}
