import { Logger } from '@nestjs/common';
import { AgendadorCicloProcessador } from './agendador-ciclo-processador';

describe('AgendadorCicloProcessador', () => {
  const logger = new Logger('teste-agendador');

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('não inicia ciclo seguinte antes do término do anterior', async () => {
    let emExecucao = 0;
    let maxConcorrentes = 0;
    const executar = jest.fn(async () => {
      emExecucao += 1;
      maxConcorrentes = Math.max(maxConcorrentes, emExecucao);
      await Promise.resolve();
      emExecucao -= 1;
    });

    const agendador = new AgendadorCicloProcessador(
      100,
      executar,
      logger,
      'falha',
    );
    agendador.iniciar();

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);
    await jest.runOnlyPendingTimersAsync();

    expect(maxConcorrentes).toBe(1);
    expect(executar.mock.calls.length).toBeGreaterThanOrEqual(1);
    await agendador.parar();
  });

  it('desligamento aguarda ciclo em andamento e não agenda outro', async () => {
    let resolveCiclo: (() => void) | undefined;
    const executar = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCiclo = resolve;
        }),
    );

    const agendador = new AgendadorCicloProcessador(
      50,
      executar,
      logger,
      'falha',
    );
    agendador.iniciar();
    await jest.advanceTimersByTimeAsync(0);

    expect(agendador.cicloAtivo).toBe(true);
    const parada = agendador.parar();
    await jest.advanceTimersByTimeAsync(200);
    expect(executar).toHaveBeenCalledTimes(1);

    resolveCiclo?.();
    await parada;
    await jest.advanceTimersByTimeAsync(500);
    expect(executar).toHaveBeenCalledTimes(1);
  });
});
