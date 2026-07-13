import { StatusOS } from '../../domain/status-os';
import {
  ClienteDaOrdem,
  ItemPecaDetalhe,
  ItemServicoDetalhe,
  OrdemServicoDetalhe,
  OrdemServicoResumo,
  VeiculoDaOrdem,
} from '../ports/ordem-servico.gateway';

export interface OrdemServicoResumoOutput {
  id?: string;
  numero?: number;
  status: StatusOS;
  cliente: ClienteDaOrdem;
  veiculo: VeiculoDaOrdem;
  descricaoProblema: string | null;
  criadoEm: Date;
}

export interface OrdemServicoOutput extends OrdemServicoResumoOutput {
  diagnostico: string | null;
  servicos: ItemServicoDetalhe[];
  pecas: ItemPecaDetalhe[];
  valorTotal: number;
  orcamentos: unknown[];
  historicoStatus: unknown[];
  iniciadaEm: Date | null;
  finalizadaEm: Date | null;
  entregueEm: Date | null;
}

export class OrdemServicoOutputMapper {
  static toResumo({
    ordem,
    cliente,
    veiculo,
  }: OrdemServicoResumo): OrdemServicoResumoOutput {
    return {
      id: ordem.id,
      numero: ordem.numero,
      status: ordem.status,
      cliente,
      veiculo,
      descricaoProblema: ordem.descricaoProblema,
      criadoEm: ordem.criadoEm,
    };
  }

  static toOutput(detalhe: OrdemServicoDetalhe): OrdemServicoOutput {
    const { ordem, servicos, pecas, orcamentos, historicoStatus } = detalhe;

    return {
      ...OrdemServicoOutputMapper.toResumo(detalhe),
      diagnostico: ordem.diagnostico,
      servicos,
      pecas,
      valorTotal: ordem.valorTotal(),
      orcamentos,
      historicoStatus,
      iniciadaEm: ordem.iniciadaEm,
      finalizadaEm: ordem.finalizadaEm,
      entregueEm: ordem.entregueEm,
    };
  }
}
