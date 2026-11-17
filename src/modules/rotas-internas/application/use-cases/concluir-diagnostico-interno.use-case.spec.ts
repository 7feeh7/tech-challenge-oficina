import { ConcluirDiagnosticoInternoUseCase } from './concluir-diagnostico-interno.use-case';
import { OrdemServico } from '@/modules/ordens-servico/domain/entities/ordem-servico.entity';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { EstadoIncompativelInternaError } from '../../domain/erros-internos';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';

import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';

describe('ConcluirDiagnosticoInternoUseCase', () => {
  const ordem = new OrdemServico({
    id: 'os-1',
    clienteId: 'c1',
    veiculoId: 'v1',
    status: StatusOS.EM_DIAGNOSTICO,
    correlationId: 'corr',
  });

  it('recusa OS ausente', async () => {
    const unitOfWork = {
      executar: jest.fn((fn: (c: PrismaContextoTransacao) => unknown) =>
        fn(new PrismaContextoTransacao({} as never)),
      ),
    };
    const useCase = new ConcluirDiagnosticoInternoUseCase(
      {
        bloquearParaAtualizacao: jest.fn().mockResolvedValue(null),
      } as never,
      {} as never,
      unitOfWork as never,
      {} as never,
      { buscarNaTransacao: jest.fn() } as never,
      {} as never,
    );
    await expect(
      useCase.execute({
        ordemServicoId: 'x',
        rodada: 1,
        tarefaId: 't',
        laudo: 'L',
        itens: [{ tipo: 'SERVICO', itemId: 's', quantidade: 1 }],
        idempotencyKey: 'k',
      }),
    ).rejects.toBeInstanceOf(OrdemServicoNaoEncontradaError);
  });

  it('recusa status incompatível', async () => {
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem: new OrdemServico({
          id: 'os-1',
          clienteId: 'c1',
          veiculoId: 'v1',
          status: StatusOS.RECEBIDA,
        }),
      }),
    };
    const unitOfWork = {
      executar: jest.fn((fn: (c: PrismaContextoTransacao) => unknown) =>
        fn(new PrismaContextoTransacao({ $queryRaw: jest.fn() } as never)),
      ),
    };
    const useCase = new ConcluirDiagnosticoInternoUseCase(
      ordens as never,
      {} as never,
      unitOfWork as never,
      { registrarGerarOrcamentoNaOutbox: jest.fn() } as never,
      { buscarNaTransacao: jest.fn().mockResolvedValue(null) } as never,
      { $queryRaw: jest.fn() } as never,
    );

    await expect(
      useCase.execute({
        ordemServicoId: 'os-1',
        rodada: 1,
        tarefaId: 't1',
        laudo: 'L',
        itens: [{ tipo: 'SERVICO', itemId: 's1', quantidade: 1 }],
        idempotencyKey: 'k1',
      }),
    ).rejects.toBeInstanceOf(EstadoIncompativelInternaError);
  });

  it('executa fluxo completo quando válido', async () => {
    const bloqueada = { ordem };
    const salvar = jest.fn();
    const gerarOrcamento = jest.fn();
    const catalogo = {
      buscarServicoParaDiagnostico: jest.fn().mockResolvedValue({
        id: 's1',
        nome: 'Serviço',
        precoUnitario: 20,
        ativo: true,
      }),
      buscarPecaParaDiagnostico: jest.fn(),
    };
    const queryRaw = jest
      .fn()
      .mockResolvedValue([{ now: new Date('2026-01-01T00:00:00Z') }]);
    const unitOfWork = {
      executar: jest.fn((fn: (c: PrismaContextoTransacao) => unknown) =>
        fn(new PrismaContextoTransacao({ $queryRaw: queryRaw } as never)),
      ),
    };
    const gravar = jest.fn();
    const useCase = new ConcluirDiagnosticoInternoUseCase(
      {
        bloquearParaAtualizacao: jest.fn().mockResolvedValue(bloqueada),
        salvar,
      } as never,
      catalogo as never,
      unitOfWork as never,
      { registrarGerarOrcamentoNaOutbox: gerarOrcamento } as never,
      {
        buscarNaTransacao: jest.fn().mockResolvedValue(null),
        gravarNaTransacao: gravar,
      } as never,
      {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ now: new Date('2026-01-01T00:00:00Z') }]),
      } as never,
    );

    const saida = await useCase.execute({
      ordemServicoId: 'os-1',
      rodada: 1,
      tarefaId: 't1',
      laudo: 'Laudo',
      itens: [{ tipo: 'SERVICO', itemId: 's1', quantidade: 1 }],
      idempotencyKey: 'k1',
    });

    expect(saida.itensOficiais).toHaveLength(1);
    expect(salvar).toHaveBeenCalled();
    expect(gerarOrcamento).toHaveBeenCalled();
    expect(gravar).toHaveBeenCalled();
  });

  it('recupera replay após P2002 de idempotência', async () => {
    const gravada = { rodada: 1, itensOficiais: [] };
    const unitOfWork = {
      executar: jest.fn().mockRejectedValueOnce({
        code: 'P2002',
        meta: { modelName: 'IdempotencyRecord' },
      }),
    };
    const useCase = new ConcluirDiagnosticoInternoUseCase(
      {
        bloquearParaAtualizacao: jest.fn(),
        buscarPorId: jest.fn().mockResolvedValue(ordem),
      } as never,
      {} as never,
      unitOfWork as never,
      {} as never,
      {
        findReplay: jest.fn().mockResolvedValue({
          statusCode: 200,
          body: gravada,
        }),
      } as never,
      {} as never,
    );
    await expect(
      useCase.execute({
        ordemServicoId: 'os-1',
        rodada: 1,
        tarefaId: 't1',
        laudo: 'L',
        itens: [{ tipo: 'SERVICO', itemId: 's1', quantidade: 1 }],
        idempotencyKey: 'k1',
      }),
    ).resolves.toEqual(gravada);
  });

  it('reutiliza resposta idempotente', async () => {
    const bloqueada = { ordem };
    const unitOfWork = {
      executar: jest.fn((fn: (c: PrismaContextoTransacao) => unknown) =>
        fn(new PrismaContextoTransacao({ $queryRaw: jest.fn() } as never)),
      ),
    };
    const gravada = { rodada: 1, itensOficiais: [] };
    const useCase = new ConcluirDiagnosticoInternoUseCase(
      {
        bloquearParaAtualizacao: jest.fn().mockResolvedValue(bloqueada),
        salvar: jest.fn(),
      } as never,
      {} as never,
      unitOfWork as never,
      {} as never,
      {
        buscarNaTransacao: jest.fn().mockResolvedValue({
          statusCode: 200,
          body: gravada,
        }),
      } as never,
      {} as never,
    );
    await expect(
      useCase.execute({
        ordemServicoId: 'os-1',
        rodada: 1,
        tarefaId: 't1',
        laudo: 'L',
        itens: [{ tipo: 'SERVICO', itemId: 's1', quantidade: 1 }],
        idempotencyKey: 'k1',
      }),
    ).resolves.toEqual(gravada);
  });
});
