import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  SituacaoReconciliacaoConsumo,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  EVENTO_PENDENCIA_RESOLVIDA,
  EVENTO_REPARO_FALHOU,
  EVENTO_REPARO_INICIADO,
  EVENTO_REPARO_INTERROMPIDO,
  EVENTO_RESPOSTA_CANCELAMENTO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} from '@/shared/messaging/envelope';
import { contarPendenciaNatureza } from './helpers/e42-envelope';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';
import {
  contarOutboxSaga,
  criarCatalogoSaga,
  criarModuloSaga,
  criarPecaSaga,
  entregar,
  obterServicosSaga,
  pagamentoConfirmado,
  payloadDoExemploExecution,
  prepararAguardandoPagamento,
  statusDaOs,
  type CatalogoSaga,
  type OsEmAndamento,
  type ServicosSaga,
} from './helpers/jornada-saga-os';

const QUANDO_O_REPARO_FALHOU = '2026-11-18T10:00:00.000Z';
const INFORMACAO_INSUFICIENTE = 'INFORMACAO_INSUFICIENTE';
const CONFLITO_CONSUMO = 'CONFLITO_CONSUMO';
const DIVERGENCIA_CONSUMO = 'DIVERGENCIA_CONSUMO';

describe('Saga — cancelamento: correções do complemento da E32 (integração)', () => {
  let modulo: TestingModule;
  let servicos: ServicosSaga;
  let prisma: PrismaService;
  let catalogo: CatalogoSaga;

  beforeAll(async () => {
    modulo = await criarModuloSaga();
    servicos = obterServicosSaga(modulo);
    prisma = servicos.prisma;
    catalogo = await criarCatalogoSaga(prisma, 'cancelamento-correcoes');
  });

  afterAll(async () => {
    await fecharModuloIntegracao(modulo);
  });

  /** Ordem paga, reparo iniciado, estoque reservado e cancelamento pedido ao Execution. */
  const prepararEmCancelamentoDoReparo = async (
    pecas: { pecaId: string; quantidade: number }[],
  ): Promise<OsEmAndamento> => {
    const os = await prepararAguardandoPagamento(servicos, catalogo, pecas);
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
    expect(
      await contarOutboxSaga(prisma, os.correlationId, COMANDO_CANCELAR_TAREFA),
    ).toBe(1);
    return os;
  };

  const novaPeca = (estoque = 10) =>
    criarPecaSaga(prisma, 'cancelamento', estoque);

  const estoqueDaPeca = async (pecaId: string) => {
    const peca = await prisma.peca.findUniqueOrThrow({
      where: { id: pecaId },
      select: { quantidadeEstoque: true, quantidadeReservada: true },
    });
    return {
      fisico: peca.quantidadeEstoque,
      reservado: peca.quantidadeReservada,
    };
  };

  const pendenciasInventarioAbertas = (osId: string) =>
    prisma.pendenciaOs.findMany({
      where: {
        ordemServicoId: osId,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });

  const estadoDaCompensacao = (osId: string) =>
    prisma.estadoCompensacaoOs.findUniqueOrThrow({
      where: { ordemServicoId: osId },
    });

  const consumoDoReparo = (
    consumos: { pecaId: string; reservada: number; utilizada: number }[],
  ) => ({
    responsavelId: 'mecanico-1',
    motivo: 'Peça incompatível',
    servicosRealizados: [],
    pecasUtilizadas: consumos.map((c) => ({
      itemId: c.pecaId,
      quantidade: c.utilizada,
    })),
    divergencias: consumos.map((c) => ({
      itemId: c.pecaId,
      tipo: 'CONSUMO_ACIMA',
      quantidadePrevista: c.reservada,
      quantidadeUtilizada: c.utilizada,
      observacao: 'Consumo efetivo acima do autorizado para a peça.',
      justificativa: 'Peça adicional usada no reparo emergencial.',
    })),
  });

  const respostaDaFalha = (
    consumo: ReturnType<typeof consumoDoReparo>,
    fatoTerminalEventId?: string,
  ) => ({
    tipoTarefa: 'REPARO',
    resultado: 'JA_ENCERRADA',
    situacaoTarefa: 'FALHOU',
    encerradaEm: QUANDO_O_REPARO_FALHOU,
    ...consumo,
    ...(fatoTerminalEventId ? { fatoTerminalEventId } : {}),
  });

  const fatoDaFalha = (
    os: OsEmAndamento,
    consumo: ReturnType<typeof consumoDoReparo>,
    eventId = randomUUID(),
  ) =>
    entregar(
      servicos,
      os,
      EVENTO_REPARO_FALHOU,
      {
        tarefaId: `${os.osId}#1#REPARO`,
        falhouEm: QUANDO_O_REPARO_FALHOU,
        ...consumo,
      },
      1,
      eventId,
      QUANDO_O_REPARO_FALHOU,
    );

  describe('A — resposta sem os campos aditivos (03, regra (c))', () => {
    it('o exemplo de retrocompatibilidade do Execution abre INFORMACAO_INSUFICIENTE sem consumo e sem erro permanente', async () => {
      const pecaId = await novaPeca();
      const os = await prepararEmCancelamentoDoReparo([
        { pecaId, quantidade: 2 },
      ]);
      const payload = payloadDoExemploExecution(
        'execution.resposta-cancelamento-retrocompatibilidade.v1',
      );
      expect(payload).not.toHaveProperty('situacaoTarefa');
      expect(payload).not.toHaveProperty('encerradaEm');

      await entregar(
        servicos,
        os,
        EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
        payload,
      );

      const abertas = await pendenciasInventarioAbertas(os.osId);
      expect(abertas).toHaveLength(1);
      expect(abertas[0].detalhes).toMatchObject({
        natureza: INFORMACAO_INSUFICIENTE,
        conteudo: { tipoTarefa: 'REPARO', resultado: 'JA_CONCLUIDA' },
      });
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.osId },
        }),
      ).toBe(0);
      expect(await estoqueDaPeca(pecaId)).toEqual({ fisico: 10, reservado: 2 });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_FINANCEIRO,
        ),
      ).toBe(0);
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
        ),
      ).toBe(0);
    });
  });

  describe('P2 — reparo cancelado sem início ou sem existir (06-saga, D1.20)', () => {
    it.each([
      [
        'CANCELADA_SEM_INICIO',
        'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1',
      ],
      [
        'CANCELADA_SEM_EXISTIR',
        'execution.resposta-cancelamento-cancelada-sem-existir.v1',
      ],
    ])(
      '%s envia CancelarFinanceiro com REPARO_NAO_INICIADO',
      async (resultado, exemplo) => {
        const pecaId = await novaPeca();
        const os = await prepararEmCancelamentoDoReparo([
          { pecaId, quantidade: 1 },
        ]);
        const payload = {
          ...payloadDoExemploExecution(exemplo),
          tipoTarefa: 'REPARO',
        };
        expect(payload.resultado).toBe(resultado);

        await entregar(
          servicos,
          os,
          EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
          payload,
        );

        const comando = await prisma.outboxMensagem.findFirstOrThrow({
          where: {
            correlationId: os.correlationId,
            eventType: COMANDO_CANCELAR_FINANCEIRO,
          },
        });
        expect(
          (comando.envelope as { payload: { resultadoExecucao: string } })
            .payload.resultadoExecucao,
        ).toBe('REPARO_NAO_INICIADO');
      },
    );

    const resultadoExecucaoDoFinanceiro = async (os: OsEmAndamento) => {
      const comandos = await prisma.outboxMensagem.findMany({
        where: {
          correlationId: os.correlationId,
          eventType: COMANDO_CANCELAR_FINANCEIRO,
        },
      });
      expect(comandos).toHaveLength(1);
      return (
        comandos[0].envelope as { payload: { resultadoExecucao: string } }
      ).payload.resultadoExecucao;
    };

    it('reparo JA_ENCERRADA (falhou) com o fato terminal segue com REPARO_INICIADO', async () => {
      const pecaId = await novaPeca();
      const os = await prepararEmCancelamentoDoReparo([
        { pecaId, quantidade: 1 },
      ]);

      await entregar(
        servicos,
        os,
        EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
        respostaDaFalha(consumoDoReparo([]), randomUUID()),
      );

      expect(await resultadoExecucaoDoFinanceiro(os)).toBe('REPARO_INICIADO');
    });

    it('INTERRUPCAO_SOLICITADA e depois ReparoInterrompido seguem com REPARO_INICIADO', async () => {
      const pecaId = await novaPeca();
      const os = await prepararEmCancelamentoDoReparo([
        { pecaId, quantidade: 1 },
      ]);
      await entregar(servicos, os, EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO, {
        tipoTarefa: 'REPARO',
        resultado: 'INTERRUPCAO_SOLICITADA',
      });
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_FINANCEIRO,
        ),
      ).toBe(0);

      await entregar(servicos, os, EVENTO_REPARO_INTERROMPIDO, {
        pecasUtilizadas: [],
      });

      expect(await resultadoExecucaoDoFinanceiro(os)).toBe('REPARO_INICIADO');
    });

    it('ReparoIniciado recebido durante o cancelamento prevalece sobre CANCELADA_SEM_INICIO', async () => {
      const pecaId = await novaPeca();
      const os = await prepararAguardandoPagamento(servicos, catalogo, [
        { pecaId, quantidade: 1 },
      ]);
      await pagamentoConfirmado(
        servicos,
        os,
        randomUUID(),
        `ORD-${randomUUID()}`,
      );
      await servicos.desistir.execute(os.osId, { motivo: 'Cliente desistiu' });
      await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
        tarefaId: `${os.osId}#1#REPARO`,
      });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);

      await entregar(servicos, os, EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO, {
        ...payloadDoExemploExecution(
          'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1',
        ),
      });

      expect(await resultadoExecucaoDoFinanceiro(os)).toBe('REPARO_INICIADO');
    });

    it('fato terminal recebido durante o cancelamento mantém REPARO_INICIADO mesmo com CANCELADA_SEM_INICIO depois', async () => {
      const pecaId = await novaPeca();
      const os = await prepararEmCancelamentoDoReparo([
        { pecaId, quantidade: 1 },
      ]);
      await entregar(servicos, os, EVENTO_REPARO_INTERROMPIDO, {
        pecasUtilizadas: [],
      });

      await entregar(servicos, os, EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO, {
        ...payloadDoExemploExecution(
          'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1',
        ),
      });

      expect(await resultadoExecucaoDoFinanceiro(os)).toBe('REPARO_INICIADO');
    });
  });

  describe('resposta estruturalmente inválida: CANCELADA_EM_ANDAMENTO com reparo', () => {
    it('é recusada como mensagem inválida, sem alterar a OS nem a compensação e sem CancelarFinanceiro', async () => {
      const pecaId = await novaPeca();
      const os = await prepararEmCancelamentoDoReparo([
        { pecaId, quantidade: 1 },
      ]);
      const estadoAntes = await estadoDaCompensacao(os.osId);
      const outboxAntes = await prisma.outboxMensagem.count({
        where: { correlationId: os.correlationId },
      });

      await expect(
        entregar(servicos, os, EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO, {
          tipoTarefa: 'REPARO',
          resultado: 'CANCELADA_EM_ANDAMENTO',
        }),
      ).rejects.toThrow();

      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);
      expect(await estadoDaCompensacao(os.osId)).toEqual(estadoAntes);
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_FINANCEIRO,
        ),
      ).toBe(0);
      expect(
        await prisma.outboxMensagem.count({
          where: { correlationId: os.correlationId },
        }),
      ).toBe(outboxAntes);
    });
  });

  describe('P3 — fato terminal com divergência pendente em EM_CANCELAMENTO (D4.3)', () => {
    it('registra o fato, não reenvia CancelarTarefa depois do ajuste, segue ao financeiro e termina em CANCELADA', async () => {
      const pecaId = await novaPeca();
      const os = await prepararEmCancelamentoDoReparo([
        { pecaId, quantidade: 2 },
      ]);
      const consumo = consumoDoReparo([{ pecaId, reservada: 2, utilizada: 3 }]);

      // 1. A tarefa já havia falhado, mas a resposta não traz o fato terminal original.
      await entregar(
        servicos,
        os,
        EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
        respostaDaFalha(consumo),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.osId, INFORMACAO_INSUFICIENTE),
      ).toBe(1);
      expect(await estoqueDaPeca(pecaId)).toEqual({ fisico: 10, reservado: 2 });

      // 2. O fato terminal chega depois, com consumo acima do autorizado.
      const fatoEventId = randomUUID();
      await fatoDaFalha(os, consumo, fatoEventId);

      expect(
        await contarPendenciaNatureza(prisma, os.osId, INFORMACAO_INSUFICIENTE),
      ).toBe(0);
      const divergencia = (await pendenciasInventarioAbertas(os.osId))[0];
      expect(divergencia.detalhes).toMatchObject({
        natureza: DIVERGENCIA_CONSUMO,
      });
      const consumoGravado = await prisma.consumoAplicadoOs.findFirstOrThrow({
        where: { ordemServicoId: os.osId },
      });
      expect(consumoGravado).toMatchObject({
        eventId: fatoEventId,
        situacaoReconciliacao:
          SituacaoReconciliacaoConsumo.DIVERGENCIA_PENDENTE,
      });
      expect(await estoqueDaPeca(pecaId)).toEqual({ fisico: 8, reservado: 0 });
      // O fato fica registrado mesmo com a divergência pendente.
      expect(await estadoDaCompensacao(os.osId)).toMatchObject({
        fatoTerminalExecucao: true,
        passo: 'FINANCEIRO',
        resultadoExecucao: 'REPARO_INICIADO',
        aguardandoResposta: false,
      });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_FINANCEIRO,
        ),
      ).toBe(0);

      // 3. O ajuste do administrador resolve a pendência e a saga segue ao financeiro.
      await servicos.ajustarInventario.execute({
        pendenciaId: divergencia.id,
        pecaId,
        quantidadeFisicaNova: 7,
        motivo: 'Contagem física depois da falha do reparo',
        responsavelId: randomUUID(),
      });
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_TAREFA,
        ),
      ).toBe(1);
      const comandosFinanceiros = await prisma.outboxMensagem.findMany({
        where: {
          correlationId: os.correlationId,
          eventType: COMANDO_CANCELAR_FINANCEIRO,
        },
      });
      expect(comandosFinanceiros).toHaveLength(1);
      expect(
        (
          comandosFinanceiros[0].envelope as {
            payload: { resultadoExecucao: string };
          }
        ).payload.resultadoExecucao,
      ).toBe('REPARO_INICIADO');
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);

      // 4. Billing abre a pendência manual e, resolvida, a OS termina CANCELADA.
      const pendenciaFinanceiraId = randomUUID();
      await entregar(servicos, os, EVENTO_RESPOSTA_CANCELAMENTO, {
        resultado: 'PENDENCIA_MANUAL_ABERTA',
        pendenciaId: pendenciaFinanceiraId,
      });
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_CANCELAMENTO);
      await entregar(servicos, os, EVENTO_PENDENCIA_RESOLVIDA, {
        pendenciaId: pendenciaFinanceiraId,
        decisao: 'ESTORNO_INTEGRAL',
        valorEstornadoCentavos: 50000,
      });

      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.CANCELADA);
      expect(
        await contarOutboxSaga(
          prisma,
          os.correlationId,
          COMANDO_CANCELAR_TAREFA,
        ),
      ).toBe(1);
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.osId },
        }),
      ).toBe(1);

      // Reentrega do fato terminal: sem nova baixa nem regressão.
      await fatoDaFalha(os, consumo, fatoEventId);
      expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.CANCELADA);
      expect(await estoqueDaPeca(pecaId)).toEqual({ fisico: 7, reservado: 0 });
    });
  });

  describe('P4 — resposta com o consumo da rodada já registrado', () => {
    const cenarios: [string, number][] = [
      ['uma divergência', 1],
      ['duas divergências', 2],
    ];

    const prepararComFatoAplicado = async (quantidadeDePecas: number) => {
      const pecaIds = await Promise.all(
        Array.from({ length: quantidadeDePecas }, () => novaPeca()),
      );
      const os = await prepararEmCancelamentoDoReparo(
        pecaIds.map((pecaId) => ({ pecaId, quantidade: 2 })),
      );
      const consumo = consumoDoReparo(
        pecaIds.map((pecaId) => ({ pecaId, reservada: 2, utilizada: 3 })),
      );
      const fatoEventId = randomUUID();
      await fatoDaFalha(os, consumo, fatoEventId);
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.osId },
        }),
      ).toBe(1);
      return { os, consumo, fatoEventId, pecaIds };
    };

    it.each(cenarios)(
      'resposta com o mesmo fatoTerminalEventId converge sem erro nem conflito (%s)',
      async (_nome, quantidade) => {
        const { os, consumo, fatoEventId, pecaIds } =
          await prepararComFatoAplicado(quantidade);
        const estoques = await Promise.all(pecaIds.map(estoqueDaPeca));

        await entregar(
          servicos,
          os,
          EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
          respostaDaFalha(consumo, fatoEventId),
        );

        expect(
          await contarPendenciaNatureza(prisma, os.osId, CONFLITO_CONSUMO),
        ).toBe(0);
        expect(
          await contarPendenciaNatureza(
            prisma,
            os.osId,
            INFORMACAO_INSUFICIENTE,
          ),
        ).toBe(0);
        expect(
          await prisma.consumoAplicadoOs.count({
            where: { ordemServicoId: os.osId },
          }),
        ).toBe(1);
        expect(await Promise.all(pecaIds.map(estoqueDaPeca))).toEqual(estoques);
      },
    );

    it.each(cenarios)(
      'resposta sem fatoTerminalEventId não reabre INFORMACAO_INSUFICIENTE nem gera conflito (%s)',
      async (_nome, quantidade) => {
        const { os, consumo, pecaIds } =
          await prepararComFatoAplicado(quantidade);
        const estoques = await Promise.all(pecaIds.map(estoqueDaPeca));

        await entregar(
          servicos,
          os,
          EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
          respostaDaFalha(consumo),
        );

        expect(
          await contarPendenciaNatureza(
            prisma,
            os.osId,
            INFORMACAO_INSUFICIENTE,
          ),
        ).toBe(0);
        expect(
          await contarPendenciaNatureza(prisma, os.osId, CONFLITO_CONSUMO),
        ).toBe(0);
        expect(
          await prisma.consumoAplicadoOs.count({
            where: { ordemServicoId: os.osId },
          }),
        ).toBe(1);
        expect(await Promise.all(pecaIds.map(estoqueDaPeca))).toEqual(estoques);
        expect(await statusDaOs(prisma, os.osId)).toBe(
          StatusOS.EM_CANCELAMENTO,
        );
      },
    );

    it('resposta sem identidade com consumo diferente do registrado abre CONFLITO_CONSUMO', async () => {
      const { os, pecaIds } = await prepararComFatoAplicado(1);
      const diferente = consumoDoReparo([
        { pecaId: pecaIds[0], reservada: 2, utilizada: 1 },
      ]);

      await entregar(
        servicos,
        os,
        EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
        respostaDaFalha(diferente),
      );

      expect(
        await contarPendenciaNatureza(prisma, os.osId, CONFLITO_CONSUMO),
      ).toBe(1);
      expect(
        await contarPendenciaNatureza(prisma, os.osId, INFORMACAO_INSUFICIENTE),
      ).toBe(0);
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.osId },
        }),
      ).toBe(1);
    });
  });
});
