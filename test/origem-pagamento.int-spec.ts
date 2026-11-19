import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import { EvidenciaBillingAusenteError } from '@/modules/coordenacao-saga/domain/errors/pendencia.errors';
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
  payloadDoExemploBilling,
  payloadDoExemploExecution,
  prepararAguardandoPagamento,
  statusDaOs,
  type CatalogoSaga,
  type OsEmAndamento,
  type ServicosSaga,
} from './helpers/jornada-saga-os';

const EXEMPLO_PAGAMENTO_LEGITIMO = 'billing.pagamento-confirmado.v1';
const EXEMPLO_SEGUNDO_PAGAMENTO =
  'billing.pagamento-confirmado.segundo-pagamento.v1';
const EXEMPLO_PAGAMENTO_LEGADO = 'billing.pagamento-confirmado.sem-origem.v1';

/**
 * `PagamentoConfirmado` com `origemPagamento` (Parte C2): o Billing classifica o
 * pagamento e o OS não o presume pelo estado. Os payloads partem dos exemplos
 * publicados pelo Billing (test/contratos/billing).
 */
describe('Saga: origemPagamento do PagamentoConfirmado (integração)', () => {
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
    catalogo = await criarCatalogoSaga(prisma, 'origem-pagamento');
    pecaId = await criarPecaSaga(prisma, 'origem-pagamento');
    resolver = modulo.get(ResolverPendenciaManualUseCase, { strict: false });
    responsavelId = (
      await prisma.usuario.create({
        data: {
          nome: 'Admin origem pagamento',
          email: `admin-origem-pagamento+${randomUUID()}@oficina.test`,
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
    eventoPagamentoLegitimo: string;
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
      eventoPagamentoLegitimo: randomUUID(),
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
    await pagamentoLegitimo(cenario);
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
        await concluirCancelamento(cenario);
        break;
      default:
        break;
    }
  };

  const concluirCancelamento = async ({ os }: Cenario) => {
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
      payloadDoExemploBilling('billing.resposta-cancelamento-financeiro.v1'),
    );
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

  const entregarPagamento = (
    cenario: Cenario,
    exemplo: string,
    eventId: string,
    payload: Record<string, unknown>,
  ) =>
    entregar(
      servicos,
      cenario.os,
      EVENTO_PAGAMENTO_CONFIRMADO,
      {
        ...payloadDoExemploBilling(exemplo),
        cobrancaId: cenario.cobrancaId,
        valorCentavos: 50000,
        ...payload,
      },
      1,
      eventId,
      OCORRIDO_EM,
    );

  const segundoPagamento = (
    cenario: Cenario,
    payload: Record<string, unknown> = {},
    eventId = cenario.eventoPagamento,
  ) =>
    entregarPagamento(cenario, EXEMPLO_SEGUNDO_PAGAMENTO, eventId, {
      orderId: cenario.orderSegundoPagamento,
      ...payload,
    });

  const pagamentoLegitimo = (
    cenario: Cenario,
    payload: Record<string, unknown> = {},
    eventId = cenario.eventoPagamentoLegitimo,
  ) =>
    entregarPagamento(cenario, EXEMPLO_PAGAMENTO_LEGITIMO, eventId, {
      orderId: cenario.orderLegitima,
      ...payload,
    });

  const pagamentoLegado = (
    cenario: Cenario,
    orderId: string,
    eventId = randomUUID(),
  ) =>
    entregarPagamento(cenario, EXEMPLO_PAGAMENTO_LEGADO, eventId, { orderId });

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

  const comandosDeCancelamentoEmitidos = async (cenario: Cenario) =>
    (await contarOutboxSaga(
      prisma,
      cenario.os.correlationId,
      COMANDO_CANCELAR_FINANCEIRO,
    )) +
    (await contarOutboxSaga(
      prisma,
      cenario.os.correlationId,
      COMANDO_CANCELAR_TAREFA,
    ));

  const confirmacoesDaProjecao = async (cenario: Cenario) =>
    (
      await prisma.projecaoFinanceiraOs.findMany({
        where: { ordemServicoId: cenario.os.osId, natureza: 'CONFIRMACAO' },
      })
    ).map((c) => c.orderId);

  const mensagemFoiProcessada = async (eventId: string) =>
    (await prisma.mensagemProcessada.count({ where: { eventId } })) > 0;

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
      confirmacoes: await confirmacoesDaProjecao(cenario),
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

  type Chegada = 'legitimo' | 'segundo' | 'estorno';

  const entregarNaOrdem = async (cenario: Cenario, ordem: Chegada[]) => {
    for (const chegada of ordem) {
      if (chegada === 'legitimo') await pagamentoLegitimo(cenario);
      if (chegada === 'segundo') await segundoPagamento(cenario);
      if (chegada === 'estorno') await estorno(cenario);
    }
  };

  describe('com a OS em AGUARDANDO_PAGAMENTO, todas as ordens de chegada terminam no mesmo estado', () => {
    const ordens: Chegada[][] = [
      ['legitimo', 'segundo', 'estorno'],
      ['legitimo', 'estorno', 'segundo'],
      ['segundo', 'legitimo', 'estorno'],
      ['segundo', 'estorno', 'legitimo'],
      ['estorno', 'segundo', 'legitimo'],
      ['estorno', 'legitimo', 'segundo'],
    ];

    it('legítimo antes ou depois do segundo pagamento e do estorno: mesmo estado final, sem comando de reparo extra', async () => {
      const cenarios: Cenario[] = [];
      for (let indice = 0; indice < ordens.length; indice += 1) {
        cenarios.push(await preparar(StatusOS.AGUARDANDO_PAGAMENTO));
      }
      const estoqueAntes = await estoque();

      for (const [indice, ordem] of ordens.entries()) {
        await entregarNaOrdem(cenarios[indice], ordem);
      }

      expect(await estoque()).toEqual(estoqueAntes);
      const referencia = await fotografia(cenarios[0]);
      for (const cenario of cenarios) {
        expect(await fotografia(cenario)).toEqual(referencia);
        expect(await iniciarReparoEmitidos(cenario)).toBe(1);
        expect(await comandosDeCancelamentoEmitidos(cenario)).toBe(0);
        expect(await pendenciasFinanceiras(cenario)).toHaveLength(1);
      }
      expect(referencia.status).toBe(StatusOS.AGUARDANDO_EXECUCAO);
      expect(referencia.confirmacoes).toEqual(['confirmado:ORDER_1']);
      expect(referencia.orderDoResumo).toBe('ORDER_1');
      expect(referencia.pendencias).toEqual([
        expect.objectContaining({
          resolvida: false,
          detalhes: expect.objectContaining({
            natureza: 'SEGUNDO_PAGAMENTO',
            orderId: 'ORDER_2',
            cobrancaId: 'COBRANCA',
            evidenciaEstornoBilling: expect.objectContaining({
              eventId: 'EVENTO_ESTORNO',
              orderId: 'ORDER_2',
              tipoEstorno: 'INTEGRAL',
            }),
          }),
        }),
      ]);
    });

    it('o segundo pagamento que chega antes do legítimo não vira o pagamento da OS nem libera o reparo', async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);
      const historicoAntes = await prisma.historicoStatusOS.count({
        where: { ordemServicoId: cenario.os.osId },
      });

      await segundoPagamento(cenario);

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_PAGAMENTO,
      );
      expect(await iniciarReparoEmitidos(cenario)).toBe(0);
      expect(await confirmacoesDaProjecao(cenario)).toEqual([]);
      const [pendencia] = await pendenciasFinanceiras(cenario);
      expect(pendencia).toMatchObject({ resolvida: false, resolvidaEm: null });
      expect(pendencia.detalhes).toMatchObject({
        natureza: 'SEGUNDO_PAGAMENTO',
        orderId: cenario.orderSegundoPagamento,
        cobrancaId: cenario.cobrancaId,
        pagamentoConfirmado: {
          eventId: cenario.eventoPagamento,
          cobrancaId: cenario.cobrancaId,
          valorCentavos: 50000,
        },
      });

      await pagamentoLegitimo(cenario);

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      expect(await iniciarReparoEmitidos(cenario)).toBe(1);
      expect(await confirmacoesDaProjecao(cenario)).toEqual([
        `confirmado:${cenario.orderLegitima}`,
      ]);
      expect(
        await prisma.historicoStatusOS.count({
          where: { ordemServicoId: cenario.os.osId },
        }),
      ).toBe(historicoAntes + 1);
    });
  });

  describe('com a OS já paga ou encerrada, o segundo pagamento e o estorno reconciliam igual nas duas ordens', () => {
    it.each([
      [StatusOS.AGUARDANDO_EXECUCAO, false],
      [StatusOS.EM_EXECUCAO, false],
      [StatusOS.FINALIZADA, false],
      [StatusOS.EM_CANCELAMENTO, false],
      [StatusOS.CANCELADA, true],
      [StatusOS.ENTREGUE, true],
    ])(
      'em %s (pendência resolvida: %s) nada muda além da pendência da order',
      async (status, resolvida) => {
        const segundoPrimeiro = await preparar(status);
        const estornoPrimeiro = await preparar(status);
        const antes = await fotografia(segundoPrimeiro);
        const estoqueAntes = await estoque();
        const reparosAntes = await iniciarReparoEmitidos(segundoPrimeiro);
        const cancelamentosAntes =
          await comandosDeCancelamentoEmitidos(segundoPrimeiro);

        await segundoPagamento(segundoPrimeiro);
        await estorno(segundoPrimeiro);
        await estorno(estornoPrimeiro);
        await segundoPagamento(estornoPrimeiro);

        expect(await estoque()).toEqual(estoqueAntes);
        const final = await fotografia(segundoPrimeiro);
        expect(await fotografia(estornoPrimeiro)).toEqual(final);
        for (const cenario of [segundoPrimeiro, estornoPrimeiro]) {
          expect(await iniciarReparoEmitidos(cenario)).toBe(reparosAntes);
          expect(await comandosDeCancelamentoEmitidos(cenario)).toBe(
            cancelamentosAntes,
          );
        }
        expect(final).toMatchObject({
          status,
          confirmacoes: antes.confirmacoes,
          compensacao: antes.compensacao,
          historicoDeStatus: antes.historicoDeStatus,
          mensagens: antes.mensagens,
          orderDoResumo: antes.orderDoResumo,
        });
        expect(final.confirmacoes).toEqual(['confirmado:ORDER_1']);
        const daOrder = await pendenciasDaOrder(segundoPrimeiro);
        expect(daOrder).toHaveLength(1);
        expect(daOrder[0]).toMatchObject({ resolvida });
        expect(daOrder[0].detalhes).toMatchObject({
          natureza: 'SEGUNDO_PAGAMENTO',
          cobrancaId: segundoPrimeiro.cobrancaId,
          evidenciaEstornoBilling: {
            eventId: segundoPrimeiro.eventoEstorno,
            orderId: segundoPrimeiro.orderSegundoPagamento,
            tipoEstorno: 'INTEGRAL',
          },
        });
        expect(await pendenciasFinanceiras(segundoPrimeiro)).toHaveLength(1);
      },
    );

    it.each([
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_EXECUCAO,
      StatusOS.FINALIZADA,
      StatusOS.CANCELADA,
      StatusOS.ENTREGUE,
    ])(
      'em %s o segundo pagamento sozinho só abre a pendência aberta da order, sem regressão de status',
      async (status) => {
        const cenario = await preparar(status);
        const antes = await fotografia(cenario);
        const estoqueAntes = await estoque();

        await segundoPagamento(cenario);

        const depois = await fotografia(cenario);
        expect(depois.status).toBe(status);
        expect(depois.confirmacoes).toEqual(antes.confirmacoes);
        expect(depois.historicoDeStatus).toBe(antes.historicoDeStatus);
        expect(depois.mensagens).toEqual(antes.mensagens);
        expect(depois.compensacao).toEqual(antes.compensacao);
        expect(await estoque()).toEqual(estoqueAntes);
        const [pendencia] = await pendenciasDaOrder(cenario);
        expect(pendencia).toMatchObject({
          resolvida: false,
          resolvidaEm: null,
        });
        expect(pendencia.detalhes).toMatchObject({
          natureza: 'SEGUNDO_PAGAMENTO',
        });
        expect(await pendenciasFinanceiras(cenario)).toHaveLength(1);
      },
    );

    it('o segundo pagamento que chega com a OS cancelada resolve a pendência que já tinha a evidência do estorno', async () => {
      const cenario = await preparar(StatusOS.EM_CANCELAMENTO);
      await estorno(cenario);
      const [aberta] = await pendenciasDaOrder(cenario);
      expect(aberta.resolvida).toBe(false);
      await concluirCancelamento(cenario);
      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.CANCELADA,
      );

      await segundoPagamento(cenario);

      expect(await pendenciasFinanceiras(cenario)).toHaveLength(1);
      expect((await pendenciasDaOrder(cenario))[0]).toMatchObject({
        resolvida: true,
      });
    });
  });

  describe('em EM_CANCELAMENTO a compensação não avança', () => {
    it('o segundo pagamento preserva a pendência do cancelamento e a compensação', async () => {
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
      const antes = await fotografia(cenario);
      const estoqueAntes = await estoque();

      await segundoPagamento(cenario);

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
      expect(depois.confirmacoes).toEqual(antes.confirmacoes);
      expect(await estoque()).toEqual(estoqueAntes);
    });
  });

  describe('reentrega e duplicata', () => {
    it.each([
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.EM_EXECUCAO,
      StatusOS.FINALIZADA,
      StatusOS.CANCELADA,
    ])(
      'em %s o segundo pagamento repetido não cria outra pendência nem reescreve a existente',
      async (status) => {
        const cenario = await preparar(status);
        await segundoPagamento(cenario);
        const [primeira] = await pendenciasDaOrder(cenario);
        const antes = await fotografia(cenario);

        await segundoPagamento(cenario);
        await segundoPagamento(cenario, {}, randomUUID());

        expect(await pendenciasFinanceiras(cenario)).toHaveLength(1);
        expect((await pendenciasDaOrder(cenario))[0].detalhes).toEqual(
          primeira.detalhes,
        );
        expect(await fotografia(cenario)).toEqual(antes);
      },
    );

    it('a duplicata do segundo pagamento depois da resolução administrativa não reabre a pendência', async () => {
      const cenario = await preparar(StatusOS.EM_EXECUCAO);
      await estorno(cenario);
      await segundoPagamento(cenario);
      const [pendencia] = await pendenciasDaOrder(cenario);
      await resolver.execute({
        ordemServicoId: cenario.os.osId,
        pendenciaId: pendencia.id,
        motivo: 'Estorno conferido no painel do Billing',
        responsavelId,
        idempotencyKey: randomUUID(),
      });

      await segundoPagamento(cenario, {}, randomUUID());

      expect(await pendenciasFinanceiras(cenario)).toEqual([
        expect.objectContaining({ id: pendencia.id, resolvida: true }),
      ]);
    });

    it('o pagamento legítimo repetido pede o reparo uma única vez', async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);

      await pagamentoLegitimo(cenario);
      await pagamentoLegitimo(cenario);
      await pagamentoLegitimo(cenario, {}, randomUUID());

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      expect(await iniciarReparoEmitidos(cenario)).toBe(1);
      expect(await pendenciasFinanceiras(cenario)).toHaveLength(0);
      expect(await confirmacoesDaProjecao(cenario)).toEqual([
        `confirmado:${cenario.orderLegitima}`,
      ]);
    });
  });

  describe('mensagem legada, sem origemPagamento: comportamento anterior', () => {
    it('em AGUARDANDO_PAGAMENTO é aplicada como o pagamento da OS', async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);

      await pagamentoLegado(cenario, cenario.orderLegitima);

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      expect(await iniciarReparoEmitidos(cenario)).toBe(1);
      expect(await pendenciasFinanceiras(cenario)).toHaveLength(0);
    });

    it.each([StatusOS.EM_EXECUCAO, StatusOS.FINALIZADA])(
      'em %s a order diferente da paga vira a pendência SEGUNDO_PAGAMENTO, classificada pelo estado',
      async (status) => {
        const cenario = await preparar(status);
        const reparosAntes = await iniciarReparoEmitidos(cenario);

        await pagamentoLegado(cenario, cenario.orderSegundoPagamento);

        expect(await statusDaOs(prisma, cenario.os.osId)).toBe(status);
        expect(await iniciarReparoEmitidos(cenario)).toBe(reparosAntes);
        expect(await pendenciasDaOrder(cenario)).toEqual([
          expect.objectContaining({
            resolvida: false,
            detalhes: expect.objectContaining({
              natureza: 'SEGUNDO_PAGAMENTO',
              cobrancaId: cenario.cobrancaId,
            }),
          }),
        ]);
        expect(await confirmacoesDaProjecao(cenario)).toEqual(
          expect.arrayContaining([
            `confirmado:${cenario.orderSegundoPagamento}`,
          ]),
        );
      },
    );

    it('depois do estorno do segundo pagamento não é aplicada como o pagamento da OS e completa a pendência', async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);
      await estorno(cenario);

      await pagamentoLegado(cenario, cenario.orderSegundoPagamento);

      expect(await statusDaOs(prisma, cenario.os.osId)).toBe(
        StatusOS.AGUARDANDO_PAGAMENTO,
      );
      expect(await iniciarReparoEmitidos(cenario)).toBe(0);
      expect(await confirmacoesDaProjecao(cenario)).toEqual([]);
      const [pendencia] = await pendenciasFinanceiras(cenario);
      expect(pendencia.detalhes).toMatchObject({
        natureza: 'SEGUNDO_PAGAMENTO',
        pagamentoConfirmado: { cobrancaId: cenario.cobrancaId },
      });
    });
  });

  describe('violações de contrato, recusadas sem efeito', () => {
    const exigirSemEfeito = async (
      cenario: Cenario,
      entrega: () => Promise<unknown>,
      eventId: string,
    ) => {
      const antes = await fotografia(cenario);
      const detalhesAntes = (await pendenciasFinanceiras(cenario)).map(
        (p) => p.detalhes,
      );
      const estoqueAntes = await estoque();

      await expect(entrega()).rejects.toBeInstanceOf(ErroMensagemPermanente);

      expect(await fotografia(cenario)).toEqual(antes);
      expect(
        (await pendenciasFinanceiras(cenario)).map((p) => p.detalhes),
      ).toEqual(detalhesAntes);
      expect(await estoque()).toEqual(estoqueAntes);
      expect(await mensagemFoiProcessada(eventId)).toBe(false);
    };

    it.each([
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.EM_EXECUCAO,
      StatusOS.EM_CANCELAMENTO,
    ])('em %s o valor desconhecido em origemPagamento', async (status) => {
      const cenario = await preparar(status);

      for (const origemPagamento of ['OUTRA', 'segundo_pagamento', '']) {
        await exigirSemEfeito(
          cenario,
          () =>
            segundoPagamento(
              cenario,
              { origemPagamento },
              cenario.eventoPagamento,
            ),
          cenario.eventoPagamento,
        );
      }
    });

    it('o segundo pagamento sem orderId', async () => {
      const cenario = await preparar(StatusOS.AGUARDANDO_PAGAMENTO);

      await exigirSemEfeito(
        cenario,
        () => segundoPagamento(cenario, { orderId: undefined }),
        cenario.eventoPagamento,
      );
    });

    it.each([
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.EM_EXECUCAO,
      StatusOS.CANCELADA,
    ])(
      'em %s o PAGAMENTO_LEGITIMO de order com estorno de segundo pagamento',
      async (status) => {
        const cenario = await preparar(status);
        await estorno(cenario);

        await exigirSemEfeito(
          cenario,
          () =>
            pagamentoLegitimo(
              cenario,
              { orderId: cenario.orderSegundoPagamento },
              cenario.eventoPagamento,
            ),
          cenario.eventoPagamento,
        );
      },
    );

    it.each([
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.EM_EXECUCAO,
      StatusOS.CANCELADA,
    ])(
      'em %s o segundo pagamento com cobrancaId divergente da pendência da order',
      async (status) => {
        const cenario = await preparar(status);
        await estorno(cenario);

        await exigirSemEfeito(
          cenario,
          () => segundoPagamento(cenario, { cobrancaId: randomUUID() }),
          cenario.eventoPagamento,
        );
      },
    );

    it('o estorno com cobrancaId divergente do segundo pagamento já registrado', async () => {
      const cenario = await preparar(StatusOS.EM_EXECUCAO);
      await segundoPagamento(cenario);

      await exigirSemEfeito(
        cenario,
        () => estorno(cenario, { cobrancaId: randomUUID() }),
        cenario.eventoEstorno,
      );
    });
  });

  describe('resolução administrativa da pendência aberta por SEGUNDO_PAGAMENTO', () => {
    it.each([StatusOS.AGUARDANDO_PAGAMENTO, StatusOS.EM_EXECUCAO])(
      'em %s a rota existente resolve a pendência com a evidência do estorno recebida depois do pagamento',
      async (status) => {
        const cenario = await preparar(status);
        await segundoPagamento(cenario);
        await estorno(cenario);
        const [pendencia] = await pendenciasDaOrder(cenario);
        expect(pendencia.resolvida).toBe(false);

        await resolver.execute({
          ordemServicoId: cenario.os.osId,
          pendenciaId: pendencia.id,
          motivo: 'Estorno conferido no painel do Billing',
          responsavelId,
          idempotencyKey: randomUUID(),
        });

        const resolvida = await prisma.pendenciaOs.findUniqueOrThrow({
          where: { id: pendencia.id },
        });
        expect(resolvida).toMatchObject({
          resolvida: true,
          resolvidaPorId: responsavelId,
        });
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

    it('sem a evidência do estorno a rota recusa a resolução', async () => {
      const cenario = await preparar(StatusOS.EM_EXECUCAO);
      await segundoPagamento(cenario);
      const [pendencia] = await pendenciasDaOrder(cenario);

      await expect(
        resolver.execute({
          ordemServicoId: cenario.os.osId,
          pendenciaId: pendencia.id,
          motivo: 'Sem evidência',
          responsavelId,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(EvidenciaBillingAusenteError);

      expect((await pendenciasDaOrder(cenario))[0].resolvida).toBe(false);
    });
  });
});
