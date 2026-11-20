import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { EstoqueInsuficienteReservaError } from '../../domain/errors/reserva-estoque.errors';
import type { ReservaEstoqueGateway } from '../ports/reserva-estoque.gateway';
import { ReservarEstoqueUseCase } from './reservar-estoque.use-case';

describe('ReservarEstoqueUseCase', () => {
  const uow = new UnitOfWorkFake();

  const criarGateway = (): jest.Mocked<ReservaEstoqueGateway> => ({
    buscarIdempotencia: jest.fn().mockResolvedValue(null),
    gravarIdempotencia: jest.fn(),
    reservar: jest.fn().mockResolvedValue({
      grupoReservaId: 'grupo-1',
      prazoReferencia: null,
      linhas: [],
    }),
    liberar: jest.fn(),
    consumir: jest.fn(),
    listarLinhasAtivas: jest.fn(),
    ajustarFisicoAdministrativo: jest.fn(),
  });

  it('delega a reserva dentro do Unit of Work', async () => {
    const gateway = criarGateway();
    const useCase = new ReservarEstoqueUseCase(gateway, uow);

    await useCase.execute({
      ordemServicoId: 'os-1',
      rodada: 1,
      itens: [{ pecaId: 'p1', quantidade: 2 }],
    });

    expect(gateway.reservar).toHaveBeenCalled();
  });

  it('participa da transação do chamador sem abrir outra unidade de trabalho', async () => {
    const gateway = criarGateway();
    const unitOfWork = { executar: jest.fn() };
    const contextoExterno = {} as ContextoTransacao;
    const useCase = new ReservarEstoqueUseCase(gateway, unitOfWork);

    await useCase.execute(
      {
        ordemServicoId: 'os-1',
        rodada: 1,
        itens: [{ pecaId: 'p1', quantidade: 2 }],
      },
      contextoExterno,
    );

    expect(unitOfWork.executar).not.toHaveBeenCalled();
    expect(gateway.reservar).toHaveBeenCalledWith(
      contextoExterno,
      expect.objectContaining({ ordemServicoId: 'os-1' }),
    );
  });

  it('repete idempotente sem chamar reservar de novo', async () => {
    const gateway = criarGateway();
    gateway.buscarIdempotencia.mockResolvedValue({
      reutilizado: true,
      resultado: {
        grupoReservaId: 'grupo-1',
        prazoReferencia: null,
        linhas: [],
        reutilizado: true,
      },
    });

    const useCase = new ReservarEstoqueUseCase(gateway, uow);
    const out = await useCase.execute({
      ordemServicoId: 'os-1',
      rodada: 1,
      itens: [{ pecaId: 'p1', quantidade: 2 }],
      idempotencyKey: 'reserva:orc:1',
    });

    expect(out.reutilizado).toBe(true);
    expect(gateway.reservar).not.toHaveBeenCalled();
  });

  it('propaga estoque insuficiente', async () => {
    const gateway = criarGateway();
    gateway.reservar.mockRejectedValue(
      new EstoqueInsuficienteReservaError([
        { pecaId: 'p1', disponivelAtual: 1, solicitado: 3 },
      ]),
    );

    const useCase = new ReservarEstoqueUseCase(gateway, uow);

    await expect(
      useCase.execute({
        ordemServicoId: 'os-1',
        rodada: 1,
        itens: [{ pecaId: 'p1', quantidade: 3 }],
      }),
    ).rejects.toThrow(EstoqueInsuficienteReservaError);
  });
});
