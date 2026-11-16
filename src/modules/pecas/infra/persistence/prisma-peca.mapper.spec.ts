import { criarPecaFake } from '../../application/use-cases/test-doubles';
import { PrismaPecaMapper } from './prisma-peca.mapper';

describe('PrismaPecaMapper', () => {
  it('toPersistenceParcial omite quantidadeEstoque quando não alterada', () => {
    const peca = criarPecaFake();
    peca.alterarNome('Novo nome');

    const data = PrismaPecaMapper.toPersistenceParcial(peca, {
      nome: 'Novo nome',
    });

    expect(data).toEqual({ nome: 'Novo nome' });
    expect(data).not.toHaveProperty('quantidadeEstoque');
  });

  it('toPersistenceParcial inclui somente ativo quando só ativo mudou', () => {
    const peca = criarPecaFake();
    peca.desativar();

    const data = PrismaPecaMapper.toPersistenceParcial(peca, { ativo: false });

    expect(data).toEqual({ ativo: false });
  });

  it('toPersistenceParcial inclui descrição e estoque mínimo quando alterados', () => {
    const peca = criarPecaFake();
    peca.alterarDescricao('Nova');
    peca.alterarEstoqueMinimo(4);

    const data = PrismaPecaMapper.toPersistenceParcial(peca, {
      descricao: 'Nova',
      estoqueMinimo: 4,
    });

    expect(data).toMatchObject({
      descricao: 'Nova',
      estoqueMinimo: 4,
    });
  });
});
