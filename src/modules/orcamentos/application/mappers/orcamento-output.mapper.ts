import { Orcamento } from '../../domain/entities/orcamento.entity';
import { StatusOrcamento } from '../../domain/status-orcamento';

export interface OrcamentoOutput {
  id?: string;
  ordemServicoId: string;
  valorTotal: number;
  status: StatusOrcamento;
  observacoes: string | null;
  aprovadoEm: Date | null;
  rejeitadoEm: Date | null;
  motivoRejeicao: string | null;
  criadoEm: Date;
}

export class OrcamentoOutputMapper {
  static toOutput(this: void, orcamento: Orcamento): OrcamentoOutput {
    return {
      id: orcamento.id,
      ordemServicoId: orcamento.ordemServicoId,
      valorTotal: orcamento.valorTotal,
      status: orcamento.status,
      observacoes: orcamento.observacoes,
      aprovadoEm: orcamento.aprovadoEm,
      rejeitadoEm: orcamento.rejeitadoEm,
      motivoRejeicao: orcamento.motivoRejeicao,
      criadoEm: orcamento.criadoEm,
    };
  }
}
