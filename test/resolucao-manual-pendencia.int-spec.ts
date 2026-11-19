import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import { ResolverPendenciaManualUseCase } from '@/modules/coordenacao-saga/application/use-cases/resolver-pendencia-manual.use-case';
import {
  EvidenciaBillingAusenteError,
  PendenciaNaoElegivelError,
  PendenciaNaoEncontradaError,
} from '@/modules/coordenacao-saga/domain/errors/pendencia.errors';
import { PENDENCIA_OS_GATEWAY } from '@/modules/coordenacao-saga/application/ports/tokens';
import { ORDEM_SERVICO_GATEWAY } from '@/modules/ordens-servico/application/ports/tokens';
import { RESERVA_ESTOQUE_GATEWAY } from '@/modules/reservas-estoque/application/ports/tokens';
import { UNIT_OF_WORK } from '@/shared/database/unit-of-work.port';
import { IdempotencyService } from '@/shared/idempotency/idempotency.service';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { ConteudoDivergenteInternoError } from '@/modules/rotas-internas/domain/erros-internos';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  SituacaoReconciliacaoConsumo,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  EVENTO_ESTORNO_CONCLUIDO,
  EVENTO_PAGAMENTO_TARDIO_REGISTRADO,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_FALHOU,
  EVENTO_REPARO_INICIADO,
} from '@/shared/messaging/envelope';
import { exigirDatabaseUrl } from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';
import {
  contarOutboxSaga,
  criarCatalogoSaga,
  criarModuloSaga,
  criarPecaSaga,
  entregar,
  obterServicosSaga,
  pagamentoConfirmado,
  prepararAguardandoPagamento,
  statusDaOs,
  type CatalogoSaga,
  type OsEmAndamento,
  type ServicosSaga,
} from './helpers/jornada-saga-os';
import { SessaoBloqueioOrdemServico } from './helpers/sessao-bloqueio-ordem-servico';

const ESCOPO_RESOLUCAO = 'os.pendencia.resolucao_manual';
const MOTIVO = 'Estorno conferido no painel do Billing';
const opcoesModulo = { strict: false };

