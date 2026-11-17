import { consolidarItensQuantidade } from './consolidar-itens-quantidade';

describe('consolidarItensQuantidade', () => {
  it('soma itens iguais e ordena', () => {
    expect(
      consolidarItensQuantidade([
        { itemId: 'b', quantidade: 1 },
        { itemId: 'a', quantidade: 2 },
        { itemId: 'a', quantidade: 1 },
      ]),
    ).toEqual([
      { itemId: 'a', quantidade: 3 },
      { itemId: 'b', quantidade: 1 },
    ]);
  });

  it('ignora itemId vazio e quantidade negativa', () => {
    expect(
      consolidarItensQuantidade([
        { itemId: '', quantidade: 2 },
        { itemId: 'a', quantidade: -1 },
        { itemId: 'a', quantidade: 1 },
      ]),
    ).toEqual([{ itemId: 'a', quantidade: 1 }]);
  });

  it('retorna lista vazia sem entradas válidas', () => {
    expect(consolidarItensQuantidade([])).toEqual([]);
  });
});
