import { consultaIdExcecaoE10 } from './consulta-financeira';

describe('consulta-financeira', () => {
  it('gera consultaId determinístico para exceção E10', () => {
    expect(consultaIdExcecaoE10('os-1', 2)).toBe('os-1#2#excecao-e10#1');
    expect(consultaIdExcecaoE10('os-1', 2, 3)).toBe('os-1#2#excecao-e10#3');
  });
});
