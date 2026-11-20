import { PrismaReservaEstoqueMapper } from './prisma-reserva-estoque.mapper';

describe('PrismaReservaEstoqueMapper', () => {
  it('mapeia linha de reserva', () => {
    const linha = PrismaReservaEstoqueMapper.toLinha({
      id: 'r1',
      grupoReservaId: 'g1',
      ordemServicoId: 'os',
      rodada: 1,
      pecaId: 'p1',
      quantidade: 2,
      quantidadeConsumida: 0,
      situacao: 'ATIVA',
      prazoReferencia: null,
    });

    expect(linha.pecaId).toBe('p1');
    expect(linha.quantidade).toBe(2);
  });
});
