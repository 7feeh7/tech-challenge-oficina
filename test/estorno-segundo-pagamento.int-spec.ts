import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import { ResolverPendenciaManualUseCase } from '@/modules/coordenacao-saga/application/use-cases/resolver-pendencia-manual.use-case';
import { RegistrarRetiradaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-retirada.use-case';
import { PrismaService } from '@/shared/database/prisma.service';
import { StatusOS } from '@/shared/generated/prisma/enums';
import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_INICIAR_REPARO,
  EVENTO_ESTORNO_CONCLUIDO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_PAGAMENTO_TARDIO_REGISTRADO,
  EVENTO_PENDENCIA_RESOLVIDA,
  EVENTO_REPARO_INICIADO,
  EVENTO_RESPOSTA_CANCELAMENTO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} from '@/shared/messaging/envelope';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';
import {
  cobrancaCriada,
  contarOutboxSaga,
  criarCatalogoSaga,
  criarModuloSaga,
  criarPecaSaga,
  entregar,
  iniciarEConcluirReparo,
  obterServicosSaga,
  pagamentoConfirmado,
  payloadDoExemploBilling,
  payloadDoExemploExecution,
  prepararAguardandoPagamento,
  statusDaOs,
  type CatalogoSaga,
  type OsEmAndamento,
  type ServicosSaga,
} from './helpers/jornada-saga-os';

/**
 * `EstornoConcluido` de segundo pagamento (`origemEstorno = SEGUNDO_PAGAMENTO`)
 * e `PagamentoConfirmado` da mesma order em qualquer ordem de chegada
 * (06-saga, decisão de 2026-11-19).
 */
