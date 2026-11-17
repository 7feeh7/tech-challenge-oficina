import { OrdemServico } from '@/modules/ordens-servico/domain/entities/ordem-servico.entity';
import { ItemPecaOrdem } from '@/modules/ordens-servico/domain/entities/item-ordem';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { montarItensDiagnostico } from './montar-itens-diagnostico';
import { ItemInvalidoInternoError } from '../domain/erros-internos';

describe('montarItensDiagnostico', () => {
  const catalogo = {
    buscarServicoParaDiagnostico: jest.fn(),
    buscarPecaParaDiagnostico: jest.fn(),
  };

  it('congela preço do catálogo e preserva preço de item mantido', async () => {
    const ordem = new OrdemServico({
      clienteId: 'c1',
      veiculoId: 'v1',
      status: StatusOS.EM_DIAGNOSTICO,
      pecas: [
        new ItemPecaOrdem({
          pecaId: 'p1',
          quantidade: 1,
          precoUnitario: 12.5,
        }),
      ],
    });

    catalogo.buscarPecaParaDiagnostico.mockResolvedValue({
      id: 'p1',
      nome: 'Pastilha',
      precoUnitario: 20,
      ativo: true,
    });

    const montado = await montarItensDiagnostico(ordem, catalogo, [
      { tipo: 'PECA', itemId: 'p1', quantidade: 2 },
    ]);

    expect(montado.pecas[0]?.precoUnitario).toBe(12.5);
    expect(montado.itensGerarOrcamento[0]?.precoUnitarioCentavos).toBe(1250);
    expect(montado.saida[0]?.nome).toBe('Pastilha');
  });

  it('monta serviço do catálogo', async () => {
    catalogo.buscarServicoParaDiagnostico.mockResolvedValue({
      id: 's1',
      nome: 'Troca óleo',
      precoUnitario: 80,
      ativo: true,
    });
    const montado = await montarItensDiagnostico(
      new OrdemServico({
        clienteId: 'c1',
        veiculoId: 'v1',
        status: StatusOS.EM_DIAGNOSTICO,
      }),
      catalogo,
      [{ tipo: 'SERVICO', itemId: 's1', quantidade: 1 }],
    );
    expect(montado.servicos[0]?.precoUnitario).toBe(80);
    expect(montado.saida[0]?.tipo).toBe('SERVICO');
  });

  it('recusa item inexistente', async () => {
    catalogo.buscarServicoParaDiagnostico.mockResolvedValue(null);
    await expect(
      montarItensDiagnostico(
        new OrdemServico({
          clienteId: 'c1',
          veiculoId: 'v1',
          status: StatusOS.EM_DIAGNOSTICO,
        }),
        catalogo,
        [{ tipo: 'SERVICO', itemId: 's9', quantidade: 1 }],
      ),
    ).rejects.toBeInstanceOf(ItemInvalidoInternoError);
  });

  it('recusa item inativo', async () => {
    catalogo.buscarPecaParaDiagnostico.mockResolvedValue({
      id: 'p9',
      nome: 'X',
      precoUnitario: 1,
      ativo: false,
    });

    await expect(
      montarItensDiagnostico(
        new OrdemServico({
          clienteId: 'c1',
          veiculoId: 'v1',
          status: StatusOS.EM_DIAGNOSTICO,
        }),
        catalogo,
        [{ tipo: 'PECA', itemId: 'p9', quantidade: 1 }],
      ),
    ).rejects.toBeInstanceOf(ItemInvalidoInternoError);
  });
});
