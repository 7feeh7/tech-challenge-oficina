import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { Orcamento } from '../../domain/entities/orcamento.entity';

export interface PaginaOrcamentos {
  orcamentos: Orcamento[];
  total: number;
}

export interface PecaDaOrdem {
  pecaId: string;
  quantidade: number;
}

export interface OrdemDoOrcamento {
  id: string;
  status: StatusOS;
  rodadaVigente: number;
  pecas: PecaDaOrdem[];
}

export interface OrcamentoGateway {
  buscarPorId(id: string): Promise<Orcamento | null>;
  listar(
    page: number,
    limit: number,
    ordemServicoId?: string,
  ): Promise<PaginaOrcamentos>;
  buscarOrdemParaOrcamento(
    ordemServicoId: string,
  ): Promise<OrdemDoOrcamento | null>;
  existeOrcamentoAguardandoAprovacao(ordemServicoId: string): Promise<boolean>;
  criar(contexto: ContextoTransacao, orcamento: Orcamento): Promise<Orcamento>;
  atualizar(
    contexto: ContextoTransacao,
    orcamento: Orcamento,
  ): Promise<Orcamento>;
  remover(id: string): Promise<void>;
}
