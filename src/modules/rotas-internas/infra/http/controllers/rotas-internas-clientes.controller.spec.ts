import { RotasInternasClientesController } from './rotas-internas-clientes.controller';

describe('RotasInternasClientesController', () => {
  it('consulta por CPF', async () => {
    const buscar = {
      execute: jest.fn().mockResolvedValue({ id: 'c1', ativo: true }),
    };
    const controller = new RotasInternasClientesController(buscar as never);
    await expect(controller.consultar('52998224725')).resolves.toEqual({
      id: 'c1',
      ativo: true,
    });
  });
});
