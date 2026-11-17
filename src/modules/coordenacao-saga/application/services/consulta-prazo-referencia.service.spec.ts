import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { PassoCompensacaoSaga } from '@/shared/generated/prisma/enums';
import { ConsultaPrazoReferenciaService } from './consulta-prazo-referencia.service';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

jest.mock('@/shared/database/obter-instante-banco', () => ({
  obterInstanteBanco: async () => new Date('2026-11-17T12:00:00Z'),
}));

describe('ConsultaPrazoReferenciaService', () => {
  const contexto = { __ctx: true } as never;

  const montar = (status: StatusOS, prazo: Date | null) => {
    const ordem = {
      id: 'os-1',
      status,
      rodadaVigente: 1,
      prazoReferenciaReserva: prazo,
      correlationId: 'corr',
    };
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem,
        cliente: { nome: 'A', email: 'a@b.com' },
      }),
    };
    const estado = {
      obterOuCriar: jest.fn().mockResolvedValue({
        consultaIdVigente: null,
        passo: PassoCompensacaoSaga.EXECUCAO,
      }),
      salvar: jest.fn(),
    };
    const comandos = { emitirConsultarSituacaoFinanceira: jest.fn() };
    const pedidos = { existeEmitido: jest.fn().mockResolvedValue(false) };
    const prisma = {
      ordemServico: {
        findUnique: jest.fn().mockResolvedValue({
          consultaPrazoTentativa: 0,
          consultaPrazoProximaEm: null,
        }),
        update: jest.fn(),
      },
      pendenciaOs: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
    };

    const service = new ConsultaPrazoReferenciaService(
      ordens as never,
      estado as never,
      comandos as never,
      pedidos as never,
      prisma as never,
      5,
      10_000,
    );
    return { service, ordens, comandos, prisma, estado, pedidos };
  };

  it('ignora quando prazo de referência ainda não venceu', async () => {
    const futuro = new Date('2026-11-17T13:00:00Z');
    const { service, comandos } = montar(StatusOS.AGUARDANDO_PAGAMENTO, futuro);
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', false),
    ).resolves.toBe('ignorada');
    expect(comandos.emitirConsultarSituacaoFinanceira).not.toHaveBeenCalled();
  });

  it('emite consulta com prazo vencido', async () => {
    const passado = new Date('2026-11-17T11:00:00Z');
    const { service, comandos } = montar(StatusOS.AGUARDANDO_PAGAMENTO, passado);
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', false),
    ).resolves.toBe('emitida');
    expect(comandos.emitirConsultarSituacaoFinanceira).toHaveBeenCalled();
  });

  it('retorna indisponível quando OS não bloqueia', async () => {
    const ordens = { bloquearParaAtualizacao: jest.fn().mockResolvedValue(null) };
    const service = new ConsultaPrazoReferenciaService(
      ordens as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      5,
      10_000,
    );
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', false),
    ).resolves.toBe('indisponivel');
  });

  it('em EM_CANCELAMENTO emite consulta E10 vigente', async () => {
    const passado = new Date('2026-11-17T11:00:00Z');
    const { service, comandos, estado } = montar(
      StatusOS.EM_CANCELAMENTO,
      passado,
    );
    estado.obterOuCriar = jest.fn().mockResolvedValue({
      consultaIdVigente: 'consulta-e10',
      passo: PassoCompensacaoSaga.CONSULTA_E10,
    });
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', false),
    ).resolves.toBe('emitida');
    expect(comandos.emitirConsultarSituacaoFinanceira).toHaveBeenCalled();
  });

  it('ignora quando a próxima consulta ainda não venceu', async () => {
    const passado = new Date('2026-11-17T11:00:00Z');
    const { service, comandos, prisma } = montar(
      StatusOS.AGUARDANDO_PAGAMENTO,
      passado,
    );
    prisma.ordemServico.findUnique = jest.fn().mockResolvedValue({
      consultaPrazoTentativa: 1,
      consultaPrazoProximaEm: new Date('2026-11-17T13:00:00Z'),
    });
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', false),
    ).resolves.toBe('ignorada');
    expect(comandos.emitirConsultarSituacaoFinanceira).not.toHaveBeenCalled();
  });

  it('ignora quando consulta financeira ainda está em voo', async () => {
    const passado = new Date('2026-11-17T11:00:00Z');
    const { service, comandos, pedidos } = montar(
      StatusOS.AGUARDANDO_PAGAMENTO,
      passado,
    );
    pedidos.existeEmitido = jest.fn().mockResolvedValue(true);
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', false),
    ).resolves.toBe('ignorada');
    expect(comandos.emitirConsultarSituacaoFinanceira).not.toHaveBeenCalled();
  });

  it('retorna indisponível fora de AGUARDANDO_PAGAMENTO ou E10', async () => {
    const { service, comandos } = montar(StatusOS.RECEBIDA, null);
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', false),
    ).resolves.toBe('indisponivel');
    expect(comandos.emitirConsultarSituacaoFinanceira).not.toHaveBeenCalled();
  });

  it('forçar nova tentativa ignora consulta em voo', async () => {
    const passado = new Date('2026-11-17T11:00:00Z');
    const { service, comandos, pedidos } = montar(
      StatusOS.AGUARDANDO_PAGAMENTO,
      passado,
    );
    pedidos.existeEmitido = jest.fn().mockResolvedValue(true);
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', true),
    ).resolves.toBe('emitida');
    expect(comandos.emitirConsultarSituacaoFinanceira).toHaveBeenCalled();
  });

  it('EM_CANCELAMENTO sem E10 retorna indisponível', async () => {
    const { service, comandos, estado } = montar(
      StatusOS.EM_CANCELAMENTO,
      null,
    );
    estado.obterOuCriar = jest.fn().mockResolvedValue({
      consultaIdVigente: null,
      passo: PassoCompensacaoSaga.FINANCEIRO,
    });
    await expect(
      service.emitirConsultaVigente(contexto, 'os-1', 'caus', false),
    ).resolves.toBe('indisponivel');
    expect(comandos.emitirConsultarSituacaoFinanceira).not.toHaveBeenCalled();
  });

  it('agenda próxima reconsulta', async () => {
    const { service, prisma } = montar(StatusOS.AGUARDANDO_PAGAMENTO, null);
    await service.agendarProximaReconsulta(contexto, 'os-1');
    expect(prisma.ordemServico.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'os-1' },
      }),
    );
  });
});