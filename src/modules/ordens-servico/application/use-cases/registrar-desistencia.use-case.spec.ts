import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { StatusOS } from '../../domain/status-os';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { RegistrarDesistenciaUseCase } from './registrar-desistencia.use-case';
import { criarDetalheFake, criarGatewayMock } from './test-doubles';

describe('RegistrarDesistenciaUseCase', () => {
  it('registra desistência via serviço centralizado', async () => {
    const gateway = criarGatewayMock();
    const transicoes = {
      aplicar: jest.fn().mockResolvedValue({ mudouStatus: true }),
      registrarMetricasDaMudanca: jest.fn(),
    } as unknown as jest.Mocked<TransicaoOrdemServicoService>;

    gateway.buscarDetalhePorId.mockResolvedValue(
      criarDetalheFake({ status: StatusOS.EM_CANCELAMENTO }),
    );

    const useCase = new RegistrarDesistenciaUseCase(
      gateway,
      new UnitOfWorkFake(),
      transicoes,
    );

    const result = await useCase.execute('uuid-os1', { motivo: 'Desistiu' });

    expect(transicoes.aplicar).toHaveBeenCalled();
    expect(result.status).toBe(StatusOS.EM_CANCELAMENTO);
  });
});
