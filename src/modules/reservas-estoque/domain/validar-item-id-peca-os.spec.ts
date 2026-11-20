import { itemIdPecaEstruturalmenteValido } from './validar-item-id-peca-os';

describe('itemIdPecaEstruturalmenteValido', () => {
  it('aceita UUID v4 com espaços laterais', () => {
    expect(
      itemIdPecaEstruturalmenteValido(' 11111111-1111-4111-8111-111111111111 '),
    ).toBe(true);
  });

  it('rejeita texto que não é UUID', () => {
    expect(itemIdPecaEstruturalmenteValido('nao-uuid')).toBe(false);
  });
});
