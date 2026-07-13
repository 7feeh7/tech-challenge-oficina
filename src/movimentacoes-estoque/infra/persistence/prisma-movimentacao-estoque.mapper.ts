import { TipoMovimentacaoEstoque as TipoPrisma } from '@/generated/prisma/enums';
import { MovimentacaoEstoque } from '../../domain/entities/movimentacao-estoque.entity';
import { TipoMovimentacaoEstoque } from '../../domain/tipo-movimentacao-estoque';

export interface MovimentacaoEstoquePrisma {
  id: string;
  pecaId: string;
  tipo: TipoPrisma;
  quantidade: number;
  ordemServicoId: string | null;
  observacao: string | null;
  criadoEm: Date;
}

export class PrismaMovimentacaoEstoqueMapper {
  static toDomain(raw: MovimentacaoEstoquePrisma): MovimentacaoEstoque {
    return new MovimentacaoEstoque({
      ...raw,
      tipo: raw.tipo as unknown as TipoMovimentacaoEstoque,
    });
  }

  static toPersistence(movimentacao: MovimentacaoEstoque) {
    return {
      pecaId: movimentacao.pecaId,
      tipo: movimentacao.tipo as unknown as TipoPrisma,
      quantidade: movimentacao.quantidade,
      ordemServicoId: movimentacao.ordemServicoId,
      observacao: movimentacao.observacao,
    };
  }
}
