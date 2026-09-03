import {
  MarcosDeTempo,
  OrdemServicoGateway,
} from '../ports/ordem-servico.gateway';

const MS_POR_HORA = 3_600_000;

export interface TempoMedioOutput {
  totalOrdens: number;
  totalFinalizadas: number;
  totalEntregues: number;
  tempoMedioExecucaoMs: number;
  tempoMedioExecucaoHoras: number;
  tempoMedioCicloTotalMs: number;
  tempoMedioCicloTotalHoras: number;
  filtros: { dataInicio: Date | null; dataFim: Date | null };
}

/**
 * Tempo médio de execução (iniciadaEm → finalizadaEm) e de ciclo total
 * (criadoEm → entregueEm).
 *
 * As duas médias só olham para OS que passaram pela execução: uma OS encerrada
 * sem execução — o cliente desistiu e levou o carro — tem `entregueEm` mas nunca
 * teve `iniciadaEm`, e entraria no ciclo total distorcendo o tempo de atendimento
 * real da oficina.
 */
export class CalcularTempoMedioUseCase {
  constructor(private readonly ordens: OrdemServicoGateway) {}

  async execute(dataInicio?: Date, dataFim?: Date): Promise<TempoMedioOutput> {
    const marcos = await this.ordens.buscarMarcosDeTempo(dataInicio, dataFim);

    const executadas = marcos.filter((o) => o.iniciadaEm && o.finalizadaEm);
    const entregues = marcos.filter((o) => o.entregueEm && o.iniciadaEm);

    const tempoMedioExecucaoMs = media(
      executadas.map(
        (o) => o.finalizadaEm!.getTime() - o.iniciadaEm!.getTime(),
      ),
    );
    const tempoMedioCicloTotalMs = media(
      entregues.map((o) => o.entregueEm!.getTime() - o.criadoEm.getTime()),
    );

    return {
      totalOrdens: marcos.length,
      totalFinalizadas: executadas.length,
      totalEntregues: entregues.length,
      tempoMedioExecucaoMs,
      tempoMedioExecucaoHoras: emHoras(tempoMedioExecucaoMs),
      tempoMedioCicloTotalMs,
      tempoMedioCicloTotalHoras: emHoras(tempoMedioCicloTotalMs),
      filtros: {
        dataInicio: dataInicio ?? null,
        dataFim: dataFim ?? null,
      },
    };
  }
}

function media(duracoes: number[]): number {
  if (duracoes.length === 0) return 0;
  return (
    duracoes.reduce((total, duracao) => total + duracao, 0) / duracoes.length
  );
}

function emHoras(ms: number): number {
  return Number((ms / MS_POR_HORA).toFixed(2));
}

export type { MarcosDeTempo };
