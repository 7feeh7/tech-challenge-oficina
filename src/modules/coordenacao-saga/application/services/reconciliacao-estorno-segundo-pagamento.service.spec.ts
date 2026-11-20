import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import type { EnvelopeMensagem } from '@/shared/messaging/envelope';
import { ReconciliacaoEstornoSegundoPagamentoService } from './reconciliacao-estorno-segundo-pagamento.service';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

const INSTANTE_BANCO = new Date('2026-11-19T12:00:00Z');
jest.mock('@/shared/database/obter-instante-banco', () => ({
  obterInstanteBanco: () => Promise.resolve(new Date('2026-11-19T12:00:00Z')),
}));

const contexto = {
  __contextoTransacao: Symbol(),
} as unknown as ContextoTransacao;

describe('ReconciliacaoEstornoSegundoPagamentoService', () => {
  const payloadEstorno = {
    cobrancaId: 'cob-1',
    orderId: 'ORD-2',
    valorEstornadoCentavos: 500,
    tipoEstorno: 'INTEGRAL',
    estornadoEm: '2026-11-19T10:00:00.000Z',
    statusOrderMercadoPago: 'refunded',
    origemEstorno: 'SEGUNDO_PAGAMENTO',
  };

  const envelope = (
    payload: Record<string, unknown>,
    eventId = 'e-1',
  ): EnvelopeMensagem => ({
    eventId,
    eventType: 'billing.estorno-concluido.v1',
    version: 1,
    occurredAt: '2026-11-19T10:00:00.000Z',
    source: 'billing',
    correlationId: 'corr-1',
    causationId: null,
    ordemServicoId: 'os-1',
    rodada: 1,
    payload,
  });

  const montar = () => {
    const prisma = {
      pendenciaOs: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const logger = { logWithMeta: jest.fn() };
    const service = new ReconciliacaoEstornoSegundoPagamentoService(
      prisma as never,
      logger as never,
    );
    return { service, prisma, logger };
  };

  describe('registrarEstorno', () => {
    it('busca a pendência pela OS, rodada e orderId, aberta ou resolvida', async () => {
      const { service, prisma } = montar();

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno),
        StatusOS.EM_EXECUCAO,
        false,
      );

      expect(prisma.pendenciaOs.findFirst).toHaveBeenCalledWith({
        where: {
          ordemServicoId: 'os-1',
          rodada: 1,
          tipo: 'FINANCEIRA',
          detalhes: { path: ['orderId'], equals: 'ORD-2' },
        },
        orderBy: { criadoEm: 'asc' },
      });
    });

    it('cria a pendência aberta com a evidência fora de CANCELADA e ENTREGUE', async () => {
      const { service, prisma, logger } = montar();

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno),
        StatusOS.AGUARDANDO_PAGAMENTO,
        false,
      );

      expect(prisma.pendenciaOs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resolvida: false,
          resolvidaEm: null,
          detalhes: expect.objectContaining({
            natureza: 'SEGUNDO_PAGAMENTO',
            orderId: 'ORD-2',
            cobrancaId: 'cob-1',
            eventId: 'e-1',
          }),
        }),
      });
      expect(logger.logWithMeta).not.toHaveBeenCalled();
    });

    it('cria a pendência já resolvida, com o instante do banco, em ENTREGUE', async () => {
      const { service, prisma } = montar();

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno),
        StatusOS.ENTREGUE,
        false,
      );

      expect(prisma.pendenciaOs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resolvida: true,
          resolvidaEm: INSTANTE_BANCO,
        }),
      });
    });

    it('omite a cobrança ausente do payload na pendência criada', async () => {
      const { service, prisma } = montar();

      await service.registrarEstorno(
        contexto,
        envelope({ ...payloadEstorno, cobrancaId: undefined }),
        StatusOS.EM_EXECUCAO,
        false,
      );

      const { detalhes } = prisma.pendenciaOs.create.mock.calls[0][0].data;
      expect(detalhes).not.toHaveProperty('cobrancaId');
    });

    it('avisa, sem dados pessoais, quando a OS já aceitou a order como paga', async () => {
      const { service, prisma, logger } = montar();

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno),
        StatusOS.AGUARDANDO_EXECUCAO,
        true,
      );

      expect(prisma.pendenciaOs.create).toHaveBeenCalledTimes(1);
      expect(logger.logWithMeta).toHaveBeenCalledWith(
        'warn',
        'saga.estorno-segundo-pagamento.order-aceita-como-pagamento',
        {
          eventId: 'e-1',
          orderId: 'ORD-2',
          cobrancaId: 'cob-1',
          status: StatusOS.AGUARDANDO_EXECUCAO,
          rodada: 1,
        },
        'CoordenacaoSaga',
      );
    });

    it('grava a evidência na pendência existente sem resolvê-la fora de CANCELADA e ENTREGUE', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        resolvida: false,
        detalhes: { natureza: 'SEGUNDO_PAGAMENTO', orderId: 'ORD-2' },
      });

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno),
        StatusOS.FINALIZADA,
        false,
      );

      expect(prisma.pendenciaOs.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: {
          detalhes: expect.objectContaining({
            natureza: 'SEGUNDO_PAGAMENTO',
            evidenciaEstornoBilling: expect.objectContaining({
              eventId: 'e-1',
              tipoEstorno: 'INTEGRAL',
            }),
          }),
        },
      });
      expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
    });

    it('resolve a pendência aberta, mesmo sem natureza, em CANCELADA', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        resolvida: false,
        detalhes: { orderId: 'ORD-2', motivo: 'Segundo pagamento' },
      });

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno),
        StatusOS.CANCELADA,
        false,
      );

      expect(prisma.pendenciaOs.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: {
          detalhes: expect.objectContaining({
            natureza: 'SEGUNDO_PAGAMENTO',
            motivo: 'Segundo pagamento',
            evidenciaEstornoBilling: expect.any(Object),
          }),
          resolvida: true,
          resolvidaEm: INSTANTE_BANCO,
        },
      });
    });

    it('só resolve quando a evidência integral já estava gravada por outro evento', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        resolvida: false,
        detalhes: {
          natureza: 'SEGUNDO_PAGAMENTO',
          orderId: 'ORD-2',
          evidenciaEstornoBilling: { eventId: 'e-0', tipoEstorno: 'INTEGRAL' },
        },
      });

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno, 'e-2'),
        StatusOS.ENTREGUE,
        false,
      );

      expect(prisma.pendenciaOs.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { resolvida: true, resolvidaEm: INSTANTE_BANCO },
      });
    });

    it('é no-op na reentrega com a pendência já resolvida', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        resolvida: true,
        detalhes: {
          natureza: 'SEGUNDO_PAGAMENTO',
          orderId: 'ORD-2',
          evidenciaEstornoBilling: { eventId: 'e-1', tipoEstorno: 'INTEGRAL' },
        },
      });

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno),
        StatusOS.CANCELADA,
        false,
      );

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
      expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
    });
  });

  describe('cobrancaId divergente', () => {
    const pendenciaDaCobranca = (cobrancaId?: string) => ({
      id: 'p-1',
      resolvida: false,
      detalhes: {
        natureza: 'SEGUNDO_PAGAMENTO',
        orderId: 'ORD-2',
        ...(cobrancaId ? { cobrancaId } : {}),
      },
    });
    const pagamento = { cobrancaId: 'cob-outra', orderId: 'ORD-2' };

    it('recusa o estorno com cobrança diferente da pendência, sem escrita', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue(
        pendenciaDaCobranca('cob-1'),
      );

      await expect(
        service.registrarEstorno(
          contexto,
          envelope({ ...payloadEstorno, cobrancaId: 'cob-outra' }),
          StatusOS.CANCELADA,
          false,
        ),
      ).rejects.toBeInstanceOf(ErroMensagemPermanente);

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
      expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
    });

    it('recusa o pagamento com cobrança diferente da pendência, sem escrita', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue(
        pendenciaDaCobranca('cob-1'),
      );

      await expect(
        service.registrarPagamentoPosterior(
          contexto,
          envelope(pagamento, 'e-pag'),
          pagamento,
        ),
      ).rejects.toBeInstanceOf(ErroMensagemPermanente);

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('não é divergência quando a pendência não tem cobrança', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue(pendenciaDaCobranca());

      await service.registrarEstorno(
        contexto,
        envelope(payloadEstorno),
        StatusOS.EM_EXECUCAO,
        false,
      );

      expect(prisma.pendenciaOs.update).toHaveBeenCalledTimes(1);
    });

    it('não é divergência quando o fato não traz cobrança', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue(
        pendenciaDaCobranca('cob-1'),
      );

      await service.registrarEstorno(
        contexto,
        envelope({ ...payloadEstorno, cobrancaId: undefined }),
        StatusOS.EM_EXECUCAO,
        false,
      );
      await service.registrarPagamentoPosterior(
        contexto,
        envelope({ orderId: 'ORD-2' }, 'e-pag'),
        { orderId: 'ORD-2' },
      );

      expect(prisma.pendenciaOs.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('possuiEvidenciaDaOrder', () => {
    it('é falso sem pendência da order', async () => {
      const { service } = montar();

      expect(
        await service.possuiEvidenciaDaOrder(contexto, 'os-1', 1, 'ORD-2'),
      ).toBe(false);
    });

    it('é falso com a pendência da order ainda sem evidência', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        detalhes: { orderId: 'ORD-2' },
      });

      expect(
        await service.possuiEvidenciaDaOrder(contexto, 'os-1', 1, 'ORD-2'),
      ).toBe(false);
    });

    it('é verdadeiro com a evidência gravada na pendência da order', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        detalhes: {
          natureza: 'SEGUNDO_PAGAMENTO',
          orderId: 'ORD-2',
          evidenciaEstornoBilling: { eventId: 'e-1' },
        },
      });

      expect(
        await service.possuiEvidenciaDaOrder(contexto, 'os-1', 1, 'ORD-2'),
      ).toBe(true);
    });
  });

  describe('registrarPagamentoPosterior', () => {
    const pagamento = {
      cobrancaId: 'cob-1',
      orderId: 'ORD-2',
      valorCentavos: 500,
    };

    it('não faz nada sem a pendência da order', async () => {
      const { service, prisma } = montar();

      await service.registrarPagamentoPosterior(
        contexto,
        envelope(pagamento, 'e-pag'),
        pagamento,
      );

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('completa a pendência com o pagamento sem apagar as demais chaves', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        detalhes: { orderId: 'ORD-2', motivo: 'm' },
      });

      await service.registrarPagamentoPosterior(
        contexto,
        envelope(pagamento, 'e-pag'),
        pagamento,
      );

      expect(prisma.pendenciaOs.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: {
          detalhes: {
            orderId: 'ORD-2',
            motivo: 'm',
            cobrancaId: 'cob-1',
            pagamentoConfirmado: {
              eventId: 'e-pag',
              cobrancaId: 'cob-1',
              valorCentavos: 500,
            },
          },
        },
      });
    });

    it('mantém a cobrança já gravada na pendência quando coincide com a do pagamento', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        detalhes: { orderId: 'ORD-2', cobrancaId: 'cob-1' },
      });

      await service.registrarPagamentoPosterior(
        contexto,
        envelope(pagamento, 'e-pag'),
        pagamento,
      );

      const { detalhes } = prisma.pendenciaOs.update.mock.calls[0][0].data;
      expect(detalhes.cobrancaId).toBe('cob-1');
    });

    it('é no-op quando o pagamento já foi registrado na pendência', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        detalhes: { orderId: 'ORD-2', pagamentoConfirmado: { eventId: 'e-0' } },
      });

      await service.registrarPagamentoPosterior(
        contexto,
        envelope(pagamento, 'e-pag'),
        pagamento,
      );

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });
  });
  describe('registrarSegundoPagamento', () => {
    const pagamento = {
      cobrancaId: 'cob-1',
      orderId: 'ORD-2',
      valorCentavos: 500,
    };
    const evidencia = { eventId: 'e-0', tipoEstorno: 'INTEGRAL' };

    it('abre a pendência SEGUNDO_PAGAMENTO da order, sem resolvê-la, quando não existe', async () => {
      const { service, prisma } = montar();

      await service.registrarSegundoPagamento(
        contexto,
        envelope(pagamento, 'e-pag'),
        pagamento,
        StatusOS.CANCELADA,
      );

      expect(prisma.pendenciaOs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ordemServicoId: 'os-1',
          rodada: 1,
          tipo: 'FINANCEIRA',
          detalhes: expect.objectContaining({
            natureza: 'SEGUNDO_PAGAMENTO',
            orderId: 'ORD-2',
            cobrancaId: 'cob-1',
            eventId: 'e-pag',
            pagamentoConfirmado: {
              eventId: 'e-pag',
              cobrancaId: 'cob-1',
              valorCentavos: 500,
            },
          }),
        }),
      });
      const { data } = prisma.pendenciaOs.create.mock.calls[0][0];
      expect(data.resolvida).toBeUndefined();
      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('omite a cobrança ausente do pagamento na pendência criada', async () => {
      const { service, prisma } = montar();
      const semCobranca = { orderId: 'ORD-2' };

      await service.registrarSegundoPagamento(
        contexto,
        envelope(semCobranca, 'e-pag'),
        semCobranca,
        StatusOS.EM_EXECUCAO,
      );

      const { detalhes } = prisma.pendenciaOs.create.mock.calls[0][0].data;
      expect(detalhes).not.toHaveProperty('cobrancaId');
    });

    it('completa a pendência criada antecipadamente pelo estorno sem abrir outra', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        resolvida: false,
        detalhes: {
          natureza: 'SEGUNDO_PAGAMENTO',
          orderId: 'ORD-2',
          cobrancaId: 'cob-1',
          evidenciaEstornoBilling: evidencia,
        },
      });

      await service.registrarSegundoPagamento(
        contexto,
        envelope(pagamento, 'e-pag'),
        pagamento,
        StatusOS.EM_EXECUCAO,
      );

      expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
      expect(prisma.pendenciaOs.update).toHaveBeenCalledTimes(1);
      expect(prisma.pendenciaOs.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: {
          detalhes: expect.objectContaining({
            evidenciaEstornoBilling: evidencia,
            pagamentoConfirmado: {
              eventId: 'e-pag',
              cobrancaId: 'cob-1',
              valorCentavos: 500,
            },
          }),
        },
      });
    });

    it.each([StatusOS.CANCELADA, StatusOS.ENTREGUE])(
      'resolve em %s a pendência aberta que já tinha a evidência integral do estorno',
      async (status) => {
        const { service, prisma } = montar();
        prisma.pendenciaOs.findFirst.mockResolvedValue({
          id: 'p-1',
          resolvida: false,
          detalhes: {
            natureza: 'SEGUNDO_PAGAMENTO',
            orderId: 'ORD-2',
            evidenciaEstornoBilling: evidencia,
          },
        });

        await service.registrarSegundoPagamento(
          contexto,
          envelope(pagamento, 'e-pag'),
          pagamento,
          status,
        );

        expect(prisma.pendenciaOs.update).toHaveBeenLastCalledWith({
          where: { id: 'p-1' },
          data: { resolvida: true, resolvidaEm: INSTANTE_BANCO },
        });
      },
    );

    it('mantém aberta em CANCELADA a pendência ainda sem evidência do estorno', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        resolvida: false,
        detalhes: { natureza: 'SEGUNDO_PAGAMENTO', orderId: 'ORD-2' },
      });

      await service.registrarSegundoPagamento(
        contexto,
        envelope(pagamento, 'e-pag'),
        pagamento,
        StatusOS.CANCELADA,
      );

      for (const [chamada] of prisma.pendenciaOs.update.mock.calls) {
        expect(chamada.data).not.toHaveProperty('resolvida');
      }
    });

    it('é no-op na reentrega e na duplicata com a pendência já resolvida', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        resolvida: true,
        detalhes: {
          natureza: 'SEGUNDO_PAGAMENTO',
          orderId: 'ORD-2',
          evidenciaEstornoBilling: evidencia,
          pagamentoConfirmado: { eventId: 'e-0' },
        },
      });

      await service.registrarSegundoPagamento(
        contexto,
        envelope(pagamento, 'e-pag'),
        pagamento,
        StatusOS.CANCELADA,
      );

      expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('recusa o pagamento com cobrança diferente da pendência, sem escrita', async () => {
      const { service, prisma } = montar();
      prisma.pendenciaOs.findFirst.mockResolvedValue({
        id: 'p-1',
        resolvida: false,
        detalhes: { orderId: 'ORD-2', cobrancaId: 'cob-outra' },
      });

      await expect(
        service.registrarSegundoPagamento(
          contexto,
          envelope(pagamento, 'e-pag'),
          pagamento,
          StatusOS.EM_EXECUCAO,
        ),
      ).rejects.toBeInstanceOf(ErroMensagemPermanente);

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
      expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
    });
  });
});
