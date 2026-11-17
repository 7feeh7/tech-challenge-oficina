import { PassoCompensacaoSaga } from '@/shared/generated/prisma/enums';
import { PrismaEstadoCompensacaoGateway } from './prisma-estado-compensacao.gateway';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

describe('PrismaEstadoCompensacaoGateway', () => {
  it('cria estado inicial quando inexistente', async () => {
    const create = jest.fn().mockResolvedValue({
      ordemServicoId: 'os-1',
      rodada: 1,
      passo: PassoCompensacaoSaga.EXECUCAO,
      resultadoExecucao: null,
      consultaIdVigente: null,
      aguardandoResposta: false,
      reparoIniciadoDuranteCancelamento: false,
      fatoTerminalExecucao: false,
      pecasUtilizadas: null,
      condicoesE10: null,
    });
    const prisma = {
      estadoCompensacaoOs: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
        update: jest.fn(),
      },
    };
    const gateway = new PrismaEstadoCompensacaoGateway(prisma as never);
    const snap = await gateway.obterOuCriar({} as never, 'os-1', 1);
    expect(create).toHaveBeenCalled();
    expect(snap.passo).toBe(PassoCompensacaoSaga.EXECUCAO);
  });

  it('mapeia snapshot existente com peças e condições E10', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      ordemServicoId: 'os-1',
      rodada: 1,
      passo: PassoCompensacaoSaga.ESTOQUE,
      resultadoExecucao: null,
      consultaIdVigente: 'c1',
      aguardandoResposta: false,
      reparoIniciadoDuranteCancelamento: true,
      fatoTerminalExecucao: false,
      pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }],
      condicoesE10: {
        reparoConcluidoAntesCancelamento: true,
        pagamentoValido: true,
        semEstorno: true,
        estoqueConciliado: false,
      },
    });
    const prisma = {
      estadoCompensacaoOs: { findUnique, create: jest.fn(), update: jest.fn() },
    };
    const gateway = new PrismaEstadoCompensacaoGateway(prisma as never);
    const snap = await gateway.obterOuCriar({} as never, 'os-1', 1);
    expect(snap.pecasUtilizadas).toHaveLength(1);
    expect(snap.condicoesE10?.pagamentoValido).toBe(true);
  });

  it('ignora pecasUtilizadas inválidas no mapeamento', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      ordemServicoId: 'os-1',
      rodada: 1,
      passo: PassoCompensacaoSaga.EXECUCAO,
      resultadoExecucao: null,
      consultaIdVigente: null,
      aguardandoResposta: false,
      reparoIniciadoDuranteCancelamento: false,
      fatoTerminalExecucao: false,
      pecasUtilizadas: 'invalido',
      condicoesE10: null,
    });
    const prisma = {
      estadoCompensacaoOs: { findUnique, create: jest.fn(), update: jest.fn() },
    };
    const gateway = new PrismaEstadoCompensacaoGateway(prisma as never);
    const snap = await gateway.obterOuCriar({} as never, 'os-1', 1);
    expect(snap.pecasUtilizadas).toBeNull();
  });

  it('persiste alterações em salvar', async () => {
    const update = jest.fn();
    const prisma = {
      estadoCompensacaoOs: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update,
      },
    };
    const gateway = new PrismaEstadoCompensacaoGateway(prisma as never);
    await gateway.salvar({} as never, {
      ordemServicoId: 'os-1',
      rodada: 1,
      passo: PassoCompensacaoSaga.FINANCEIRO,
      resultadoExecucao: null,
      consultaIdVigente: null,
      aguardandoResposta: true,
      reparoIniciadoDuranteCancelamento: false,
      fatoTerminalExecucao: false,
      pecasUtilizadas: null,
      condicoesE10: null,
    });
    expect(update).toHaveBeenCalled();
  });
});
