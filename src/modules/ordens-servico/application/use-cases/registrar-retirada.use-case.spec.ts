import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { StatusOS } from '../../domain/status-os';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { RegistrarRetiradaUseCase } from './registrar-retirada.use-case';
import { criarDetalheFake, criarGatewayMock } from './test-doubles';

describe('RegistrarRetiradaUseCase', () => {
  it('registra retirada via serviço centralizado', async () => {
    const gateway = criarGatewayMock();
    const transicoes = {
      aplicar: jest.fn().mockResolvedValue({ mudouStatus: true }),
      registrarMetricasDaMudanca: jest.fn(),
    } as unknown as jest.Mocked<TransicaoOrdemServicoService>;

    gateway.buscarDetalhePorId.mockResolvedValue(
      criarDetalheFake({ status: StatusOS.ENTREGUE }),
    );

    const useCase = new RegistrarRetiradaUseCase(
      gateway,
      new UnitOfWorkFake(),
      transicoes,
    );

    const result = await useCase.execute('uuid-os1');

    expect(transicoes.aplicar).toHaveBeenCalled();
    expect(result.status).toBe(StatusOS.ENTREGUE);
  });
});
