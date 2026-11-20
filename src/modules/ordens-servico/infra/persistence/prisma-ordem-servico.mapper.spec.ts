import { TipoSugestaoItemOs as TipoSugestaoPrisma } from '@/shared/generated/prisma/enums';
import { StatusOS } from '../../domain/status-os';
import { PrismaOrdemServicoMapper } from './prisma-ordem-servico.mapper';

describe('PrismaOrdemServicoMapper', () => {
  it('mapeia sugestões de peça e serviço', () => {
    expect(
      PrismaOrdemServicoMapper.sugestaoToDomain({
        id: '1',
        tipo: TipoSugestaoPrisma.PECA,
        itemId: 'p1',
        quantidade: 2,
      }),
    ).toEqual({ tipo: 'PECA', itemId: 'p1', quantidade: 2 });

    expect(
      PrismaOrdemServicoMapper.sugestaoToDomain({
        id: '2',
        tipo: TipoSugestaoPrisma.SERVICO,
        itemId: 's1',
        quantidade: 1,
      }),
    ).toEqual({ tipo: 'SERVICO', itemId: 's1', quantidade: 1 });
  });

  it('mapeia itens oficiais e sugestões quando presentes', () => {
    const ordem = PrismaOrdemServicoMapper.toDomain({
      id: 'os-1',
      numero: 1,
      status: 'EM_DIAGNOSTICO',
      rodadaVigente: 1,
      prioridadeFila: 5,
      correlationId: 'corr',
      clienteId: 'c1',
      veiculoId: 'v1',
      descricaoProblema: 'Barulho',
      diagnostico: 'Correia',
      diagnosticoConcluidoEm: new Date(),
      etapaOrigemCancelamento: 'RECEBIDA',
      motivoEncerramento: null,
      veiculoLiberadoRetirada: true,
      devolvidaEm: null,
      prazoReferenciaReserva: new Date(),
      iniciadaEm: new Date(),
      finalizadaEm: null,
      entregueEm: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
      servicos: [
        {
          id: 'is1',
          servicoId: 's1',
          quantidade: 2,
          precoUnitario: 50,
        },
      ],
      pecas: [{ id: 'ip1', pecaId: 'p1', quantidade: 1, precoUnitario: 10 }],
      sugestoesItens: [
        {
          id: 'sg1',
          tipo: TipoSugestaoPrisma.SERVICO,
          itemId: 's0',
          quantidade: 1,
        },
      ],
    });

    expect(ordem.servicos).toHaveLength(1);
    expect(ordem.pecas).toHaveLength(1);
    expect(ordem.sugestoes).toHaveLength(1);
    expect(ordem.etapaOrigemCancelamento).toBe(StatusOS.RECEBIDA);
  });

  it('mapeia domínio com itens e sugestões opcionais', () => {
    const ordem = PrismaOrdemServicoMapper.toDomain({
      id: 'os-1',
      numero: 1,
      status: 'RECEBIDA',
      rodadaVigente: 1,
      prioridadeFila: 6,
      correlationId: 'corr',
      clienteId: 'c1',
      veiculoId: 'v1',
      descricaoProblema: null,
      diagnostico: null,
      diagnosticoConcluidoEm: null,
      etapaOrigemCancelamento: null,
      motivoEncerramento: null,
      veiculoLiberadoRetirada: false,
      devolvidaEm: null,
      prazoReferenciaReserva: null,
      iniciadaEm: null,
      finalizadaEm: null,
      entregueEm: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });

    expect(ordem.status).toBe(StatusOS.RECEBIDA);
    expect(ordem.sugestoes).toEqual([]);
    expect(ordem.servicos).toEqual([]);
  });

  it('converte tipos para o Prisma', () => {
    expect(PrismaOrdemServicoMapper.toTipoSugestaoPrisma('PECA')).toBe(
      TipoSugestaoPrisma.PECA,
    );
    expect(PrismaOrdemServicoMapper.toTipoSugestaoPrisma('SERVICO')).toBe(
      TipoSugestaoPrisma.SERVICO,
    );
  });
});
