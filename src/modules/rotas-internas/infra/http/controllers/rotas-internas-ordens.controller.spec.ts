import { RotasInternasOrdensController } from './rotas-internas-ordens.controller';

describe('RotasInternasOrdensController', () => {
  it('delega aos casos de uso', async () => {
    const concluir = { execute: jest.fn().mockResolvedValue({ ok: true }) };
    const reservar = {
      execute: jest.fn().mockResolvedValue({ reservaId: 'r1' }),
    };
    const controller = new RotasInternasOrdensController(
      concluir as never,
      reservar as never,
    );
    await controller.concluirDiagnosticoRota(
      'os-1',
      {
        rodada: 1,
        tarefaId: 't1',
        laudo: 'L',
        itens: [{ tipo: 'SERVICO', itemId: 's1', quantidade: 1 }],
      },
      'k1',
    );
    await controller.reservar('os-1', { rodada: 1, orcamentoId: 'o1' }, 'k2');
    expect(concluir.execute).toHaveBeenCalled();
    expect(reservar.execute).toHaveBeenCalled();
  });
});
