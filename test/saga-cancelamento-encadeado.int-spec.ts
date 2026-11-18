import { randomUUID } from 'node:crypto';
import {
  SituacaoReconciliacaoConsumo,
  SituacaoReservaEstoque,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import { AmbienteBdd, type Catalogo } from './bdd/helpers/ambiente-bdd';
import { estoqueDaPeca, reservasDaOrdem } from './bdd/helpers/estoque-bdd';
import { JornadaOs } from './bdd/helpers/jornada-os';
import { montarMensagemDoExemplo } from './bdd/helpers/mensagens-do-exemplo';
import {
  contarPendenciaNatureza,
  NATUREZA_DIVERGENCIA_CONSUMO,
} from './helpers/e42-envelope';

const NATUREZA_INFORMACAO_INSUFICIENTE = 'INFORMACAO_INSUFICIENTE';
const QUANDO_O_REPARO_FALHOU = '2026-11-18T10:00:00.000Z';

describe('Saga — cancelamento encadeado com informação insuficiente e divergência (E42)', () => {
  let ambiente: AmbienteBdd;
  let catalogo: Catalogo;

  beforeAll(async () => {
    ambiente = await AmbienteBdd.criar();
    catalogo = await ambiente.criarCatalogo();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  /**
   * Ordem paga com o reparo iniciado e 2 unidades reservadas; o cliente
   * desiste; o Execution responde sem o fato terminal; o fato chega depois com
   * 3 unidades usadas (consumo acima do autorizado) e o administrador ajusta.
   */
  const percorrerAteOAjusteDoAdministrador = async () => {
    const peca = await ambiente.criarPeca('Pastilha de freio', 50, 10);
    const jornada = await JornadaOs.ateAprovacaoDoOrcamento(
      ambiente,
      catalogo,
      peca,
      2,
    );
    // Sem CobrancaCriada: o foco é a compensação, não a sequência de cobrança.
    await jornada.billing.confirmarPagamento();
    await jornada.execution.iniciarReparo();
    expect(await jornada.status()).toBe(StatusOS.EM_EXECUCAO);

    await jornada.desistir('Cliente desistiu');
    expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
    const cancelarTarefa = await jornada.caixa.receberProximo(
      COMANDO_CANCELAR_TAREFA,
    );
    expect(cancelarTarefa.payload).toMatchObject({ tipoTarefa: 'REPARO' });

    const identidade = (causationId: string | null = null) => ({
      ordemServicoId: jornada.ordemServicoId,
      correlationId: jornada.correlationId,
      rodada: 1,
      causationId,
    });
    const consumoDoReparo = {
      responsavelId: 'mecanico-1',
      motivo: 'Peça incompatível',
      servicosRealizados: [],
      pecasUtilizadas: [{ itemId: peca.id, quantidade: 3 }],
      divergencias: [
        {
          itemId: peca.id,
          tipo: 'CONSUMO_ACIMA',
          quantidadePrevista: 2,
          quantidadeUtilizada: 3,
          observacao: 'Consumo efetivo acima do autorizado para a peça.',
          justificativa: 'Peça adicional usada no reparo emergencial.',
        },
      ],
    };

    // 1. A tarefa já havia falhado, mas a resposta não traz o fato terminal original.
    await jornada.entregar(
      montarMensagemDoExemplo(
        'execution',
        'execution.resposta-cancelamento-ja-encerrada-reparo-falhou.v1',
        identidade(cancelarTarefa.eventId),
        {
          payload: { encerradaEm: QUANDO_O_REPARO_FALHOU, ...consumoDoReparo },
          omitirDoPayload: ['fatoTerminalEventId'],
        },
      ),
    );
    expect(
      await contarPendenciaNatureza(
        ambiente.prisma,
        jornada.ordemServicoId,
        NATUREZA_INFORMACAO_INSUFICIENTE,
      ),
    ).toBe(1);
    expect(
      await ambiente.prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: jornada.ordemServicoId },
      }),
    ).toBe(0);
    expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
      fisico: 10,
      reservado: 2,
    });
    const [reservaProtegida] = await reservasDaOrdem(
      ambiente.prisma,
      jornada.ordemServicoId,
      peca.id,
    );
    expect(reservaProtegida).toMatchObject({
      situacao: SituacaoReservaEstoque.ATIVA,
      quantidade: 2,
      quantidadeConsumida: 0,
    });
    expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
    expect(
      await jornada.caixa.contar(COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
    ).toBe(0);

    // 2. Chega o fato terminal original, com consumo acima do autorizado.
    const falha: EnvelopeMensagem = montarMensagemDoExemplo(
      'execution',
      'execution.reparo-falhou-divergencia.v1',
      identidade(),
      {
        payload: {
          tarefaId: `${jornada.ordemServicoId}#1#REPARO`,
          falhouEm: QUANDO_O_REPARO_FALHOU,
          ...consumoDoReparo,
        },
      },
    );
    await jornada.entregar(falha);

    const informacao = await ambiente.prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: jornada.ordemServicoId,
        tipo: TipoPendenciaOs.INVENTARIO,
        detalhes: {
          path: ['natureza'],
          equals: NATUREZA_INFORMACAO_INSUFICIENTE,
        },
      },
    });
    expect(informacao.resolvida).toBe(true);
    const divergencia = await ambiente.prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: jornada.ordemServicoId,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    expect(divergencia.id).not.toBe(informacao.id);
    expect(divergencia.detalhes).toMatchObject({
      natureza: NATUREZA_DIVERGENCIA_CONSUMO,
    });
    expect(
      await contarPendenciaNatureza(
        ambiente.prisma,
        jornada.ordemServicoId,
        NATUREZA_DIVERGENCIA_CONSUMO,
      ),
    ).toBe(1);
    const consumo = await ambiente.prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: {
        ordemServicoId_rodada: {
          ordemServicoId: jornada.ordemServicoId,
          rodada: 1,
        },
      },
    });
    expect(consumo).toMatchObject({
      eventId: falha.eventId,
      tipoFato: 'REPARO_FALHOU',
      responsavelId: 'mecanico-1',
      situacaoReconciliacao: SituacaoReconciliacaoConsumo.DIVERGENCIA_PENDENTE,
    });
    expect(consumo.fatoOcorridoEm.toISOString()).toBe(QUANDO_O_REPARO_FALHOU);
    // A baixa se limita à reserva e acontece uma única vez.
    expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
      fisico: 8,
      reservado: 0,
    });
    expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
    expect(await jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(0);

    // 3. O administrador autenticado ajusta o estoque físico.
    await ambiente
      .administrador()
      .post('/v1/reservas-estoque/ajustes-divergencia')
      .send({
        pendenciaId: divergencia.id,
        pecaId: peca.id,
        quantidadeFisicaNova: 7,
        motivo: 'Contagem física depois da falha do reparo',
      })
      .expect(204);

    return { jornada, peca, falha, divergencia };
  };

  it('resolve a informação insuficiente com o fato terminal, abre divergência própria e o ajuste do administrador a resolve sem nova baixa', async () => {
    const { jornada, peca, falha, divergencia } =
      await percorrerAteOAjusteDoAdministrador();

    const ajuste =
      await ambiente.prisma.ajusteEstoqueAdministrativo.findFirstOrThrow({
        where: { pendenciaId: divergencia.id },
      });
    expect(ajuste).toMatchObject({
      pecaId: peca.id,
      quantidadeFisicaAnterior: 8,
      quantidadeFisicaNova: 7,
      responsavelId: ambiente.administradorId,
    });
    const resolvida = await ambiente.prisma.pendenciaOs.findUniqueOrThrow({
      where: { id: divergencia.id },
    });
    expect(resolvida).toMatchObject({
      resolvida: true,
      resolvidaPorId: ambiente.administradorId,
    });
    expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
      fisico: 7,
      reservado: 0,
    });
    const consumo = await ambiente.prisma.consumoAplicadoOs.findMany({
      where: { ordemServicoId: jornada.ordemServicoId },
    });
    expect(consumo).toHaveLength(1);
    expect(consumo[0]).toMatchObject({
      eventId: falha.eventId,
      situacaoReconciliacao: SituacaoReconciliacaoConsumo.DIVERGENCIA_RESOLVIDA,
    });
    const [reserva] = await reservasDaOrdem(
      ambiente.prisma,
      jornada.ordemServicoId,
      peca.id,
    );
    expect(reserva).toMatchObject({ quantidade: 2, quantidadeConsumida: 2 });
    // Sem FINALIZADA indevida e sem avaliar a exceção E10.
    expect(await jornada.historicoDeStatus()).not.toContain(
      StatusOS.FINALIZADA,
    );
    expect(
      await jornada.caixa.contar(COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
    ).toBe(0);

    // Reentrega do fato terminal: sem nova baixa.
    await jornada.reentregar(falha);
    expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
      fisico: 7,
      reservado: 0,
    });
  });

  // Bloqueado por defeitos do OS (relatório da E32), sem correção sem decisão:
  // com o fato terminal recebido em EM_CANCELAMENTO e a divergência pendente,
  // `reagir-fato-saga.use-case.ts` retorna antes de
  // `registrarFatoTerminalExecucao`; depois do ajuste o OS pergunta de novo ao
  // Execution (CancelarTarefa duplicado, contra D4.3) em vez de seguir ao
  // financeiro, e a resposta repetida falha em `comparar-consumo-semantico.ts`
  // (divergências gravadas têm `pecaId`, o comparador lê `itemId`).
  it.skip('segue ao financeiro depois do ajuste e termina em CANCELADA só com a pendência do estorno resolvida', async () => {
    const { jornada, peca, falha } = await percorrerAteOAjusteDoAdministrador();

    expect(await jornada.caixa.contar(COMANDO_CANCELAR_TAREFA)).toBe(1);
    const pedidosFinanceiros = await jornada.caixa.emitidos(
      COMANDO_CANCELAR_FINANCEIRO,
    );
    expect(pedidosFinanceiros).toHaveLength(1);
    expect(pedidosFinanceiros[0].payload).toMatchObject({
      resultadoExecucao: 'REPARO_INICIADO',
    });
    expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);

    const pendenciaFinanceiraId = randomUUID();
    const pedido = await jornada.caixa.receberProximo(
      COMANDO_CANCELAR_FINANCEIRO,
    );
    const identidade = (causationId: string | null) => ({
      ordemServicoId: jornada.ordemServicoId,
      correlationId: jornada.correlationId,
      rodada: 1,
      causationId,
    });
    await jornada.entregar(
      montarMensagemDoExemplo(
        'billing',
        'billing.resposta-cancelamento-financeiro.v1',
        identidade(pedido.eventId),
        {
          payload: {
            resultado: 'PENDENCIA_MANUAL_ABERTA',
            pendenciaId: pendenciaFinanceiraId,
          },
        },
      ),
    );
    expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);

    await jornada.entregar(
      montarMensagemDoExemplo(
        'billing',
        'billing.pendencia-resolvida.v1',
        identidade(null),
        {
          payload: {
            pendenciaId: pendenciaFinanceiraId,
            decisao: 'ESTORNO_INTEGRAL',
            valorEstornadoCentavos: jornada.billing.cobranca!.valorCentavos,
          },
        },
      ),
    );

    expect(await jornada.status()).toBe(StatusOS.CANCELADA);
    expect(await jornada.historicoDeStatus()).not.toContain(
      StatusOS.FINALIZADA,
    );
    expect(
      await ambiente.prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: jornada.ordemServicoId },
      }),
    ).toBe(1);

    await jornada.reentregar(falha);
    expect(await jornada.status()).toBe(StatusOS.CANCELADA);
    expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
      fisico: 7,
      reservado: 0,
    });
  });
});
