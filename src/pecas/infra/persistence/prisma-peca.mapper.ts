import { Peca } from '../../domain/entities/peca.entity';

/** `precoUnitario` chega como Decimal do Prisma; o domínio trabalha com number. */
export interface PecaPrisma {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  precoUnitario: unknown;
  quantidadeEstoque: number;
  estoqueMinimo: number;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class PrismaPecaMapper {
  static toDomain(raw: PecaPrisma): Peca {
    return new Peca({ ...raw, precoUnitario: Number(raw.precoUnitario) });
  }

  static toPersistence(peca: Peca) {
    return {
      codigo: peca.codigo,
      nome: peca.nome,
      descricao: peca.descricao,
      precoUnitario: peca.precoUnitario,
      quantidadeEstoque: peca.quantidadeEstoque,
      estoqueMinimo: peca.estoqueMinimo,
      ativo: peca.ativo,
    };
  }
}
