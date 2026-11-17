import { BuscarClienteCpfInternoUseCase } from './buscar-cliente-cpf-interno.use-case';
import { ClienteNaoEncontradoInternoError } from '../../domain/erros-internos';
import { criarClienteFake } from '@/modules/clientes/application/use-cases/test-doubles';

describe('BuscarClienteCpfInternoUseCase', () => {
  it('retorna id e ativo', async () => {
    const clientes = {
      buscarPorCpf: jest
        .fn()
        .mockResolvedValue(criarClienteFake({ id: 'c1', ativo: true })),
    };
    const useCase = new BuscarClienteCpfInternoUseCase(clientes);
    await expect(useCase.execute('52998224725')).resolves.toEqual({
      id: 'c1',
      ativo: true,
    });
  });

  it('recusa CPF sem cliente', async () => {
    const useCase = new BuscarClienteCpfInternoUseCase({
      buscarPorCpf: jest.fn().mockResolvedValue(null),
    } as never);
    await expect(useCase.execute('52998224725')).rejects.toBeInstanceOf(
      ClienteNaoEncontradoInternoError,
    );
  });
});
