import { ConfigService } from '@nestjs/config';
import { ProcessadorIdadeOsPorStatusService } from './processador-idade-os-por-status.service';
import type { OsMetricsService } from './os-metrics.service';

describe('ProcessadorIdadeOsPorStatusService', () => {
  const recordIdadeMaisAntigaPorStatus = jest.fn();
  const osMetrics = {
    recordIdadeMaisAntigaPorStatus,
  } as unknown as OsMetricsService;

  function criarProcessador(
    variaveis: Record<string, string>,
  ): ProcessadorIdadeOsPorStatusService {
    return new ProcessadorIdadeOsPorStatusService(
      new ConfigService(variaveis),
      osMetrics,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    recordIdadeMaisAntigaPorStatus.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('não agenda ciclos quando está desabilitado', async () => {
    const processador = criarProcessador({});

    processador.onModuleInit();
    await jest.advanceTimersByTimeAsync(300_000);

    expect(recordIdadeMaisAntigaPorStatus).not.toHaveBeenCalled();
    await processador.onModuleDestroy();
  });

  it('emite um ciclo logo ao iniciar e repete no intervalo configurado', async () => {
    const processador = criarProcessador({
      OS_IDADE_POR_STATUS_HABILITADO: 'true',
      OS_IDADE_POR_STATUS_INTERVAL_MS: '5000',
    });

    processador.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(4_999);
    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(2);
    await processador.onModuleDestroy();
  });

  it('usa o intervalo padrão de 60 s sem configuração', async () => {
    const processador = criarProcessador({
      OS_IDADE_POR_STATUS_HABILITADO: 'true',
    });

    processador.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(59_999);
    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(2);
    await processador.onModuleDestroy();
  });

  it.each(['abc', '0', '-10'])(
    'volta ao intervalo padrão quando o intervalo configurado é inválido (%s)',
    async (intervaloInvalido) => {
      const processador = criarProcessador({
        OS_IDADE_POR_STATUS_HABILITADO: 'true',
        OS_IDADE_POR_STATUS_INTERVAL_MS: intervaloInvalido,
      });

      processador.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(59_999);

      expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(1);
      await processador.onModuleDestroy();
    },
  );

  it('não inicia novo ciclo enquanto o anterior ainda executa', async () => {
    let concluirCiclo: (() => void) | undefined;
    recordIdadeMaisAntigaPorStatus.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          concluirCiclo = resolve;
        }),
    );
    const processador = criarProcessador({
      OS_IDADE_POR_STATUS_HABILITADO: 'true',
      OS_IDADE_POR_STATUS_INTERVAL_MS: '1000',
    });

    processador.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(1);

    concluirCiclo?.();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(2);

    concluirCiclo?.();
    await processador.onModuleDestroy();
  });

  it('mantém o agendamento depois de um ciclo que falha', async () => {
    recordIdadeMaisAntigaPorStatus
      .mockRejectedValueOnce(new Error('falha inesperada'))
      .mockResolvedValue(undefined);
    const processador = criarProcessador({
      OS_IDADE_POR_STATUS_HABILITADO: 'true',
      OS_IDADE_POR_STATUS_INTERVAL_MS: '1000',
    });
    const erroLogado = jest
      .spyOn(
        (processador as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation();

    processador.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1_000);

    expect(erroLogado).toHaveBeenCalledTimes(1);
    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(2);
    await processador.onModuleDestroy();
  });

  it('para de agendar no onModuleDestroy e aguarda o ciclo em andamento', async () => {
    let concluirCiclo: (() => void) | undefined;
    recordIdadeMaisAntigaPorStatus.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          concluirCiclo = resolve;
        }),
    );
    const processador = criarProcessador({
      OS_IDADE_POR_STATUS_HABILITADO: 'true',
      OS_IDADE_POR_STATUS_INTERVAL_MS: '1000',
    });

    processador.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);

    let destruido = false;
    const destruicao = processador.onModuleDestroy().then(() => {
      destruido = true;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(destruido).toBe(false);

    concluirCiclo?.();
    await destruicao;
    await jest.advanceTimersByTimeAsync(10_000);

    expect(recordIdadeMaisAntigaPorStatus).toHaveBeenCalledTimes(1);
  });
});
