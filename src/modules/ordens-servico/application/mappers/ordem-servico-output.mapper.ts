import { SugestaoItemOrdem } from '../../domain/entities/ordem-servico.entity';
import { StatusOS } from '../../domain/status-os';
import {
  ClienteDaOrdem,
  HistoricoStatusDetalhe,
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
  rodadaVigente: number;
  cliente: ClienteDaOrdem;
  veiculo: VeiculoDaOrdem;
  descricaoProblema: string | null;
  criadoEm: Date;
}

export interface OrdemServicoOutput extends OrdemServicoResumoOutput {
  correlationId: string;
  diagnostico: string | null;
  diagnosticoConcluidoEm: Date | null;
  servicos: ItemServicoDetalhe[];
  pecas: ItemPecaDetalhe[];
  sugestoes: SugestaoItemOrdem[];
  valorTotal: number;
  orcamentos: unknown[];
  historicoStatus: HistoricoStatusDetalhe[];
  etapaOrigemCancelamento: StatusOS | null;
  motivoEncerramento: string | null;
  veiculoLiberadoRetirada: boolean;
  devolvidaEm: Date | null;
  iniciadaEm: Date | null;
  finalizadaEm: Date | null;
  entregueEm: Date | null;
}

export class OrdemServicoOutputMapper {
  static toResumo(
    this: void,
    { ordem, cliente, veiculo }: OrdemServicoResumo,
  ): OrdemServicoResumoOutput {
    return {
      id: ordem.id,
      numero: ordem.numero,
      status: ordem.status,
      rodadaVigente: ordem.rodadaVigente,
      cliente,
      veiculo,
      descricaoProblema: ordem.descricaoProblema,
      criadoEm: ordem.criadoEm,
    };
  }

  static toOutput(detalhe: OrdemServicoDetalhe): OrdemServicoOutput {
    const { ordem, servicos, pecas, sugestoes, orcamentos, historicoStatus } =
      detalhe;

    return {
      ...OrdemServicoOutputMapper.toResumo(detalhe),
      correlationId: ordem.correlationId,
      diagnostico: ordem.diagnostico,
      diagnosticoConcluidoEm: ordem.diagnosticoConcluidoEm,
      servicos,
      pecas,
      sugestoes: sugestoes.map((sugestao) => ({ ...sugestao })),
      valorTotal: ordem.valorTotal(),
      orcamentos,
      historicoStatus,
      etapaOrigemCancelamento: ordem.etapaOrigemCancelamento,
      motivoEncerramento: ordem.motivoEncerramento,
      veiculoLiberadoRetirada: ordem.veiculoLiberadoRetirada,
      devolvidaEm: ordem.devolvidaEm,
      iniciadaEm: ordem.iniciadaEm,
      finalizadaEm: ordem.finalizadaEm,
      entregueEm: ordem.entregueEm,
    };
  }
}
