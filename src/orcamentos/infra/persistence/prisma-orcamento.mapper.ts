import { StatusOrcamento as StatusPrisma } from '@/generated/prisma/enums';
import { Orcamento } from '../../domain/entities/orcamento.entity';
import { StatusOrcamento } from '../../domain/status-orcamento';

export interface OrcamentoPrisma {
  id: string;
  ordemServicoId: string;
  valorTotal: unknown;
  status: StatusPrisma;
  observacoes: string | null;
  aprovadoEm: Date | null;
  rejeitadoEm: Date | null;
  motivoRejeicao: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class PrismaOrcamentoMapper {
  static toDomain(this: void, raw: OrcamentoPrisma): Orcamento {
    return new Orcamento({
      ...raw,
      valorTotal: Number(raw.valorTotal),
      status: raw.status as unknown as StatusOrcamento,
    });
  }

  static toPersistence(orcamento: Orcamento) {
    return {
      ordemServicoId: orcamento.ordemServicoId,
      valorTotal: orcamento.valorTotal,
      status: orcamento.status as unknown as StatusPrisma,
      observacoes: orcamento.observacoes,
      aprovadoEm: orcamento.aprovadoEm,
      rejeitadoEm: orcamento.rejeitadoEm,
      motivoRejeicao: orcamento.motivoRejeicao,
    };
  }
}
