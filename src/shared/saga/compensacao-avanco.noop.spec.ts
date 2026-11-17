import { CompensacaoAvancoNoop } from './compensacao-avanco.port';

describe('CompensacaoAvancoNoop', () => {
  it('não executa efeitos', async () => {
    const noop = new CompensacaoAvancoNoop();
    await expect(
      noop.avancarAposEntradaEmCancelamento(
        {},
        {
          ordemServicoId: 'id',
          rodada: 1,
          causationId: 'c',
        },
      ),
    ).resolves.toBeUndefined();
  });
});
