import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/shared/database/prisma.service';
import { StatusOS } from '@/shared/generated/prisma/enums';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_INICIAR_REPARO,
  EVENTO_ESTORNO_CONCLUIDO,
  EVENTO_PAGAMENTO_DISPONIVEL,
  EVENTO_PAGAMENTO_TARDIO_REGISTRADO,
  EVENTO_REPARO_INICIADO,
  EVENTO_RESPOSTA_CANCELAMENTO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} from '@/shared/messaging/envelope';
import { RegistrarRetiradaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-retirada.use-case';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';
import {
  cobrancaCriada,
  contarOutboxSaga,
  contarPendenciasFinanceiras,
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
 * Orders da rodada e pagamento (06-saga, decisão de 2026-11-18): só é
 * repetição o `PagamentoConfirmado` de uma order já paga; order criada
 * (`CobrancaCriada`) ou reemitida (D1.15) e ainda não paga não conta como paga.
 */
describe('Saga — pagamento e orders da rodada (integração)', () => {
  let modulo: TestingModule;
  let servicos: ServicosSaga;
  let prisma: PrismaService;
  let catalogo: CatalogoSaga;
  let pecaId: string;

  beforeAll(async () => {
    modulo = await criarModuloSaga();
    servicos = obterServicosSaga(modulo);
    prisma = servicos.prisma;
    catalogo = await criarCatalogoSaga(prisma, 'pagamento-orders');
    pecaId = await criarPecaSaga(prisma, 'pagamento-orders');
  });

  afterAll(async () => {
    await fecharModuloIntegracao(modulo);
  });

  const preparar = () =>
    prepararAguardandoPagamento(servicos, catalogo, [
      { pecaId, quantidade: 1 },
    ]);

  const orderNova = () => `ORD-${randomUUID().slice(0, 12)}`;

  const contarMensagensDaOs = (os: OsEmAndamento) =>
    prisma.outboxMensagem.count({ where: { correlationId: os.correlationId } });

  const iniciarReparoEmitidos = (os: OsEmAndamento) =>
    contarOutboxSaga(prisma, os.correlationId, COMANDO_INICIAR_REPARO);

  const resumoDoPagamento = async (os: OsEmAndamento) =>
    (await servicos.buscar.execute(os.osId)).resumoFinanceiro.pagamento;

  describe('CobrancaCriada seguida de PagamentoConfirmado', () => {
    it('aplica o pagamento da order criada e leva a OS a AGUARDANDO_EXECUCAO', async () => {
      const os = await preparar();
      const cobrancaId = randomUUID();
      const orderId = orderNova();

      await cobrancaCriada(servicos, os, cobrancaId, orderId);
      expect(await statusDaOs(prisma, os.osId)).toBe(
        StatusOS.AGUARDANDO_PAGAMENTO,
      );
      await pagamentoConfirmado(servicos, os, cobrancaId, orderId);

      expect(await statusDaOs(prisma, os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      expect(await iniciarReparoEmitidos(os)).toBe(1);
      expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(0);
      expect(await resumoDoPagamento(os)).toMatchObject({ orderId });
    });

    it('ignora a reentrega do pagamento da mesma order, sem novo comando nem pendência', async () => {
      const os = await preparar();
      const cobrancaId = randomUUID();
      const orderId = orderNova();
      await cobrancaCriada(servicos, os, cobrancaId, orderId);
      await pagamentoConfirmado(servicos, os, cobrancaId, orderId);
      const historicoAntes = await prisma.historicoStatusOS.count({
        where: { ordemServicoId: os.osId },
      });

      await pagamentoConfirmado(servicos, os, cobrancaId, orderId);

      expect(await statusDaOs(prisma, os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      expect(await iniciarReparoEmitidos(os)).toBe(1);
      expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(0);
      expect(
        await prisma.historicoStatusOS.count({
          where: { ordemServicoId: os.osId },
        }),
      ).toBe(historicoAntes);
    });
  });

  describe('reemissão da cobrança na mesma rodada (D1.15)', () => {
    const emitirReemissao = async () => {
      const os = await preparar();
      const cobrancaId = randomUUID();
      const primeiraOrder = orderNova();
      const novaOrder = orderNova();
      await cobrancaCriada(servicos, os, cobrancaId, primeiraOrder);
      await cobrancaCriada(servicos, os, cobrancaId, novaOrder);
      return { os, cobrancaId, primeiraOrder, novaOrder };
    };

    it('registra as duas orders, notifica cada link e mostra a mais recente enquanto nenhuma foi paga', async () => {
      const { os, primeiraOrder, novaOrder } = await emitirReemissao();

      const orders = await prisma.projecaoFinanceiraOs.findMany({
        where: { ordemServicoId: os.osId, natureza: 'PAGAMENTO' },
        orderBy: { criadoEm: 'asc' },
      });
      expect(orders.map((o) => o.orderId)).toEqual([primeiraOrder, novaOrder]);
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          EVENTO_PAGAMENTO_DISPONIVEL,
        ),
      ).toBe(2);
      expect(await resumoDoPagamento(os)).toMatchObject({ orderId: novaOrder });
      expect(await statusDaOs(prisma, os.osId)).toBe(
        StatusOS.AGUARDANDO_PAGAMENTO,
      );
    });

    it('aplica o pagamento da nova order, e a repetição em FINALIZADA não abre pendência financeira', async () => {
      const { os, cobrancaId, novaOrder } = await emitirReemissao();

      await pagamentoConfirmado(servicos, os, cobrancaId, novaOrder);
      expect(await statusDaOs(prisma, os.osId)).toBe(
        StatusOS.AGUARDANDO_EXECUCAO,
      );
      expect(await resumoDoPagamento(os)).toMatchObject({
        orderId: novaOrder,
      });

      await iniciarEConcluirReparo(servicos, os, [
        { itemId: pecaId, quantidade: 1 },
      ]);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);

      await pagamentoConfirmado(servicos, os, cobrancaId, novaOrder);

      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);
      expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(0);
      expect(await iniciarReparoEmitidos(os)).toBe(1);
    });

    it('trata o pagamento de outra order depois do encerramento como segundo pagamento (pendência) e o resumo segue na order paga', async () => {
      const { os, cobrancaId, primeiraOrder, novaOrder } =
        await emitirReemissao();
      await pagamentoConfirmado(servicos, os, cobrancaId, novaOrder);
      await iniciarEConcluirReparo(servicos, os, [
        { itemId: pecaId, quantidade: 1 },
      ]);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);

      await pagamentoConfirmado(servicos, os, cobrancaId, primeiraOrder);

      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);
      const pendencias = await prisma.pendenciaOs.findMany({
        where: { ordemServicoId: os.osId, tipo: 'FINANCEIRA' },
      });
      expect(pendencias).toHaveLength(1);
      expect(pendencias[0].detalhes).toMatchObject({
        natureza: 'SEGUNDO_PAGAMENTO',
        orderId: primeiraOrder,
        cobrancaId,
        motivo: 'Segundo pagamento após encerramento',
      });
      expect(await resumoDoPagamento(os)).toMatchObject({
        orderId: novaOrder,
      });

      await pagamentoConfirmado(servicos, os, cobrancaId, primeiraOrder);
      expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(1);
    });

    it.each([
      ['AGUARDANDO_EXECUCAO', StatusOS.AGUARDANDO_EXECUCAO, false],
      ['EM_EXECUCAO', StatusOS.EM_EXECUCAO, true],
    ])(
      'pagamento de outra order em %s abre uma pendência financeira, sem mudar o status nem emitir comando',
      async (_nome, statusEsperado, comReparoIniciado) => {
        const { os, cobrancaId, primeiraOrder, novaOrder } =
          await emitirReemissao();
        await pagamentoConfirmado(servicos, os, cobrancaId, novaOrder);
        if (comReparoIniciado) {
          await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
            tarefaId: `${os.osId}#1#REPARO`,
          });
        }
        expect(await statusDaOs(prisma, os.osId)).toBe(statusEsperado);
        const mensagensAntes = await contarMensagensDaOs(os);

        await pagamentoConfirmado(servicos, os, cobrancaId, primeiraOrder);
        await pagamentoConfirmado(servicos, os, cobrancaId, primeiraOrder);

        expect(await statusDaOs(prisma, os.osId)).toBe(statusEsperado);
        expect(await iniciarReparoEmitidos(os)).toBe(1);
        expect(await contarMensagensDaOs(os)).toBe(mensagensAntes);
        const pendencias = await prisma.pendenciaOs.findMany({
          where: { ordemServicoId: os.osId, tipo: 'FINANCEIRA' },
        });
        expect(pendencias).toHaveLength(1);
        expect(pendencias[0]).toMatchObject({ resolvida: false });
        expect(pendencias[0].detalhes).toMatchObject({
          orderId: primeiraOrder,
          cobrancaId,
          natureza: 'SEGUNDO_PAGAMENTO',
          motivo: 'Segundo pagamento antes do encerramento',
        });
        const confirmadas = await prisma.projecaoFinanceiraOs.count({
          where: { ordemServicoId: os.osId, natureza: 'CONFIRMACAO' },
        });
        expect(confirmadas).toBe(2);
      },
    );
  });

  describe('o segundo pagamento não bloqueia a compensação', () => {
    it('depois do segundo pagamento em AGUARDANDO_EXECUCAO a desistência avança até CANCELADA e a pendência informativa continua aberta', async () => {
      const os = await preparar();
      const cobrancaId = randomUUID();
      await pagamentoConfirmado(servicos, os, cobrancaId, orderNova());
      const outraOrder = orderNova();
      await pagamentoConfirmado(servicos, os, cobrancaId, outraOrder);
      expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(1);

      await servicos.desistir.execute(os.osId, { motivo: 'Desistência' });

      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_TAREFA,
        ),
      ).toBe(1);

      await entregar(
        servicos,
        os,
        EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
        payloadDoExemploExecution(
          'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1',
        ),
      );
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_FINANCEIRO,
        ),
      ).toBe(1);
      await entregar(
        servicos,
        os,
        EVENTO_RESPOSTA_CANCELAMENTO,
        payloadDoExemploBilling('billing.resposta-cancelamento-financeiro.v1'),
      );

      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.CANCELADA);
      const pendencias = await prisma.pendenciaOs.findMany({
        where: { ordemServicoId: os.osId, tipo: 'FINANCEIRA' },
      });
      expect(pendencias).toHaveLength(1);
      expect(pendencias[0]).toMatchObject({ resolvida: false });
      expect(pendencias[0].detalhes).toMatchObject({
        natureza: 'SEGUNDO_PAGAMENTO',
        orderId: outraOrder,
        cobrancaId,
      });
    });
  });

  describe('EstornoConcluido e a pendência do segundo pagamento', () => {
    const estornoConcluido = (cobrancaId: string) => ({
      ...payloadDoExemploBilling('billing.estorno-concluido.v1'),
      cobrancaId,
    });

    it('com outra pendência financeira da mesma cobrança, o estorno resolve só a outra', async () => {
      const os = await preparar();
      const cobrancaId = randomUUID();
      await pagamentoConfirmado(servicos, os, cobrancaId, orderNova());
      await pagamentoConfirmado(servicos, os, cobrancaId, orderNova());
      await iniciarEConcluirReparo(servicos, os, [
        { itemId: pecaId, quantidade: 1 },
      ]);
      await modulo
        .get(RegistrarRetiradaUseCase, { strict: false })
        .execute(os.osId);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.ENTREGUE);
      await entregar(servicos, os, EVENTO_PAGAMENTO_TARDIO_REGISTRADO, {
        ...payloadDoExemploBilling('billing.pagamento-tardio-registrado.v1'),
        cobrancaId,
      });
      const abertasAntes = await prisma.pendenciaOs.findMany({
        where: {
          ordemServicoId: os.osId,
          tipo: 'FINANCEIRA',
          resolvida: false,
        },
      });
      expect(abertasAntes).toHaveLength(2);

      await entregar(
        servicos,
        os,
        EVENTO_ESTORNO_CONCLUIDO,
        estornoConcluido(cobrancaId),
      );

      const abertas = await prisma.pendenciaOs.findMany({
        where: {
          ordemServicoId: os.osId,
          tipo: 'FINANCEIRA',
          resolvida: false,
        },
      });
      expect(abertas).toHaveLength(1);
      expect(abertas[0].detalhes).toMatchObject({
        natureza: 'SEGUNDO_PAGAMENTO',
        cobrancaId,
      });
      expect(await contarPendenciasFinanceiras(prisma, os.osId, true)).toBe(1);
    });

    it.each([
      ['AGUARDANDO_EXECUCAO', false],
      ['FINALIZADA', true],
    ])(
      'com só a pendência SEGUNDO_PAGAMENTO aberta em %s, o estorno não a fecha',
      async (_nome, finalizada) => {
        const os = await preparar();
        const cobrancaId = randomUUID();
        await pagamentoConfirmado(servicos, os, cobrancaId, orderNova());
        await pagamentoConfirmado(servicos, os, cobrancaId, orderNova());
        if (finalizada) {
          await iniciarEConcluirReparo(servicos, os, [
            { itemId: pecaId, quantidade: 1 },
          ]);
        }
        const statusAntes = await statusDaOs(prisma, os.osId);
        expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(1);

        await entregar(
          servicos,
          os,
          EVENTO_ESTORNO_CONCLUIDO,
          estornoConcluido(cobrancaId),
        );

        expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(1);
        expect(await contarPendenciasFinanceiras(prisma, os.osId, true)).toBe(
          0,
        );
        expect(await statusDaOs(prisma, os.osId)).toBe(statusAntes);
      },
    );
  });

  describe('PagamentoTardioRegistrado com a OS encerrada (D4.10)', () => {
    const entregarTardio = (os: OsEmAndamento, cobrancaId: string) =>
      entregar(servicos, os, EVENTO_PAGAMENTO_TARDIO_REGISTRADO, {
        cobrancaId,
        aprovadoEm: '2026-06-15T15:00:00.000Z',
        tratamento: 'PENDENCIA_MANUAL',
      });

    it('em CANCELADA registra pendência financeira sem mudar o status, uma só por cobrança, e o estorno a resolve', async () => {
      const os = await preparar();
      await servicos.desistir.execute(os.osId, { motivo: 'Desistência' });
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_FINANCEIRO,
        ),
      ).toBe(1);
      await entregar(servicos, os, EVENTO_RESPOSTA_CANCELAMENTO, {
        resultado: 'NADA_A_CANCELAR',
      });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.CANCELADA);
      const cobrancaId = randomUUID();

      await entregarTardio(os, cobrancaId);
      await entregarTardio(os, cobrancaId);

      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.CANCELADA);
      const pendencias = await prisma.pendenciaOs.findMany({
        where: { ordemServicoId: os.osId, tipo: 'FINANCEIRA' },
      });
      expect(pendencias).toHaveLength(1);
      expect(pendencias[0]).toMatchObject({ resolvida: false });
      expect(pendencias[0].detalhes).toMatchObject({ cobrancaId });

      await entregar(servicos, os, EVENTO_ESTORNO_CONCLUIDO, {
        cobrancaId,
        valorEstornadoCentavos: 50000,
        estornadoEm: '2026-06-15T16:00:00.000Z',
      });
      expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(0);
      expect(await contarPendenciasFinanceiras(prisma, os.osId, true)).toBe(1);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.CANCELADA);
    });

    it('em ENTREGUE registra pendência financeira sem mudar o status', async () => {
      const os = await preparar();
      const cobrancaId = randomUUID();
      const orderId = orderNova();
      await pagamentoConfirmado(servicos, os, cobrancaId, orderId);
      await iniciarEConcluirReparo(servicos, os, [
        { itemId: pecaId, quantidade: 1 },
      ]);
      await modulo
        .get(RegistrarRetiradaUseCase, { strict: false })
        .execute(os.osId);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.ENTREGUE);

      await entregarTardio(os, randomUUID());

      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.ENTREGUE);
      expect(await contarPendenciasFinanceiras(prisma, os.osId)).toBe(1);
    });
  });
});
