import { CalcularTempoMedioUseCase } from './calcular-tempo-medio.use-case';
import { criarGatewayMock } from './test-doubles';

const HORA = 3_600_000;
const base = new Date('2026-01-01T00:00:00Z');
const somarHoras = (horas: number) => new Date(base.getTime() + horas * HORA);

describe('CalcularTempoMedioUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: CalcularTempoMedioUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new CalcularTempoMedioUseCase(gateway);
  });

  it('calcula a média de execução apenas com as OS que já finalizaram', async () => {
    gateway.buscarMarcosDeTempo.mockResolvedValue([
      // 2h de execução
      {
        criadoEm: base,
        iniciadaEm: somarHoras(1),
        finalizadaEm: somarHoras(3),
        entregueEm: null,
      },
      // 4h de execução
      {
        criadoEm: base,
        iniciadaEm: somarHoras(1),
        finalizadaEm: somarHoras(5),
        entregueEm: null,
      },
      // ainda em execução: não entra na média
      {
        criadoEm: base,
        iniciadaEm: somarHoras(1),
        finalizadaEm: null,
        entregueEm: null,
      },
    ]);

    const result = await useCase.execute();

    expect(result.totalOrdens).toBe(3);
    expect(result.totalFinalizadas).toBe(2);
    expect(result.tempoMedioExecucaoHoras).toBe(3);
  });

  it('calcula o ciclo total apenas com as OS entregues', async () => {
    gateway.buscarMarcosDeTempo.mockResolvedValue([
      {
        criadoEm: base,
        iniciadaEm: somarHoras(1),
        finalizadaEm: somarHoras(5),
        entregueEm: somarHoras(10),
      },
    ]);

    const result = await useCase.execute();

    expect(result.totalEntregues).toBe(1);
    expect(result.tempoMedioCicloTotalHoras).toBe(10);
  });

  it('ignora no ciclo total a OS encerrada sem execução', async () => {
    gateway.buscarMarcosDeTempo.mockResolvedValue([
      // executada de verdade: 10h de ciclo
      {
        criadoEm: base,
        iniciadaEm: somarHoras(1),
        finalizadaEm: somarHoras(5),
        entregueEm: somarHoras(10),
      },
      // cliente desistiu: foi entregue sem nunca ter entrado em execução
      {
        criadoEm: base,
        iniciadaEm: null,
        finalizadaEm: somarHoras(2),
        entregueEm: somarHoras(100),
      },
    ]);

    const result = await useCase.execute();

    // as 100h da desistência não podem inflar o tempo de atendimento da oficina
    expect(result.totalEntregues).toBe(1);
    expect(result.tempoMedioCicloTotalHoras).toBe(10);
  });

  it('devolve zero quando não há OS no período', async () => {
    gateway.buscarMarcosDeTempo.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toMatchObject({
      totalOrdens: 0,
      tempoMedioExecucaoMs: 0,
      tempoMedioCicloTotalMs: 0,
    });
  });

  it('repassa o intervalo de datas ao repositório e o ecoa nos filtros', async () => {
    gateway.buscarMarcosDeTempo.mockResolvedValue([]);
    const dataFim = somarHoras(48);

    const result = await useCase.execute(base, dataFim);

    expect(gateway.buscarMarcosDeTempo).toHaveBeenCalledWith(base, dataFim);
    expect(result.filtros).toEqual({ dataInicio: base, dataFim });
  });
});
