import { ConsultaFinanceiraIndisponivelError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { SolicitarConsultaFinanceiraUseCase } from './solicitar-consulta-financeira.use-case';

describe('SolicitarConsultaFinanceiraUseCase', () => {
  const unitOfWork = {
    executar: jest.fn((fn: (ctx: unknown) => unknown) => fn({})),
  };
  const consulta = {
    emitirConsultaVigente: jest.fn(),
  };

  const useCase = new SolicitarConsultaFinanceiraUseCase(
    unitOfWork as never,
    consulta as never,
  );

  it('propaga indisponível como erro de conflito', async () => {
    consulta.emitirConsultaVigente.mockResolvedValue('indisponivel');
    await expect(useCase.execute('os-1')).rejects.toBeInstanceOf(
      ConsultaFinanceiraIndisponivelError,
    );
  });

  it('retorna resultado emitida', async () => {
    consulta.emitirConsultaVigente.mockResolvedValue('emitida');
    await expect(useCase.execute('os-1')).resolves.toEqual({
      resultado: 'emitida',
    });
  });
});