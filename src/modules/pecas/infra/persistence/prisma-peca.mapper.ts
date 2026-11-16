import type { AtualizarPecaInput } from '../../application/use-cases/atualizar-peca.use-case';
import { Peca } from '../../domain/entities/peca.entity';

/** `precoUnitario` chega como Decimal do Prisma; o domínio trabalha com number. */
export interface PecaPrisma {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  precoUnitario: unknown;
  quantidadeEstoque: number;
  quantidadeReservada: number;
  estoqueMinimo: number;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class PrismaPecaMapper {
  static toDomain(this: void, raw: PecaPrisma): Peca {
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

  /** Grava só campos explicitamente enviados; estoque físico já foi ajustado no gateway quando informado. */
  static toPersistenceParcial(peca: Peca, input: AtualizarPecaInput) {
    const data: Record<string, unknown> = {};

    if (input.codigo !== undefined) data.codigo = peca.codigo;
    if (input.nome !== undefined) data.nome = peca.nome;
    if (input.descricao !== undefined) data.descricao = peca.descricao;
    if (input.precoUnitario !== undefined) {
      data.precoUnitario = peca.precoUnitario;
    }
    if (input.estoqueMinimo !== undefined) {
      data.estoqueMinimo = peca.estoqueMinimo;
    }
    if (input.ativo !== undefined) data.ativo = peca.ativo;

    return data;
  }
}
