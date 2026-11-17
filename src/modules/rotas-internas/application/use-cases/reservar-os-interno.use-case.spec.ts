import { ReservarOsInternoUseCase } from './reservar-os-interno.use-case';
import { OrdemServico } from '@/modules/ordens-servico/domain/entities/ordem-servico.entity';
import { ItemPecaOrdem } from '@/modules/ordens-servico/domain/entities/item-ordem';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { EstadoIncompativelInternaError } from '../../domain/erros-internos';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';

describe('ReservarOsInternoUseCase', () => {
  const prisma = {} as never;
  const clienteTransacao = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ now: new Date('2026-01-01T00:00:00Z') }]),
  };
  const unitOfWork = {
    executar: jest.fn((fn: (c: PrismaContextoTransacao) => unknown) =>
      fn(new PrismaContextoTransacao(clienteTransacao as never)),
    ),
  };

  it('recusa OS ausente', async () => {
    const useCase = new ReservarOsInternoUseCase(
      { bloquearParaAtualizacao: jest.fn().mockResolvedValue(null) } as never,
      unitOfWork as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      useCase.execute({
        ordemServicoId: 'x',
        rodada: 1,
        orcamentoId: 'o',
        idempotencyKey: 'k',
      }),
    ).rejects.toBeInstanceOf(OrdemServicoNaoEncontradaError);
  });

  it('recusa status diferente de AGUARDANDO_APROVACAO', async () => {
    const useCase = new ReservarOsInternoUseCase(
      {
        bloquearParaAtualizacao: jest.fn().mockResolvedValue({
          ordem: new OrdemServico({
            id: 'os-1',
            clienteId: 'c1',
            veiculoId: 'v1',
            status: StatusOS.EM_DIAGNOSTICO,
          }),
        }),
      } as never,
      unitOfWork as never,
      {} as never,
      {} as never,
      { buscarNaTransacao: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
    );
    await expect(
      useCase.execute({
        ordemServicoId: 'os-1',
        rodada: 1,
        orcamentoId: 'o1',
        idempotencyKey: 'k1',
      }),
    ).rejects.toBeInstanceOf(EstadoIncompativelInternaError);
  });

  it('reserva sem peças gera grupo local', async () => {
    const transicoes = { aplicar: jest.fn() };
    const useCase = new ReservarOsInternoUseCase(
      {
        bloquearParaAtualizacao: jest.fn().mockResolvedValue({
          ordem: new OrdemServico({
            id: 'os-1',
            clienteId: 'c1',
            veiculoId: 'v1',
            status: StatusOS.AGUARDANDO_APROVACAO,
          }),
        }),
      } as never,
      unitOfWork as never,
      transicoes as never,
      { execute: jest.fn() } as never,
      {
        buscarNaTransacao: jest.fn().mockResolvedValue(null),
        gravarNaTransacao: jest.fn(),
      } as never,
      prisma,
    );

    const saida = await useCase.execute({
      ordemServicoId: 'os-1',
      rodada: 1,
      orcamentoId: 'o1',
      idempotencyKey: 'k1',
    });

    expect(saida.prazoReferencia).toBe('2026-01-01T00:00:00.000Z');
    expect(saida.reservaId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('reutiliza resposta idempotente gravada', async () => {
    const gravada = {
      reservaId: 'g1',
      prazoReferencia: '2026-01-01T00:00:00.000Z',
    };
    const useCase = new ReservarOsInternoUseCase(
      {
        bloquearParaAtualizacao: jest.fn().mockResolvedValue({
          ordem: new OrdemServico({
            id: 'os-1',
            clienteId: 'c1',
            veiculoId: 'v1',
            status: StatusOS.AGUARDANDO_APROVACAO,
          }),
        }),
      } as never,
      unitOfWork as never,
      {} as never,
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
        orcamentoId: 'o1',
        idempotencyKey: 'k1',
      }),
    ).resolves.toEqual(gravada);
  });

  it('com peças delega ao caso de uso de estoque', async () => {
    const reservar = {
      execute: jest.fn().mockResolvedValue({
        grupoReservaId: 'grupo-1',
        reutilizado: false,
      }),
    };
    const useCase = new ReservarOsInternoUseCase(
      {
        bloquearParaAtualizacao: jest.fn().mockResolvedValue({
          ordem: new OrdemServico({
            id: 'os-1',
            clienteId: 'c1',
            veiculoId: 'v1',
            status: StatusOS.AGUARDANDO_APROVACAO,
            pecas: [
              new ItemPecaOrdem({
                pecaId: 'p1',
                quantidade: 2,
                precoUnitario: 10,
              }),
            ],
          }),
        }),
      } as never,
      unitOfWork as never,
      { aplicar: jest.fn() } as never,
      reservar as never,
      {
        buscarNaTransacao: jest.fn().mockResolvedValue(null),
        gravarNaTransacao: jest.fn(),
      } as never,
      prisma,
    );

    const saida = await useCase.execute({
      ordemServicoId: 'os-1',
      rodada: 1,
      orcamentoId: 'o1',
      idempotencyKey: 'k1',
    });
    expect(reservar.execute).toHaveBeenCalled();
    expect(saida.reservaId).toBe('grupo-1');
  });
});