describe('Resolução manual de pendências do OS (integração)', () => {
  let modulo: TestingModule;
  let servicos: ServicosSaga;
  let prisma: PrismaService;
  let catalogo: CatalogoSaga;
  let resolver: ResolverPendenciaManualUseCase;
  let responsavelId: string;

  beforeAll(async () => {
    modulo = await criarModuloSaga();
    servicos = obterServicosSaga(modulo);
    prisma = servicos.prisma;
    resolver = modulo.get(ResolverPendenciaManualUseCase, opcoesModulo);
    catalogo = await criarCatalogoSaga(prisma, 'resolucao-manual');
    responsavelId = (
      await prisma.usuario.create({
        data: {
          nome: 'Admin resolução manual',
          email: `admin-resolucao-manual+${randomUUID()}@oficina.test`,
          senhaHash: 'hash-nao-usado',
          perfil: 'ADMINISTRADOR',
          ativo: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.usuario.delete({ where: { id: responsavelId } });
    await fecharModuloIntegracao(modulo);
  });

  const resolverPendencia = (
    ordemServicoId: string,
    pendenciaId: string,
    idempotencyKey = randomUUID(),
    motivo = MOTIVO,
  ) =>
    resolver.execute({
      ordemServicoId,
      pendenciaId,
      motivo,
      responsavelId,
      idempotencyKey,
    });

  const pendencia = (id: string) =>
    prisma.pendenciaOs.findUniqueOrThrow({ where: { id } });

  const contarRegistrosDeIdempotencia = (idempotencyKey: string) =>
    prisma.idempotencyRecord.count({
      where: { idempotencyKey, scope: ESCOPO_RESOLUCAO },
    });

  const abrirPendencia = (
    ordemServicoId: string,
    tipo: TipoPendenciaOs,
    detalhes: Record<string, unknown>,
  ) =>
    prisma.pendenciaOs.create({
      data: { id: randomUUID(), ordemServicoId, rodada: 1, tipo, detalhes },
    });

  const criarOsComStatus = async (status: StatusOS): Promise<OsEmAndamento> => {
    const correlationId = randomUUID();
    const os = await prisma.ordemServico.create({
      data: {
        correlationId,
        clienteId: catalogo.clienteId,
        veiculoId: catalogo.veiculoId,
        status,
      },
    });
    return { osId: os.id, correlationId };
  };

  const estornoConcluido = (
    os: OsEmAndamento,
    payload: Record<string, unknown>,
    eventId = randomUUID(),
  ) =>
    entregar(
      servicos,
      os,
      EVENTO_ESTORNO_CONCLUIDO,
      payload,
      1,
      eventId,
      '2026-11-19T10:01:00.000Z',
    );

  const payloadEstorno = (
    orderId: string,
    cobrancaId: string,
    tipoEstorno = 'INTEGRAL',
  ) => ({
    cobrancaId,
    orderId,
    valorEstornadoCentavos: 50000,
    estornadoEm: '2026-11-19T10:00:00.000Z',
    tipoEstorno,
    statusOrderMercadoPago: 'refunded',
  });

  /** Estado do estoque e dos registros que a resolução manual nunca pode tocar. */
  const fotografiaDoEstoque = async (osId: string, pecaIds: string[]) => ({
    pecas: await prisma.peca.findMany({
      where: { id: { in: pecaIds } },
      select: {
        id: true,
        quantidadeEstoque: true,
        quantidadeReservada: true,
      },
      orderBy: { id: 'asc' },
    }),
    totalPecas: await prisma.peca.count(),
    ajustes: await prisma.ajusteEstoqueAdministrativo.count(),
    consumos: await prisma.consumoAplicadoOs.count({
      where: { ordemServicoId: osId },
    }),
    movimentacoes: await prisma.movimentacaoEstoque.count(),
  });

  /** Reparo concluído com divergência só em peças fora do catálogo: pendência INVENTARIO com a OS em EM_EXECUCAO. */
  const prepararInventarioForaDoCatalogo = async () => {
    const pecaDoCatalogo = await criarPecaSaga(prisma, 'resolucao', 10);
    const pecaInexistente = randomUUID();
    const identificadorInvalido = 'peca-invalida';
    const os = await prepararAguardandoPagamento(servicos, catalogo, [
      { pecaId: pecaDoCatalogo, quantidade: 2 },
    ]);
    const cobrancaId = randomUUID();
    await pagamentoConfirmado(servicos, os, cobrancaId, `ORD-${randomUUID()}`);
    await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
      tarefaId: `${os.osId}#1#REPARO`,
    });
    await entregar(servicos, os, EVENTO_REPARO_CONCLUIDO, {
      responsavelId: 'mecanico-1',
      pecasUtilizadas: [
        { itemId: pecaDoCatalogo, quantidade: 2 },
        { itemId: pecaInexistente, quantidade: 1 },
        { itemId: identificadorInvalido, quantidade: 1 },
      ],
      servicosRealizados: [],
      divergencias: [],
    });
    const aberta = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.osId,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);
    return {
      os,
      pendenciaId: aberta.id,
      pecaDoCatalogo,
      pecaInexistente,
      identificadorInvalido,
    };
  };

  describe('INVENTARIO de divergência de consumo fora do catálogo', () => {
    it('só tem peças fora do catálogo na pendência aberta pelo fluxo real', async () => {
      const { pendenciaId, pecaInexistente, identificadorInvalido } =
        await prepararInventarioForaDoCatalogo();

      const { detalhes } = await pendencia(pendenciaId);

      const pecas = (detalhes as { divergencias: { pecaId: string }[] })
        .divergencias;
      expect(pecas.map((d) => d.pecaId).sort()).toEqual(
        [pecaInexistente, identificadorInvalido].sort(),
      );
    });

    it('resolve, audita sem tocar nas chaves originais, não movimenta estoque e retoma a finalização', async () => {
      const preparo = await prepararInventarioForaDoCatalogo();
      const { os, pendenciaId, pecaDoCatalogo } = preparo;
      const antes = await pendencia(pendenciaId);
      const estoqueAntes = await fotografiaDoEstoque(os.osId, [pecaDoCatalogo]);
      const idempotencyKey = randomUUID();

      await resolverPendencia(os.osId, pendenciaId, idempotencyKey);

      const depois = await pendencia(pendenciaId);
      expect(depois).toMatchObject({
        resolvida: true,
        resolvidaPorId: responsavelId,
      });
      expect(depois.resolvidaEm).toBeInstanceOf(Date);
      const { resolucaoManual, ...demaisChaves } = depois.detalhes as Record<
        string,
        unknown
      >;
      expect(demaisChaves).toEqual(antes.detalhes);
      expect(resolucaoManual).toEqual({
        motivo: MOTIVO,
        responsavelId,
        resolvidaEm: depois.resolvidaEm!.toISOString(),
        caso: 'DIVERGENCIA_SOMENTE_FORA_DO_CATALOGO',
        evidencia: {
          pecasForaDoCatalogo: [
            preparo.pecaInexistente,
            preparo.identificadorInvalido,
          ].sort(),
        },
      });
      expect(await fotografiaDoEstoque(os.osId, [pecaDoCatalogo])).toEqual(
        estoqueAntes,
      );
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);
      expect(
        (
          await prisma.consumoAplicadoOs.findFirstOrThrow({
            where: { ordemServicoId: os.osId },
          })
        ).situacaoReconciliacao,
      ).toBe(SituacaoReconciliacaoConsumo.DIVERGENCIA_RESOLVIDA);
      expect(
        await prisma.ajusteEstoqueAdministrativo.count({
          where: { pendenciaId },
        }),
      ).toBe(0);
      expect(await contarRegistrosDeIdempotencia(idempotencyKey)).toBe(1);
    });

    it('com outra pendência bloqueante aberta, resolve só a pedida e mantém a OS em EM_EXECUCAO', async () => {
      const { os, pendenciaId } = await prepararInventarioForaDoCatalogo();
      const bloqueante = await abrirPendencia(
        os.osId,
        TipoPendenciaOs.FINANCEIRA,
        { cobrancaId: randomUUID(), motivo: 'Pendência financeira comum' },
      );

      await resolverPendencia(os.osId, pendenciaId);

      expect((await pendencia(pendenciaId)).resolvida).toBe(true);
      expect((await pendencia(bloqueante.id)).resolvida).toBe(false);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);
    });

    it('em EM_CANCELAMENTO retoma a compensação e segue ao financeiro', async () => {
      const pecaDoCatalogo = await criarPecaSaga(
        prisma,
        'resolucao-cancel',
        10,
      );
      const pecaInexistente = randomUUID();
      const os = await prepararAguardandoPagamento(servicos, catalogo, [
        { pecaId: pecaDoCatalogo, quantidade: 2 },
      ]);
      await pagamentoConfirmado(
        servicos,
        os,
        randomUUID(),
        `ORD-${randomUUID()}`,
      );
      await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
        tarefaId: `${os.osId}#1#REPARO`,
      });
      await servicos.desistir.execute(os.osId, { motivo: 'Cliente desistiu' });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);
      await entregar(servicos, os, EVENTO_REPARO_FALHOU, {
        tarefaId: `${os.osId}#1#REPARO`,
        falhouEm: '2026-11-19T10:00:00.000Z',
        responsavelId: 'mecanico-1',
        motivo: 'Peça incompatível',
        servicosRealizados: [],
        pecasUtilizadas: [
          { itemId: pecaDoCatalogo, quantidade: 2 },
          { itemId: pecaInexistente, quantidade: 1 },
        ],
        divergencias: [],
      });
      const aberta = await prisma.pendenciaOs.findFirstOrThrow({
        where: {
          ordemServicoId: os.osId,
          tipo: TipoPendenciaOs.INVENTARIO,
          resolvida: false,
        },
      });
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_FINANCEIRO,
        ),
      ).toBe(0);

      await resolverPendencia(os.osId, aberta.id);

      expect((await pendencia(aberta.id)).resolvida).toBe(true);
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_FINANCEIRO,
        ),
      ).toBe(1);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);
    });

    it('recusa quando uma peça divergente existe no catálogo, sem alterar nada', async () => {
      const { os, pendenciaId, pecaDoCatalogo } =
        await prepararInventarioForaDoCatalogo();
      const aberta = await pendencia(pendenciaId);
      await prisma.pendenciaOs.update({
        where: { id: pendenciaId },
        data: {
          detalhes: {
            ...(aberta.detalhes as Record<string, unknown>),
            divergencias: [
              ...(aberta.detalhes as { divergencias: unknown[] }).divergencias,
              { pecaId: pecaDoCatalogo },
            ],
          },
        },
      });
      const antes = await pendencia(pendenciaId);
      const idempotencyKey = randomUUID();

      await expect(
        resolverPendencia(os.osId, pendenciaId, idempotencyKey),
      ).rejects.toThrow(PendenciaNaoElegivelError);

      expect(await pendencia(pendenciaId)).toEqual(antes);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);
      expect(await contarRegistrosDeIdempotencia(idempotencyKey)).toBe(0);
    });

    it.each(['INFORMACAO_INSUFICIENTE', 'CONFLITO_CONSUMO'])(
      'recusa a natureza %s sem alterar nada',
      async (natureza) => {
        const os = await criarOsComStatus(StatusOS.EM_CANCELAMENTO);
        const aberta = await abrirPendencia(
          os.osId,
          TipoPendenciaOs.INVENTARIO,
          { natureza, divergencias: [{ pecaId: randomUUID() }] },
        );
        const idempotencyKey = randomUUID();

        await expect(
          resolverPendencia(os.osId, aberta.id, idempotencyKey),
        ).rejects.toThrow(PendenciaNaoElegivelError);

        expect(await pendencia(aberta.id)).toEqual(aberta);
        expect(await contarRegistrosDeIdempotencia(idempotencyKey)).toBe(0);
      },
    );
  });

  describe('FINANCEIRA SEGUNDO_PAGAMENTO', () => {
    const prepararSegundoPagamento = async (
      statusFinal: StatusOS = StatusOS.EM_EXECUCAO,
    ) => {
      const pecaId = await criarPecaSaga(prisma, 'segundo-pagamento', 10);
      const os = await prepararAguardandoPagamento(servicos, catalogo, [
        { pecaId, quantidade: 1 },
      ]);
      const cobrancaId = randomUUID();
      await pagamentoConfirmado(
        servicos,
        os,
        cobrancaId,
        `ORD-${randomUUID()}`,
      );
      if (statusFinal === StatusOS.EM_EXECUCAO) {
        await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
          tarefaId: `${os.osId}#1#REPARO`,
        });
      }
      const segundaOrder = `ORD-${randomUUID()}`;
      await pagamentoConfirmado(servicos, os, cobrancaId, segundaOrder);
      const aberta = await prisma.pendenciaOs.findFirstOrThrow({
        where: {
          ordemServicoId: os.osId,
          tipo: TipoPendenciaOs.FINANCEIRA,
          resolvida: false,
        },
      });
      expect(aberta.detalhes).toMatchObject({
        natureza: 'SEGUNDO_PAGAMENTO',
        orderId: segundaOrder,
      });
      expect(await statusDaOs(prisma, os.osId)).toBe(statusFinal);
      return { os, pecaId, cobrancaId, segundaOrder, pendenciaId: aberta.id };
    };

    it('sem evidência do Billing responde EVIDENCIA_BILLING_AUSENTE e não grava a chave', async () => {
      const { os, pendenciaId } = await prepararSegundoPagamento();
      const antes = await pendencia(pendenciaId);
      const idempotencyKey = randomUUID();

      await expect(
        resolverPendencia(os.osId, pendenciaId, idempotencyKey),
      ).rejects.toThrow(EvidenciaBillingAusenteError);

      expect(await pendencia(pendenciaId)).toEqual(antes);
      expect(await contarRegistrosDeIdempotencia(idempotencyKey)).toBe(0);
    });

    it('com estorno parcial ou de outro orderId o Billing ainda não comprovou o estorno integral', async () => {
      const { os, cobrancaId, segundaOrder, pendenciaId } =
        await prepararSegundoPagamento();

      await estornoConcluido(
        os,
        payloadEstorno(segundaOrder, cobrancaId, 'PARCIAL'),
      );
      await estornoConcluido(os, payloadEstorno('ORD-OUTRA', cobrancaId));

      await expect(resolverPendencia(os.osId, pendenciaId)).rejects.toThrow(
        EvidenciaBillingAusenteError,
      );
    });

    it.each([StatusOS.EM_EXECUCAO, StatusOS.AGUARDANDO_EXECUCAO])(
      'registra a evidência do estorno em %s sem resolver, sem mudar o status e de forma idempotente',
      async (status) => {
        const { os, cobrancaId, segundaOrder, pendenciaId } =
          await prepararSegundoPagamento(status);
        const eventId = randomUUID();
        const outraPendencia = await abrirPendencia(
          os.osId,
          TipoPendenciaOs.FINANCEIRA,
          { cobrancaId, motivo: 'Outra pendência da mesma cobrança' },
        );

        await estornoConcluido(
          os,
          payloadEstorno(segundaOrder, cobrancaId),
          eventId,
        );
        await estornoConcluido(
          os,
          payloadEstorno(segundaOrder, cobrancaId),
          eventId,
        );
        // Outro evento integral do mesmo orderId não substitui a evidência.
        await estornoConcluido(os, payloadEstorno(segundaOrder, cobrancaId));

        const registrada = await pendencia(pendenciaId);
        expect(registrada.resolvida).toBe(false);
        expect(registrada.detalhes).toMatchObject({
          natureza: 'SEGUNDO_PAGAMENTO',
          evidenciaEstornoBilling: {
            eventId,
            cobrancaId,
            orderId: segundaOrder,
            valorEstornadoCentavos: 50000,
            tipoEstorno: 'INTEGRAL',
            estornadoEm: '2026-11-19T10:00:00.000Z',
            statusOrderMercadoPago: 'refunded',
          },
        });
        expect((await pendencia(outraPendencia.id)).resolvida).toBe(false);
        expect(await statusDaOs(prisma, os.osId)).toBe(status);
      },
    );

    it('resolve com a evidência integral, audita, não muda o status e responde a repetição sem novo efeito', async () => {
      const { os, cobrancaId, segundaOrder, pendenciaId } =
        await prepararSegundoPagamento();
      await estornoConcluido(os, payloadEstorno(segundaOrder, cobrancaId));
      const outraPendencia = await abrirPendencia(
        os.osId,
        TipoPendenciaOs.FINANCEIRA,
        { cobrancaId, motivo: 'Outra pendência da mesma cobrança' },
      );
      const antes = await pendencia(pendenciaId);
      const idempotencyKey = randomUUID();

      await resolverPendencia(os.osId, pendenciaId, idempotencyKey);
      const resolvida = await pendencia(pendenciaId);
      await resolverPendencia(os.osId, pendenciaId, idempotencyKey);

      expect(resolvida).toMatchObject({
        resolvida: true,
        resolvidaPorId: responsavelId,
      });
      const { resolucaoManual, ...demaisChaves } = resolvida.detalhes as Record<
        string,
        unknown
      >;
      expect(demaisChaves).toEqual(antes.detalhes);
      expect(resolucaoManual).toMatchObject({
        motivo: MOTIVO,
        responsavelId,
        resolvidaEm: resolvida.resolvidaEm!.toISOString(),
        caso: 'SEGUNDO_PAGAMENTO_ESTORNADO',
        evidencia: {
          evidenciaEstornoBilling: expect.objectContaining({
            orderId: segundaOrder,
            tipoEstorno: 'INTEGRAL',
          }),
        },
      });
      expect(await pendencia(pendenciaId)).toEqual(resolvida);
      expect((await pendencia(outraPendencia.id)).resolvida).toBe(false);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);
      expect(await contarRegistrosDeIdempotencia(idempotencyKey)).toBe(1);
    });

    it('com a mesma chave e motivo diferente responde CONTEUDO_DIVERGENTE sem novo efeito', async () => {
      const { os, cobrancaId, segundaOrder, pendenciaId } =
        await prepararSegundoPagamento();
      await estornoConcluido(os, payloadEstorno(segundaOrder, cobrancaId));
      const idempotencyKey = randomUUID();
      await resolverPendencia(os.osId, pendenciaId, idempotencyKey);
      const resolvida = await pendencia(pendenciaId);

      await expect(
        resolverPendencia(
          os.osId,
          pendenciaId,
          idempotencyKey,
          'Outro motivo qualquer',
        ),
      ).rejects.toThrow(ConteudoDivergenteInternoError);

      expect(await pendencia(pendenciaId)).toEqual(resolvida);
    });

    it('com outra chave depois de resolvida responde PENDENCIA_NAO_ELEGIVEL', async () => {
      const { os, cobrancaId, segundaOrder, pendenciaId } =
        await prepararSegundoPagamento();
      await estornoConcluido(os, payloadEstorno(segundaOrder, cobrancaId));
      await resolverPendencia(os.osId, pendenciaId);
      const outraChave = randomUUID();

      await expect(
        resolverPendencia(os.osId, pendenciaId, outraChave),
      ).rejects.toThrow(PendenciaNaoElegivelError);

      expect(await contarRegistrosDeIdempotencia(outraChave)).toBe(0);
    });

    it('depois do encerramento o estorno registra a evidência sem resolver e a resolução manual não muda o status', async () => {
      const { os, pecaId, cobrancaId, segundaOrder, pendenciaId } =
        await prepararSegundoPagamento();
      await entregar(servicos, os, EVENTO_REPARO_CONCLUIDO, {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
        divergencias: [],
      });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);

      await estornoConcluido(os, payloadEstorno(segundaOrder, cobrancaId));

      expect((await pendencia(pendenciaId)).resolvida).toBe(false);
      expect((await pendencia(pendenciaId)).detalhes).toHaveProperty(
        'evidenciaEstornoBilling',
      );
      await resolverPendencia(os.osId, pendenciaId);
      expect((await pendencia(pendenciaId)).resolvida).toBe(true);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);
    });
  });

  describe('FINANCEIRA de PagamentoTardioRegistrado', () => {
    const abrirPagamentoTardio = async (tratamento: string) => {
      const os = await criarOsComStatus(StatusOS.CANCELADA);
      const cobrancaId = randomUUID();
      await entregar(servicos, os, EVENTO_PAGAMENTO_TARDIO_REGISTRADO, {
        cobrancaId,
        aprovadoEm: '2026-11-19T09:00:00.000Z',
        tratamento,
      });
      const aberta = await prisma.pendenciaOs.findFirstOrThrow({
        where: { ordemServicoId: os.osId, resolvida: false },
      });
      return {
        os,
        cobrancaId,
        pendenciaId: aberta.id,
        detalhes: aberta.detalhes,
      };
    };

    it('grava a natureza e o tratamento na abertura', async () => {
      const { detalhes, cobrancaId } =
        await abrirPagamentoTardio('ESTORNO_AUTOMATICO');

      expect(detalhes).toMatchObject({
        natureza: 'PAGAMENTO_TARDIO',
        tratamento: 'ESTORNO_AUTOMATICO',
        cobrancaId,
      });
    });

    it('resolve o reconhecimento do estorno automático, audita e não muda o status', async () => {
      const { os, pendenciaId, detalhes } =
        await abrirPagamentoTardio('ESTORNO_AUTOMATICO');

      await resolverPendencia(os.osId, pendenciaId);

      const resolvida = await pendencia(pendenciaId);
      expect(resolvida).toMatchObject({
        resolvida: true,
        resolvidaPorId: responsavelId,
      });
      expect(resolvida.detalhes).toEqual({
        ...(detalhes as Record<string, unknown>),
        resolucaoManual: {
          motivo: MOTIVO,
          responsavelId,
          resolvidaEm: resolvida.resolvidaEm!.toISOString(),
          caso: 'PAGAMENTO_TARDIO_ESTORNADO_AUTOMATICAMENTE',
          evidencia: { tratamento: 'ESTORNO_AUTOMATICO' },
        },
      });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.CANCELADA);
    });

    it('recusa o tratamento PENDENCIA_MANUAL sem alterar nada', async () => {
      const { os, pendenciaId } =
        await abrirPagamentoTardio('PENDENCIA_MANUAL');
      const antes = await pendencia(pendenciaId);
      const idempotencyKey = randomUUID();

      await expect(
        resolverPendencia(os.osId, pendenciaId, idempotencyKey),
      ).rejects.toThrow(PendenciaNaoElegivelError);

      expect(await pendencia(pendenciaId)).toEqual(antes);
      expect(await contarRegistrosDeIdempotencia(idempotencyKey)).toBe(0);
    });

    it('a natureza nova não muda a resolução automática do EstornoConcluido por cobrancaId', async () => {
      const { os, cobrancaId, pendenciaId } =
        await abrirPagamentoTardio('PENDENCIA_MANUAL');

      await estornoConcluido(os, {
        cobrancaId,
        valorEstornadoCentavos: 50000,
        estornadoEm: '2026-11-19T10:00:00.000Z',
      });

      expect(await pendencia(pendenciaId)).toMatchObject({ resolvida: true });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.CANCELADA);
    });
  });

  describe('pendência financeira comum e localização', () => {
    it('recusa a financeira comum e a já resolvida pelo fluxo normal', async () => {
      const os = await criarOsComStatus(StatusOS.CANCELADA);
      const comum = await abrirPendencia(os.osId, TipoPendenciaOs.FINANCEIRA, {
        cobrancaId: randomUUID(),
        motivo: 'Pagamento após encerramento',
      });
      const jaResolvida = await prisma.pendenciaOs.create({
        data: {
          id: randomUUID(),
          ordemServicoId: os.osId,
          rodada: 1,
          tipo: TipoPendenciaOs.FINANCEIRA,
          resolvida: true,
          detalhes: {
            natureza: 'PAGAMENTO_TARDIO',
            tratamento: 'ESTORNO_AUTOMATICO',
          },
        },
      });

      await expect(resolverPendencia(os.osId, comum.id)).rejects.toThrow(
        PendenciaNaoElegivelError,
      );
      await expect(resolverPendencia(os.osId, jaResolvida.id)).rejects.toThrow(
        PendenciaNaoElegivelError,
      );

      expect(await pendencia(comum.id)).toEqual(comum);
    });

    it('responde não encontrada para pendência inexistente ou de outra OS, sem alterá-la', async () => {
      const osA = await criarOsComStatus(StatusOS.CANCELADA);
      const osB = await criarOsComStatus(StatusOS.CANCELADA);
      const deOutraOs = await abrirPendencia(
        osB.osId,
        TipoPendenciaOs.FINANCEIRA,
        { natureza: 'PAGAMENTO_TARDIO', tratamento: 'ESTORNO_AUTOMATICO' },
      );

      await expect(resolverPendencia(osA.osId, deOutraOs.id)).rejects.toThrow(
        PendenciaNaoEncontradaError,
      );
      await expect(resolverPendencia(osA.osId, randomUUID())).rejects.toThrow(
        PendenciaNaoEncontradaError,
      );

      expect(await pendencia(deOutraOs.id)).toEqual(deOutraOs);
    });

    it('responde não encontrada para OS inexistente', async () => {
      await expect(
        resolverPendencia(randomUUID(), randomUUID()),
      ).rejects.toThrow(OrdemServicoNaoEncontradaError);
    });
  });

  describe('atomicidade, concorrência e idempotência', () => {
    const prepararElegivel = async () => {
      const os = await criarOsComStatus(StatusOS.CANCELADA);
      const aberta = await abrirPendencia(os.osId, TipoPendenciaOs.FINANCEIRA, {
        natureza: 'PAGAMENTO_TARDIO',
        tratamento: 'ESTORNO_AUTOMATICO',
        cobrancaId: randomUUID(),
      });
      return { os, pendenciaId: aberta.id };
    };

    /** Duas chamadas independentes disputam o bloqueio da OS mantido por uma terceira sessão. */
    const dispararConcorrentes = async (
      ordemServicoId: string,
      chamadas: (() => Promise<void>)[],
    ) => {
      const sessao = new SessaoBloqueioOrdemServico(
        exigirDatabaseUrl(),
        ordemServicoId,
      );
      try {
        await sessao.adquirir();
        const resultados = Promise.allSettled(
          chamadas.map((chamada) => chamada()),
        );
        await sessao.aguardarDisputaBloqueio(chamadas.length);
        await sessao.liberar();
        return await resultados;
      } finally {
        await sessao.descartar();
      }
    };

    it('com chaves diferentes, uma chamada resolve e a outra recebe PENDENCIA_NAO_ELEGIVEL', async () => {
      const { os, pendenciaId } = await prepararElegivel();
      const chaves = [randomUUID(), randomUUID()];

      const resultados = await dispararConcorrentes(
        os.osId,
        chaves.map(
          (chave) => () => resolverPendencia(os.osId, pendenciaId, chave),
        ),
      );

      expect(resultados.map((r) => r.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      const recusada = resultados.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(recusada?.reason).toBeInstanceOf(PendenciaNaoElegivelError);
      expect((await pendencia(pendenciaId)).resolvida).toBe(true);
      const registros = await Promise.all(
        chaves.map(contarRegistrosDeIdempotencia),
      );
      expect(registros.sort()).toEqual([0, 1]);
    });

    it('com a mesma chave, as duas chamadas respondem igual e o efeito acontece uma vez', async () => {
      const { os, pendenciaId } = await prepararElegivel();
      const chave = randomUUID();

      const resultados = await dispararConcorrentes(os.osId, [
        () => resolverPendencia(os.osId, pendenciaId, chave),
        () => resolverPendencia(os.osId, pendenciaId, chave),
      ]);

      expect(resultados.map((r) => r.status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
      expect((await pendencia(pendenciaId)).resolvida).toBe(true);
      expect(await contarRegistrosDeIdempotencia(chave)).toBe(1);
    });

    it('com a mesma chave em OS diferentes, uma resolve e a outra recebe CONTEUDO_DIVERGENTE', async () => {
      const primeira = await prepararElegivel();
      const segunda = await prepararElegivel();
      const chave = randomUUID();

      const resultados = await Promise.allSettled([
        resolverPendencia(primeira.os.osId, primeira.pendenciaId, chave),
        resolverPendencia(segunda.os.osId, segunda.pendenciaId, chave),
      ]);

      expect(resultados.map((r) => r.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      const recusada = resultados.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(recusada?.reason).toBeInstanceOf(ConteudoDivergenteInternoError);
      const resolvidas = await Promise.all(
        [primeira, segunda].map(
          async (p) => (await pendencia(p.pendenciaId)).resolvida,
        ),
      );
      expect(resolvidas.sort()).toEqual([false, true]);
      expect(await contarRegistrosDeIdempotencia(chave)).toBe(1);
    });

    it('desfaz a resolução e não grava a chave quando a retomada falha', async () => {
      const { os, pendenciaId } = await prepararElegivel();
      const inventario = await abrirPendencia(
        os.osId,
        TipoPendenciaOs.INVENTARIO,
        {
          natureza: 'DIVERGENCIA_CONSUMO',
          divergencias: [{ pecaId: 'peca-invalida' }],
        },
      );
      const casoComRetomadaQuebrada = new ResolverPendenciaManualUseCase(
        modulo.get(ORDEM_SERVICO_GATEWAY, opcoesModulo),
        modulo.get(PENDENCIA_OS_GATEWAY, opcoesModulo),
        modulo.get(RESERVA_ESTOQUE_GATEWAY, opcoesModulo),
        {
          retomarAposResolucaoInventario: () =>
            Promise.reject(new Error('falha na retomada')),
        },
        modulo.get(UNIT_OF_WORK, opcoesModulo),
        modulo.get(IdempotencyService, opcoesModulo),
        prisma,
      );
      const chave = randomUUID();

      await expect(
        casoComRetomadaQuebrada.execute({
          ordemServicoId: os.osId,
          pendenciaId: inventario.id,
          motivo: MOTIVO,
          responsavelId,
          idempotencyKey: chave,
        }),
      ).rejects.toThrow('falha na retomada');

      expect(await pendencia(inventario.id)).toEqual(inventario);
      expect(await contarRegistrosDeIdempotencia(chave)).toBe(0);
      expect((await pendencia(pendenciaId)).resolvida).toBe(false);
    });
  });
});
