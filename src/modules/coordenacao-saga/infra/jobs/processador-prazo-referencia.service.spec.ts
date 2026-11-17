import { ProcessadorPrazoReferenciaService } from './processador-prazo-referencia.service';

describe('ProcessadorPrazoReferenciaService', () => {
  it('não agenda intervalo quando desabilitado', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'PRAZO_REFERENCIA_VERIFICADOR_HABILITADO' ? 'false' : '10',
      ),
    };
    const service = new ProcessadorPrazoReferenciaService(
      config as never,
      { reivindicarElegiveis: jest.fn() } as never,
      { emitirConsultaVigente: jest.fn() } as never,
      { executar: jest.fn() } as never,
      {} as never,
    );
    const agendar = jest.spyOn(global, 'setInterval');
    service.onModuleInit();
    expect(agendar).not.toHaveBeenCalled();
    agendar.mockRestore();
  });
});