describe('Saga — estorno do segundo pagamento e pagamento em qualquer ordem (integração)', () => {
  let modulo: TestingModule;
  let servicos: ServicosSaga;
  let prisma: PrismaService;
  let catalogo: CatalogoSaga;
  let pecaId: string;
  let resolver: ResolverPendenciaManualUseCase;
  let responsavelId: string;

  beforeAll(async () => {
    modulo = await criarModuloSaga();
    servicos = obterServicosSaga(modulo);
    prisma = servicos.prisma;
    catalogo = await criarCatalogoSaga(prisma, 'estorno-segundo-pagamento');
    pecaId = await criarPecaSaga(prisma, 'estorno-segundo-pagamento');
    resolver = modulo.get(ResolverPendenciaManualUseCase, { strict: false });
    responsavelId = (
      await prisma.usuario.create({
        data: {
          nome: 'Admin estorno segundo pagamento',
          email: `admin-estorno-segundo-pagamento+${randomUUID()}@oficina.test`,
          senhaHash: 'hash-nao-usado',
          perfil: 'ADMINISTRADOR',
          ativo: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.pendenciaOs.updateMany({
      where: { resolvidaPorId: responsavelId },
      data: { resolvidaPorId: null },
    });
    await prisma.usuario.delete({ where: { id: responsavelId } });
    await fecharModuloIntegracao(modulo);
  });

  // Fixo para a reentrega do mesmo evento ter o mesmo conteúdo.
  const OCORRIDO_EM = '2026-11-19T10:01:00.000Z';

  interface Cenario {
    os: OsEmAndamento;
    cobrancaId: string;
    orderLegitima: string;
    orderSegundoPagamento: string;
    eventoEstorno: string;
    eventoPagamento: string;
  }

  const orderNova = () => `ORD-${randomUUID().slice(0, 12)}`;

  const preparar = async (status: StatusOS): Promise<Cenario> => {
    const os = await prepararAguardandoPagamento(servicos, catalogo, [
      { pecaId, quantidade: 1 },
    ]);
    const cenario: Cenario = {
      os,
      cobrancaId: randomUUID(),
      orderLegitima: orderNova(),
      orderSegundoPagamento: orderNova(),
      eventoEstorno: randomUUID(),
      eventoPagamento: randomUUID(),
    };
    await cobrancaCriada(
      servicos,
      os,
      cenario.cobrancaId,
      cenario.orderLegitima,
    );
    if (status !== StatusOS.AGUARDANDO_PAGAMENTO) {
      await levarAte(cenario, status);
    }
    expect(await statusDaOs(prisma, os.osId)).toBe(status);
    return cenario;
  };

  const levarAte = async (cenario: Cenario, status: StatusOS) => {
    const { os } = cenario;
    await pagamentoConfirmado(
      servicos,
      os,
      cenario.cobrancaId,
      cenario.orderLegitima,
    );
    switch (status) {
      case StatusOS.EM_EXECUCAO:
        await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
          tarefaId: `${os.osId}#1#REPARO`,
        });
        break;
      case StatusOS.FINALIZADA:
        await iniciarEConcluirReparo(servicos, os, [
          { itemId: pecaId, quantidade: 1 },
        ]);
        break;
      case StatusOS.ENTREGUE:
        await iniciarEConcluirReparo(servicos, os, [
          { itemId: pecaId, quantidade: 1 },
        ]);
        await modulo
          .get(RegistrarRetiradaUseCase, { strict: false })
          .execute(os.osId);
        break;
      case StatusOS.EM_CANCELAMENTO:
        await servicos.desistir.execute(os.osId, { motivo: 'Desistência' });
        break;
      case StatusOS.CANCELADA:
        await servicos.desistir.execute(os.osId, { motivo: 'Desistência' });
        await entregar(
          servicos,
          os,
          EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
          payloadDoExemploExecution(
            'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1',
          ),
        );
        await entregar(
          servicos,
          os,
          EVENTO_RESPOSTA_CANCELAMENTO,
          payloadDoExemploBilling(
            'billing.resposta-cancelamento-financeiro.v1',
          ),
        );
        break;
      default:
        break;
    }
  };

  const estorno = (
    cenario: Cenario,
    payload: Record<string, unknown> = {},
    eventId = cenario.eventoEstorno,
  ) =>
    entregar(
      servicos,
      cenario.os,
      EVENTO_ESTORNO_CONCLUIDO,
      {
        cobrancaId: cenario.cobrancaId,
        orderId: cenario.orderSegundoPagamento,
        valorEstornadoCentavos: 50000,
        estornadoEm: '2026-11-19T10:00:00.000Z',
        tipoEstorno: 'INTEGRAL',
        statusOrderMercadoPago: 'refunded',
        origemEstorno: 'SEGUNDO_PAGAMENTO',
        ...payload,
      },
      1,
      eventId,
      OCORRIDO_EM,
    );

  const pagamentoDoSegundo = (
    cenario: Cenario,
    eventId = cenario.eventoPagamento,
    cobrancaId = cenario.cobrancaId,
  ) =>
    entregar(
      servicos,
      cenario.os,
      EVENTO_PAGAMENTO_CONFIRMADO,
      {
        cobrancaId,
        orderId: cenario.orderSegundoPagamento,
        aprovadoEm: '2026-11-19T09:59:00.000Z',
        valorCentavos: 50000,
      },
      1,
      eventId,
      OCORRIDO_EM,
    );

  const pendenciasFinanceiras = (cenario: Cenario) =>
    prisma.pendenciaOs.findMany({
      where: { ordemServicoId: cenario.os.osId, tipo: 'FINANCEIRA' },
      orderBy: { criadoEm: 'asc' },
    });

  const pendenciasDaOrder = async (cenario: Cenario) =>
    (await pendenciasFinanceiras(cenario)).filter(
      (p) =>
        (p.detalhes as { orderId?: string }).orderId ===
        cenario.orderSegundoPagamento,
    );

  const estoque = async () => ({
    peca: await prisma.peca.findUniqueOrThrow({
      where: { id: pecaId },
      select: { quantidadeEstoque: true, quantidadeReservada: true },
    }),
    movimentacoes: await prisma.movimentacaoEstoque.count(),
    consumos: await prisma.consumoAplicadoOs.count(),
    ajustes: await prisma.ajusteEstoqueAdministrativo.count(),
  });

  const iniciarReparoEmitidos = (cenario: Cenario) =>
    contarOutboxSaga(prisma, cenario.os.correlationId, COMANDO_INICIAR_REPARO);

  /**
   * Estado observável da OS. `motivo`, `eventId` e `pagamentoConfirmado` da
   * pendência registram só a origem do registro (qual fato a criou) e por isso
   * ficam de fora da comparação entre as ordens de chegada.
   */
  const fotografia = async (cenario: Cenario) => {
    const { osId, correlationId } = cenario.os;
    const pendencias = (
      await prisma.pendenciaOs.findMany({ where: { ordemServicoId: osId } })
    ).map((p) => {
      const detalhes = { ...(p.detalhes as Record<string, unknown>) };
      delete detalhes.motivo;
      delete detalhes.eventId;
      delete detalhes.pagamentoConfirmado;
      return {
        tipo: p.tipo,
        rodada: p.rodada,
        resolvida: p.resolvida,
        comResolvidaEm: p.resolvidaEm !== null,
        detalhes,
      };
    });
    const confirmacoes = (
      await prisma.projecaoFinanceiraOs.findMany({
        where: { ordemServicoId: osId, natureza: 'CONFIRMACAO' },
      })
    ).map((c) => c.orderId);
    const compensacao = await prisma.estadoCompensacaoOs.findUnique({
      where: { ordemServicoId: osId },
    });
    const mensagens = (
      await prisma.outboxMensagem.findMany({
        where: { correlationId },
        select: { eventType: true },
      })
    )
      .map((m) => m.eventType)
      .sort();
    const resumo = (await servicos.buscar.execute(osId)).resumoFinanceiro;
    const bruta = {
      status: await statusDaOs(prisma, osId),
      pendencias: pendencias.sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
      confirmacoes,
      compensacao: compensacao
        ? {
            passo: compensacao.passo,
            aguardandoResposta: compensacao.aguardandoResposta,
          }
        : null,
      historicoDeStatus: await prisma.historicoStatusOS.count({
        where: { ordemServicoId: osId },
      }),
      mensagens,
      orderDoResumo: resumo.pagamento?.orderId ?? null,
    };
    const normalizada = JSON.parse(
      JSON.stringify(bruta)
        .replaceAll(cenario.orderSegundoPagamento, 'ORDER_2')
        .replaceAll(cenario.orderLegitima, 'ORDER_1')
        .replaceAll(cenario.cobrancaId, 'COBRANCA')
        .replaceAll(cenario.eventoEstorno, 'EVENTO_ESTORNO'),
    ) as typeof bruta;
    normalizada.confirmacoes.sort();
    return normalizada;
  };

  describe('as duas ordens de chegada terminam no mesmo estado', () => {
    it.each([
      [StatusOS.AGUARDANDO_EXECUCAO, false],
      [StatusOS.EM_EXECUCAO, false],
      [StatusOS.FINALIZADA, false],
      [StatusOS.EM_CANCELAMENTO, false],
      [StatusOS.CANCELADA, true],
      [StatusOS.ENTREGUE, true],
    ])(
      'em %s o estorno e o pagamento da mesma order reconciliam igual (pendência resolvida: %s)',
      async (status, resolvida) => {
        const estornoPrimeiro = await preparar(status);
        const pagamentoPrimeiro = await preparar(status);
        const estoqueAntes = await estoque();

        await estorno(estornoPrimeiro);
        await pagamentoDoSegundo(estornoPrimeiro);
        await pagamentoDoSegundo(pagamentoPrimeiro);
        await estorno(pagamentoPrimeiro);

        expect(await estoque()).toEqual(estoqueAntes);
        const final = await fotografia(estornoPrimeiro);
        expect(await fotografia(pagamentoPrimeiro)).toEqual(final);
        expect(final.status).toBe(status);
        expect(final.confirmacoes).toEqual([
          'confirmado:ORDER_1',
          'confirmado:ORDER_2',
        ]);
        expect(final.orderDoResumo).toBe('ORDER_1');
        const daOrder = (await pendenciasDaOrder(estornoPrimeiro)).filter(
          (p) => p.resolvida === resolvida,
        );
        expect(daOrder).toHaveLength(1);
        expect(daOrder[0].detalhes).toMatchObject({
          natureza: 'SEGUNDO_PAGAMENTO',
          cobrancaId: estornoPrimeiro.cobrancaId,
          evidenciaEstornoBilling: {
            eventId: estornoPrimeiro.eventoEstorno,
            orderId: estornoPrimeiro.orderSegundoPagamento,
            tipoEstorno: 'INTEGRAL',
          },
        });
        expect(await pendenciasFinanceiras(estornoPrimeiro)).toHaveLength(1);
        expect(await iniciarReparoEmitidos(estornoPrimeiro)).toBe(1);
      },
    );
  });

  describe('com a OS em AGUARDANDO_PAGAMENTO', () => {
    it('o estorno cria a pendência aberta com a evidência, o pagamento da mesma order não transiciona e o pagamento legítimo depois é aplicado', async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);
      const historicoAntes = await prisma.historicoStatusOS.count({
        where: { ordemServicoId: cenario.os.osId },
      });

      await estorno(cenario);

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_PAGAMENTO,
      );
      const [criada] = await pendenciasFinanceiras(cenario);
      expect(criada).toMatchObject({ resolvida: false, resolvidaEm: null });
      expect(criada.detalhes).toMatchObject({
        natureza: 'SEGUNDO_PAGAMENTO',
        orderId: cenario.orderSegundoPagamento,
        cobrancaId: cenario.cobrancaId,
        eventId: cenario.eventoEstorno,
        evidenciaEstornoBilling: {
          eventId: cenario.eventoEstorno,
          cobrancaId: cenario.cobrancaId,
          orderId: cenario.orderSegundoPagamento,
          valorEstornadoCentavos: 50000,
          tipoEstorno: 'INTEGRAL',
          estornadoEm: '2026-11-19T10:00:00.000Z',
          statusOrderMercadoPago: 'refunded',
        },
      });

      await pagamentoDoSegundo(cenario);

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_PAGAMENTO,
      );
      expect(await iniciarReparoEmitidos(cenario)).toBe(0);
      expect(await pendenciasFinanceiras(cenario)).toHaveLength(1);
      expect((await pendenciasDaOrder(cenario))[0].detalhes).toMatchObject({
        evidenciaEstornoBilling: { eventId: cenario.eventoEstorno },
        pagamentoConfirmado: {
          eventId: cenario.eventoPagamento,
          cobrancaId: cenario.cobrancaId,
          valorCentavos: 50000,
        },
      });
      expect(
        await prisma.projecaoFinanceiraOs.count({
          where: { ordemServicoId: cenario.os.osId, natureza: 'CONFIRMACAO' },
        }),
      ).toBe(0);

      await pagamentoConfirmado(
        servicos,
        cenario.os,
        cenario.cobrancaId,
        cenario.orderLegitima,
      );

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      expect(await iniciarReparoEmitidos(cenario)).toBe(1);
      expect(
        await prisma.historicoStatusOS.count({
          where: { ordemServicoId: cenario.os.osId },
        }),
      ).toBe(historicoAntes + 1);
      const final = await fotografia(cenario);
      expect(final.orderDoResumo).toBe('ORDER_1');
      expect(final.confirmacoes).toEqual(['confirmado:ORDER_1']);
      expect(await pendenciasFinanceiras(cenario)).toHaveLength(1);
    });

    it('caso conhecido fora do alcance: o estorno da order que a OS já aceitou como pagamento deixa a evidência, não regride nem compensa e registra aviso', async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);
      await pagamentoDoSegundo(cenario);
      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      const mensagensAntes = await prisma.outboxMensagem.count({
        where: { correlationId: cenario.os.correlationId },
      });
      const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        await estorno(cenario);

        const avisos = aviso.mock.calls
          .map(([linha]) => String(linha))
          .filter((linha) =>
            linha.includes(
              'saga.estorno-segundo-pagamento.order-aceita-como-pagamento',
            ),
          );
        expect(avisos).toHaveLength(1);
        expect(avisos[0]).toContain(cenario.orderSegundoPagamento);
      } finally {
        aviso.mockRestore();
      }

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      expect(
        await prisma.outboxMensagem.count({
          where: { correlationId: cenario.os.correlationId },
        }),
      ).toBe(mensagensAntes);
      expect(
        await contarOutboxSaga(
          prisma,
          cenario.os.correlationId,
          COMANDO_CANCELAR_TAREFA,
        ),
      ).toBe(0);
      const [pendencia] = await pendenciasDaOrder(cenario);
      expect(pendencia).toMatchObject({ resolvida: false });
      expect(pendencia.detalhes).toMatchObject({
        natureza: 'SEGUNDO_PAGAMENTO',
        evidenciaEstornoBilling: { eventId: cenario.eventoEstorno },
      });
    });
  });

  describe('reentrega e duplicata', () => {
    it.each([StatusOS.AGUARDANDO_PAGAMENTO, StatusOS.FINALIZADA])(
      'em %s não criam outra pendência nem substituem a evidência integral',
      async (status) => {
        const cenario = await preparar(status);
        const estoqueAntes = await estoque();

        await estorno(cenario);
        await estorno(cenario);
        await estorno(cenario, { valorEstornadoCentavos: 1 }, randomUUID());

        expect(await estoque()).toEqual(estoqueAntes);
        const daOrder = await pendenciasDaOrder(cenario);
        expect(daOrder).toHaveLength(1);
        expect(daOrder[0].detalhes).toMatchObject({
          evidenciaEstornoBilling: {
            eventId: cenario.eventoEstorno,
            valorEstornadoCentavos: 50000,
          },
        });
      },
    );

    it('a duplicata do pagamento depois do estorno não reabre nem reescreve a pendência', async () => {
      const cenario = await preparar(StatusOS.EM_EXECUCAO);
      await estorno(cenario);
      await pagamentoDoSegundo(cenario);
      const [antes] = await pendenciasDaOrder(cenario);

      await pagamentoDoSegundo(cenario);
      await pagamentoDoSegundo(cenario, randomUUID());

      expect(await pendenciasFinanceiras(cenario)).toHaveLength(1);
      expect((await pendenciasDaOrder(cenario))[0].detalhes).toEqual(
        antes.detalhes,
      );
    });
  });

  describe('proteção da cobrança legítima', () => {
    const abrirCancelamentoComPendenciaDaCobranca = async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);
      await servicos.desistir.execute(cenario.os.osId, {
        motivo: 'Desistência',
      });
      await entregar(servicos, cenario.os, EVENTO_RESPOSTA_CANCELAMENTO, {
        resultado: 'PENDENCIA_MANUAL_ABERTA',
        pendenciaId: `pend-${randomUUID()}`,
      });
      await prisma.pendenciaOs.updateMany({
        where: {
          ordemServicoId: cenario.os.osId,
          tipo: 'FINANCEIRA',
          resolvida: false,
        },
        data: {
          detalhes: {
            cobrancaId: cenario.cobrancaId,
            pendenciaId: 'pend-cancelamento',
            motivo: 'Cancelamento financeiro com pendência manual',
          },
        },
      });
      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.EM_CANCELAMENTO,
      );
      return cenario;
    };

    it('em EM_CANCELAMENTO o estorno do segundo pagamento preserva a pendência do cancelamento e não avança a compensação', async () => {
      const cenario = await abrirCancelamentoComPendenciaDaCobranca();
      const antes = await fotografia(cenario);
      const estoqueAntes = await estoque();

      await estorno(cenario);
      await pagamentoDoSegundo(cenario);

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.EM_CANCELAMENTO,
      );
      const abertas = await prisma.pendenciaOs.findMany({
        where: {
          ordemServicoId: cenario.os.osId,
          tipo: 'FINANCEIRA',
          resolvida: false,
        },
      });
      expect(abertas.map((p) => p.detalhes)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pendenciaId: 'pend-cancelamento' }),
          expect.objectContaining({
            natureza: 'SEGUNDO_PAGAMENTO',
            orderId: cenario.orderSegundoPagamento,
          }),
        ]),
      );
      expect(abertas).toHaveLength(2);
      const depois = await fotografia(cenario);
      expect(depois.compensacao).toEqual(antes.compensacao);
      expect(depois.historicoDeStatus).toBe(antes.historicoDeStatus);
      expect(depois.mensagens).toEqual(antes.mensagens);
      expect(await estoque()).toEqual(estoqueAntes);
    });

    it('sem a origem do segundo pagamento o estorno continua resolvendo a pendência do cancelamento pela cobrança', async () => {
      const cenario = await abrirCancelamentoComPendenciaDaCobranca();

      await estorno(cenario, { origemEstorno: undefined });

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.CANCELADA,
      );
      expect(await pendenciasDaOrder(cenario)).toHaveLength(0);
    });

    it('em CANCELADA o estorno resolve só a pendência da própria order e preserva a do pagamento tardio da mesma cobrança', async () => {
      const cenario = await preparar(StatusOS.CANCELADA);
      await entregar(servicos, cenario.os, EVENTO_PAGAMENTO_TARDIO_REGISTRADO, {
        cobrancaId: cenario.cobrancaId,
        aprovadoEm: '2026-06-15T15:00:00.000Z',
        tratamento: 'PENDENCIA_MANUAL',
      });
      await pagamentoDoSegundo(cenario);

      await estorno(cenario);

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.CANCELADA,
      );
      const pendencias = await pendenciasFinanceiras(cenario);
      expect(pendencias).toHaveLength(2);
      const tardio = pendencias.find(
        (p) => !(p.detalhes as { orderId?: string }).orderId,
      );
      expect(tardio).toMatchObject({ resolvida: false, resolvidaEm: null });
      const daOrder = await pendenciasDaOrder(cenario);
      expect(daOrder).toHaveLength(1);
      expect(daOrder[0]).toMatchObject({ resolvida: true });
      expect(daOrder[0].resolvidaEm).not.toBeNull();
    });

    it('sem a origem do segundo pagamento o estorno continua resolvendo a pendência do pagamento tardio pela cobrança', async () => {
      const cenario = await preparar(StatusOS.CANCELADA);
      await entregar(servicos, cenario.os, EVENTO_PAGAMENTO_TARDIO_REGISTRADO, {
        cobrancaId: cenario.cobrancaId,
        aprovadoEm: '2026-06-15T15:00:00.000Z',
        tratamento: 'PENDENCIA_MANUAL',
      });

      await estorno(cenario, { origemEstorno: 'PENDENCIA_RESOLVIDA' });

      const pendencias = await pendenciasFinanceiras(cenario);
      expect(pendencias).toHaveLength(1);
      expect(pendencias[0]).toMatchObject({ resolvida: true });
    });
  });

  describe('comportamento anterior preservado', () => {
    it('em AGUARDANDO_PAGAMENTO o estorno sem a origem do segundo pagamento continua ignorado', async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);

      await estorno(cenario, { origemEstorno: undefined });
      await estorno(
        cenario,
        { origemEstorno: 'PENDENCIA_RESOLVIDA' },
        randomUUID(),
      );

      expect(await pendenciasFinanceiras(cenario)).toHaveLength(0);
      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_PAGAMENTO,
      );
    });

    it('PendenciaResolvida da cobrança continua resolvendo a pendência do pagamento tardio', async () => {
      const cenario = await preparar(StatusOS.CANCELADA);
      await entregar(servicos, cenario.os, EVENTO_PAGAMENTO_TARDIO_REGISTRADO, {
        cobrancaId: cenario.cobrancaId,
        aprovadoEm: '2026-06-15T15:00:00.000Z',
        tratamento: 'PENDENCIA_MANUAL',
      });

      await entregar(servicos, cenario.os, EVENTO_PENDENCIA_RESOLVIDA, {
        cobrancaId: cenario.cobrancaId,
      });

      expect(await pendenciasFinanceiras(cenario)).toEqual([
        expect.objectContaining({ resolvida: true }),
      ]);
    });
  });

  describe('violação do contrato', () => {
    it.each([
      ['estorno parcial', { tipoEstorno: 'PARCIAL' }],
      ['sem tipoEstorno', { tipoEstorno: undefined }],
      ['orderId vazio', { orderId: '' }],
      ['sem orderId', { orderId: undefined }],
    ])(
      'recusa com erro permanente e sem efeito o estorno de segundo pagamento (%s)',
      async (_descricao, payload) => {
        const cenario = await preparar(StatusOS.EM_EXECUCAO);
        const antes = await fotografia(cenario);
        const estoqueAntes = await estoque();

        await expect(estorno(cenario, payload)).rejects.toBeInstanceOf(
          ErroMensagemPermanente,
        );

        expect(await fotografia(cenario)).toEqual(antes);
        expect(await estoque()).toEqual(estoqueAntes);
        expect(
          await prisma.mensagemProcessada.count({
            where: { eventId: cenario.eventoEstorno },
          }),
        ).toBe(0);
      },
    );
  });

  describe('cobrancaId divergente da pendência da order', () => {
    const detalhesDasPendencias = async (cenario: Cenario) =>
      (await pendenciasFinanceiras(cenario)).map((p) => p.detalhes);

    it.each([StatusOS.EM_EXECUCAO, StatusOS.CANCELADA])(
      'em %s o estorno que chega depois do pagamento é recusado sem efeito',
      async (status) => {
        const cenario = await preparar(status);
        await pagamentoDoSegundo(cenario);
        const antes = await fotografia(cenario);
        const detalhesAntes = await detalhesDasPendencias(cenario);

        await expect(
          estorno(cenario, { cobrancaId: randomUUID() }),
        ).rejects.toBeInstanceOf(ErroMensagemPermanente);

        expect(await fotografia(cenario)).toEqual(antes);
        expect(await detalhesDasPendencias(cenario)).toEqual(detalhesAntes);
        expect(
          await prisma.mensagemProcessada.count({
            where: { eventId: cenario.eventoEstorno },
          }),
        ).toBe(0);
      },
    );

    it.each([
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.EM_EXECUCAO,
      StatusOS.CANCELADA,
    ])(
      'em %s o pagamento que chega depois do estorno é recusado sem efeito',
      async (status) => {
        const cenario = await preparar(status);
        await estorno(cenario);
        const antes = await fotografia(cenario);
        const detalhesAntes = await detalhesDasPendencias(cenario);

        await expect(
          pagamentoDoSegundo(cenario, cenario.eventoPagamento, randomUUID()),
        ).rejects.toBeInstanceOf(ErroMensagemPermanente);

        expect(await fotografia(cenario)).toEqual(antes);
        expect(await detalhesDasPendencias(cenario)).toEqual(detalhesAntes);
        expect(
          await prisma.mensagemProcessada.count({
            where: { eventId: cenario.eventoPagamento },
          }),
        ).toBe(0);
      },
    );
  });

  describe('resolução administrativa da pendência criada antecipadamente', () => {
    const resolverPendencia = (cenario: Cenario, pendenciaId: string) =>
      resolver.execute({
        ordemServicoId: cenario.os.osId,
        pendenciaId,
        motivo: 'Estorno conferido no painel do Billing',
        responsavelId,
        idempotencyKey: randomUUID(),
      });

    it.each([StatusOS.AGUARDANDO_PAGAMENTO, StatusOS.EM_EXECUCAO])(
      'em %s a rota existente resolve a pendência com a evidência recebida antes do pagamento',
      async (status) => {
        const cenario = await preparar(status);
        await estorno(cenario);
        const [pendencia] = await pendenciasDaOrder(cenario);
        expect(pendencia.resolvida).toBe(false);

        await resolverPendencia(cenario, pendencia.id);

        const resolvida = await prisma.pendenciaOs.findUniqueOrThrow({
          where: { id: pendencia.id },
        });
        expect(resolvida).toMatchObject({
          resolvida: true,
          resolvidaPorId: responsavelId,
        });
        expect(resolvida.resolvidaEm).not.toBeNull();
        expect(resolvida.detalhes).toMatchObject({
          resolucaoManual: {
            caso: 'SEGUNDO_PAGAMENTO_ESTORNADO',
            evidencia: {
              evidenciaEstornoBilling: { eventId: cenario.eventoEstorno },
            },
          },
        });
        expect(await statusDaOs(prisma, cenario.os.osId)).toBe(status);
      },
    );

    it('a pendência completada pelo pagamento posterior continua elegível para a resolução', async () => {
      const cenario = await preparar(StatusOS.FINALIZADA);
      await estorno(cenario);
      await pagamentoDoSegundo(cenario);
      const [pendencia] = await pendenciasDaOrder(cenario);

      await resolverPendencia(cenario, pendencia.id);

      expect((await pendenciasDaOrder(cenario))[0]).toMatchObject({
        resolvida: true,
      });
    });
  });

  it('não há comando de cancelamento nem de reparo emitido pelo estorno do segundo pagamento', async () => {
    const cenario = await preparar(StatusOS.AGUARDANDO_EXECUCAO);
    const iniciarAntes = await iniciarReparoEmitidos(cenario);

    await estorno(cenario);

    expect(await iniciarReparoEmitidos(cenario)).toBe(iniciarAntes);
    expect(
      await contarOutboxSaga(
        prisma,
        cenario.os.correlationId,
        COMANDO_CANCELAR_FINANCEIRO,
      ),
    ).toBe(0);
    expect(
      await contarOutboxSaga(
        prisma,
        cenario.os.correlationId,
        COMANDO_CANCELAR_TAREFA,
      ),
    ).toBe(0);
  });
});
