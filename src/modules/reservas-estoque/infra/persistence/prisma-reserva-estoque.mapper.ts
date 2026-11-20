import { SituacaoReservaEstoque } from '../../domain/situacao-reserva-estoque';
import type { LinhaReservaEstoque } from '../../application/ports/reserva-estoque.gateway';

export interface ReservaEstoquePrisma {
  id: string;
  grupoReservaId: string;
  ordemServicoId: string;
  rodada: number;
  pecaId: string;
  quantidade: number;
  quantidadeConsumida: number;
  situacao: string;
  prazoReferencia: Date | null;
}

export class PrismaReservaEstoqueMapper {
  static toLinha(raw: ReservaEstoquePrisma): LinhaReservaEstoque {
    return {
      id: raw.id,
      grupoReservaId: raw.grupoReservaId,
      ordemServicoId: raw.ordemServicoId,
      rodada: raw.rodada,
      pecaId: raw.pecaId,
      quantidade: raw.quantidade,
      quantidadeConsumida: raw.quantidadeConsumida,
      situacao: raw.situacao as SituacaoReservaEstoque,
      prazoReferencia: raw.prazoReferencia,
    };
  }
}
