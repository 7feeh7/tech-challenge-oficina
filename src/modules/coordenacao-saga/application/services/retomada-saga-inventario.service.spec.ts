import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { RetomadaSagaInventarioService } from './retomada-saga-inventario.service';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

describe('RetomadaSagaInventarioService', () => {
  let contexto: PrismaContextoTransacao;

  it('finaliza OS com concluidoEm original quando inventário resolvido', async () => {
    const concluidoEm = new Date('2025-06-01T12:00:00.000Z');
    const cliente = {
      pendenciaOs: {
        count: jest.fn().mockResolvedValue(0),
      },
      consumoAplicadoOs: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ca1',
          situacaoReconciliacao: 'DIVERGENCIA_PENDENTE',
          aguardandoFinalizacao: true,
          tipoFato: 'REPARO_CONCLUIDO',
          concluidoEm,
          fatoOcorridoEm: new Date(),
        }),
        update: jest.fn(),
      },
    };
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem: { id: 'os-1', rodadaVigente: 1, status: StatusOS.EM_EXECUCAO },
      }),
    };
    const transicoes = { aplicar: jest.fn() };
    const compensacao = { avancarSeEmCancelamento: jest.fn() };
    contexto = new PrismaContextoTransacao(cliente as never);
    const service = new RetomadaSagaInventarioService(
      ordens as never,
      transicoes as never,
      compensacao as never,
      cliente as never,
    );
    await service.retomarAposResolucaoInventario(contexto, 'os-1', 'evt');
    expect(transicoes.aplicar).toHaveBeenCalledWith(
      contexto,
      expect.objectContaining({ ocorridoEm: concluidoEm }),
    );
  });

  it('retoma compensação em EM_CANCELAMENTO', async () => {
    const cliente = {
      pendenciaOs: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      },
      consumoAplicadoOs: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ca1',
          situacaoReconciliacao: 'DIVERGENCIA_RESOLVIDA',
          aguardandoFinalizacao: false,
          tipoFato: 'REPARO_FALHOU',
        }),
        update: jest.fn(),
      },
    };
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem: {
          id: 'os-1',
          rodadaVigente: 1,
          status: StatusOS.EM_CANCELAMENTO,
        },
      }),
    };
    const compensacao = { avancarSeEmCancelamento: jest.fn() };
    contexto = new PrismaContextoTransacao(cliente as never);
    const service = new RetomadaSagaInventarioService(
      ordens as never,
      { aplicar: jest.fn() } as never,
      compensacao as never,
      cliente as never,
    );
    await service.retomarAposResolucaoInventario(contexto, 'os-1', 'evt');
    expect(compensacao.avancarSeEmCancelamento).toHaveBeenCalled();
  });

  it('não finaliza com outra pendência aberta além do inventário', async () => {
    const cliente = {
      pendenciaOs: {
        count: jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(0),
      },
      consumoAplicadoOs: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ca1',
          situacaoReconciliacao: 'DIVERGENCIA_RESOLVIDA',
          aguardandoFinalizacao: true,
          tipoFato: 'REPARO_CONCLUIDO',
          concluidoEm: new Date(),
        }),
        update: jest.fn(),
      },
    };
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem: { id: 'os-1', rodadaVigente: 1, status: StatusOS.EM_EXECUCAO },
      }),
    };
    const transicoes = { aplicar: jest.fn() };
    contexto = new PrismaContextoTransacao(cliente as never);
    const service = new RetomadaSagaInventarioService(
      ordens as never,
      transicoes as never,
      { avancarSeEmCancelamento: jest.fn() } as never,
      cliente as never,
    );
    await service.retomarAposResolucaoInventario(contexto, 'os-1', 'evt');
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  describe('pendência financeira aberta na retomada da finalização', () => {
    const retomarComContagens = async (
      abertas: number,
      informativas: number,
    ) => {
      const cliente = {
        pendenciaOs: {
          count: jest
            .fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(abertas)
            .mockResolvedValueOnce(informativas),
        },
        consumoAplicadoOs: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ca1',
            situacaoReconciliacao: 'DIVERGENCIA_RESOLVIDA',
            aguardandoFinalizacao: true,
            tipoFato: 'REPARO_CONCLUIDO',
            concluidoEm: new Date(),
          }),
          update: jest.fn(),
        },
      };
      const ordens = {
        bloquearParaAtualizacao: jest.fn().mockResolvedValue({
          ordem: {
            id: 'os-1',
            rodadaVigente: 1,
            status: StatusOS.EM_EXECUCAO,
          },
        }),
      };
      const transicoes = { aplicar: jest.fn() };
      const service = new RetomadaSagaInventarioService(
        ordens as never,
        transicoes as never,
        { avancarSeEmCancelamento: jest.fn() } as never,
        cliente as never,
      );
      await service.retomarAposResolucaoInventario(
        new PrismaContextoTransacao(cliente as never),
        'os-1',
        'evt',
      );
      return { cliente, transicoes };
    };

    it('finaliza quando as pendências financeiras abertas são só SEGUNDO_PAGAMENTO', async () => {
      const { cliente, transicoes } = await retomarComContagens(1, 1);

      expect(transicoes.aplicar).toHaveBeenCalledTimes(1);
      expect(cliente.pendenciaOs.count).toHaveBeenLastCalledWith({
        where: expect.objectContaining({
          resolvida: false,
          detalhes: { path: ['natureza'], equals: 'SEGUNDO_PAGAMENTO' },
        }),
      });
    });

    it('não finaliza quando há outra pendência financeira além do segundo pagamento', async () => {
      const { transicoes } = await retomarComContagens(2, 1);

      expect(transicoes.aplicar).not.toHaveBeenCalled();
    });
  });

  it('retorna cedo quando OS não é encontrada', async () => {
    const cliente = {
      pendenciaOs: { count: jest.fn().mockResolvedValue(0) },
    };
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue(null),
    };
    contexto = new PrismaContextoTransacao(cliente as never);
    const service = new RetomadaSagaInventarioService(
      ordens as never,
      { aplicar: jest.fn() } as never,
      { avancarSeEmCancelamento: jest.fn() } as never,
      cliente as never,
    );
    await service.retomarAposResolucaoInventario(contexto, 'os-1', 'evt');
    expect(ordens.bloquearParaAtualizacao).toHaveBeenCalled();
  });

  it('retorna cedo sem registro de consumo aplicado', async () => {
    const cliente = {
      pendenciaOs: { count: jest.fn().mockResolvedValue(0) },
      consumoAplicadoOs: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem: { id: 'os-1', rodadaVigente: 1, status: StatusOS.EM_EXECUCAO },
      }),
    };
    contexto = new PrismaContextoTransacao(cliente as never);
    const transicoes = { aplicar: jest.fn() };
    const service = new RetomadaSagaInventarioService(
      ordens as never,
      transicoes as never,
      { avancarSeEmCancelamento: jest.fn() } as never,
      cliente as never,
    );
    await service.retomarAposResolucaoInventario(contexto, 'os-1', 'evt');
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('finalização retoma também reparo iniciado se OS ainda aguardava execução', async () => {
    const concluidoEm = new Date('2025-07-01T10:00:00.000Z');
    const ordem = {
      id: 'os-1',
      rodadaVigente: 1,
      status: StatusOS.AGUARDANDO_EXECUCAO,
      registrarReparoIniciado: jest.fn(),
      registrarReparoConcluido: jest.fn(),
    };
    const cliente = {
      pendenciaOs: { count: jest.fn().mockResolvedValue(0) },
      consumoAplicadoOs: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ca1',
          situacaoReconciliacao: 'DIVERGENCIA_RESOLVIDA',
          aguardandoFinalizacao: true,
          tipoFato: 'REPARO_CONCLUIDO',
          concluidoEm,
          fatoOcorridoEm: new Date(),
        }),
        update: jest.fn(),
      },
    };
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem: { id: 'os-1', rodadaVigente: 1, status: StatusOS.EM_EXECUCAO },
      }),
    };
    const transicoes = {
      aplicar: jest.fn((_ctx, input) => {
        input.aplicar(ordem, concluidoEm);
        return Promise.resolve(undefined);
      }),
    };
    contexto = new PrismaContextoTransacao(cliente as never);
    const service = new RetomadaSagaInventarioService(
      ordens as never,
      transicoes as never,
      { avancarSeEmCancelamento: jest.fn() } as never,
      cliente as never,
    );
    await service.retomarAposResolucaoInventario(contexto, 'os-1', 'evt');
    expect(ordem.registrarReparoIniciado).toHaveBeenCalledWith(concluidoEm);
    expect(ordem.registrarReparoConcluido).toHaveBeenCalledWith(concluidoEm);
  });

  it('atualiza DIVERGENCIA_PENDENTE e retoma compensação', async () => {
    const cliente = {
      pendenciaOs: { count: jest.fn().mockResolvedValue(0) },
      consumoAplicadoOs: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ca1',
          situacaoReconciliacao: 'DIVERGENCIA_PENDENTE',
          aguardandoFinalizacao: false,
          tipoFato: 'REPARO_FALHOU',
        }),
        update: jest.fn(),
      },
    };
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem: {
          id: 'os-1',
          rodadaVigente: 1,
          status: StatusOS.EM_CANCELAMENTO,
        },
      }),
    };
    const compensacao = { avancarSeEmCancelamento: jest.fn() };
    contexto = new PrismaContextoTransacao(cliente as never);
    const service = new RetomadaSagaInventarioService(
      ordens as never,
      { aplicar: jest.fn() } as never,
      compensacao as never,
      cliente as never,
    );
    await service.retomarAposResolucaoInventario(contexto, 'os-1', 'evt');
    expect(cliente.consumoAplicadoOs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { situacaoReconciliacao: 'DIVERGENCIA_RESOLVIDA' },
      }),
    );
    expect(compensacao.avancarSeEmCancelamento).toHaveBeenCalled();
  });

  it('não finaliza com pendência INVENTARIO aberta', async () => {
    const cliente = {
      pendenciaOs: { count: jest.fn().mockResolvedValue(1) },
    };
    const ordens = { bloquearParaAtualizacao: jest.fn() };
    contexto = new PrismaContextoTransacao(cliente as never);
    const service = new RetomadaSagaInventarioService(
      ordens as never,
      {} as never,
      {} as never,
      cliente as never,
    );
    await service.retomarAposResolucaoInventario(contexto, 'os-1', 'evt');
    expect(ordens.bloquearParaAtualizacao).not.toHaveBeenCalled();
  });
});
