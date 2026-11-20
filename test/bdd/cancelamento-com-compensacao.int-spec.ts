import { join } from 'node:path';
import { defineFeature, loadFeature } from 'jest-cucumber';
import {
  PassoCompensacaoSaga,
  SituacaoReservaEstoque,
  StatusOS,
} from '@/shared/generated/prisma/enums';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
} from '@/shared/messaging/envelope';
import { AmbienteBdd, type Catalogo } from './helpers/ambiente-bdd';
import { estoqueDaPeca, reservasDaOrdem } from './helpers/estoque-bdd';
import { JornadaOs } from './helpers/jornada-os';

const feature = loadFeature(
  join(__dirname, 'features/cancelamento-com-compensacao.feature'),
);

defineFeature(feature, (test) => {
  let ambiente: AmbienteBdd;
  let catalogo: Catalogo;
  let peca: { id: string };
  let jornada: JornadaOs;

  beforeAll(async () => {
    ambiente = await AmbienteBdd.criar();
    catalogo = await ambiente.criarCatalogo();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  const umaPecaEmEstoque = async (unidades: string) => {
    peca = await ambiente.criarPeca('Pastilha de freio', 50, Number(unidades));
  };

  const umaOrdemComOrcamentoAprovado = async (unidades: string) => {
    jornada = await JornadaOs.ateAprovacaoDoOrcamento(
      ambiente,
      catalogo,
      peca,
      Number(unidades),
    );
    expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
  };

  const ordemEntraEmCancelamento = (etapaDeOrigem: StatusOS) => async () => {
    expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
    const ordem = await ambiente.prisma.ordemServico.findUniqueOrThrow({
      where: { id: jornada.ordemServicoId },
    });
    expect(ordem.etapaOrigemCancelamento).toBe(etapaDeOrigem);
    expect(ordem.motivoEncerramento).toBe('Cliente desistiu');
  };

  const reservaMantida = async () => {
    const [reserva] = await reservasDaOrdem(
      ambiente.prisma,
      jornada.ordemServicoId,
      peca.id,
    );
    expect(reserva.situacao).toBe(SituacaoReservaEstoque.ATIVA);
    expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
  };

  const ordemCancelada = async () => {
    expect(await jornada.status()).toBe(StatusOS.CANCELADA);
    const estado = await ambiente.prisma.estadoCompensacaoOs.findUniqueOrThrow({
      where: { ordemServicoId: jornada.ordemServicoId },
    });
    expect(estado.passo).toBe(PassoCompensacaoSaga.CONCLUIDO);
  };

  const unidadesReservadasVoltam = async () => {
    const [reserva] = await reservasDaOrdem(
      ambiente.prisma,
      jornada.ordemServicoId,
      peca.id,
    );
    expect(reserva).toMatchObject({
      situacao: SituacaoReservaEstoque.LIBERADA,
      quantidade: 2,
      quantidadeConsumida: 0,
    });
    expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
      fisico: 10,
      reservado: 0,
    });
  };

  test('Cliente desiste antes de pagar e a cobrança é cancelada', ({
    given,
    and,
    when,
    then,
  }) => {
    given(/^uma peça com (\d+) unidades em estoque$/, umaPecaEmEstoque);

    and(
      /^uma ordem de serviço com orçamento aprovado e (\d+) unidades da peça reservadas$/,
      umaOrdemComOrcamentoAprovado,
    );

    and('a cobrança está disponível para o cliente', async () => {
      await jornada.billing.criarCobranca();
    });

    when('o cliente desiste do atendimento', async () => {
      await jornada.desistir('Cliente desistiu');
    });

    then(
      'a ordem entra em cancelamento',
      ordemEntraEmCancelamento(StatusOS.AGUARDANDO_PAGAMENTO),
    );

    and('a execução não é acionada porque não há tarefa aberta', async () => {
      expect(await jornada.caixa.contar(COMANDO_CANCELAR_TAREFA)).toBe(0);
      expect(
        await jornada.caixa.contar(COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
      ).toBe(0);
    });

    and(
      'o financeiro é solicitado a cancelar a cobrança com o reparo não iniciado',
      async () => {
        const pedidos = await jornada.caixa.emitidos(
          COMANDO_CANCELAR_FINANCEIRO,
        );
        expect(pedidos).toHaveLength(1);
        expect(pedidos[0]).toMatchObject({
          ordemServicoId: jornada.ordemServicoId,
          correlationId: jornada.correlationId,
          rodada: 1,
          payload: {
            etapaOrigem: StatusOS.AGUARDANDO_PAGAMENTO,
            motivo: 'Cliente desistiu',
            resultadoExecucao: 'REPARO_NAO_INICIADO',
          },
        });
      },
    );

    and('a reserva continua mantida até o financeiro concluir', reservaMantida);

    when('o financeiro cancela a cobrança', async () => {
      await jornada.billing.responderCancelamentoFinanceiro('CANCELADA');
    });

    then('a ordem é cancelada', ordemCancelada);

    and(
      /^as (\d+) unidades reservadas voltam ao estoque disponível$/,
      unidadesReservadasVoltam,
    );

    and('não restam pendências em aberto', async () => {
      expect(
        await ambiente.prisma.pendenciaOs.count({
          where: { ordemServicoId: jornada.ordemServicoId, resolvida: false },
        }),
      ).toBe(0);
    });
  });

  test('Cliente desiste depois de pagar e antes do início do reparo', ({
    given,
    and,
    when,
    then,
  }) => {
    given(/^uma peça com (\d+) unidades em estoque$/, umaPecaEmEstoque);

    and(
      /^uma ordem de serviço com orçamento aprovado e (\d+) unidades da peça reservadas$/,
      umaOrdemComOrcamentoAprovado,
    );

    and('o cliente pagou a cobrança', async () => {
      await jornada.billing.criarCobranca();
      await jornada.billing.confirmarPagamento();
      expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_EXECUCAO);
    });

    when('o cliente desiste do atendimento', async () => {
      await jornada.desistir('Cliente desistiu');
    });

    then(
      'a ordem entra em cancelamento',
      ordemEntraEmCancelamento(StatusOS.AGUARDANDO_EXECUCAO),
    );

    and('a execução é solicitada a cancelar a tarefa de reparo', async () => {
      const pedidos = await jornada.caixa.emitidos(COMANDO_CANCELAR_TAREFA);
      expect(pedidos).toHaveLength(1);
      expect(pedidos[0].payload).toMatchObject({ tipoTarefa: 'REPARO' });
      expect(await jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(0);
    });

    when(
      'a execução informa que o reparo foi cancelado antes de começar',
      async () => {
        await jornada.execution.responderCancelamentoDoReparoNaoIniciado();
      },
    );

    then(
      'o financeiro é solicitado a estornar o pagamento com o reparo não iniciado',
      async () => {
        const pedidos = await jornada.caixa.emitidos(
          COMANDO_CANCELAR_FINANCEIRO,
        );
        expect(pedidos).toHaveLength(1);
        expect(pedidos[0].payload).toMatchObject({
          resultadoExecucao: 'REPARO_NAO_INICIADO',
        });
      },
    );

    and('a reserva continua mantida até o financeiro concluir', reservaMantida);

    when('o financeiro informa que estornou o pagamento', async () => {
      await jornada.billing.responderCancelamentoFinanceiro('ESTORNADA');
    });

    then('a ordem é cancelada', ordemCancelada);

    and(
      /^as (\d+) unidades reservadas voltam ao estoque disponível$/,
      unidadesReservadasVoltam,
    );

    and('a execução foi acionada antes do financeiro', async () => {
      expect(
        await jornada.caixa.ordemDeEmissao([
          COMANDO_CANCELAR_TAREFA,
          COMANDO_CANCELAR_FINANCEIRO,
        ]),
      ).toEqual([COMANDO_CANCELAR_TAREFA, COMANDO_CANCELAR_FINANCEIRO]);
    });

    and('a ordem não foi finalizada por exceção', async () => {
      expect(
        await jornada.caixa.contar(COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
      ).toBe(0);
      expect(await jornada.historicoDeStatus()).not.toContain(
        StatusOS.FINALIZADA,
      );
    });
  });

  test('Cliente desiste logo depois de o diagnóstico ser concluído', ({
    given,
    and,
    when,
    then,
  }) => {
    given(/^uma peça com (\d+) unidades em estoque$/, umaPecaEmEstoque);

    and(
      'uma ordem de serviço com o diagnóstico concluído e o orçamento ainda não gerado',
      async () => {
        jornada = await JornadaOs.abrir(ambiente, catalogo, {
          descricaoProblema: 'Barulho ao frear',
          pecas: [{ pecaId: peca.id, quantidade: 2 }],
        });
        await jornada.execution.iniciarDiagnostico();
        await jornada.execution.concluirDiagnostico(
          [
            { tipo: 'SERVICO', itemId: catalogo.servicoId, quantidade: 1 },
            { tipo: 'PECA', itemId: peca.id, quantidade: 2 },
          ],
          'Pastilhas gastas',
        );
        const ordem = await ambiente.prisma.ordemServico.findUniqueOrThrow({
          where: { id: jornada.ordemServicoId },
        });
        expect(ordem.status).toBe(StatusOS.EM_DIAGNOSTICO);
        expect(ordem.diagnosticoConcluidoEm).not.toBeNull();
      },
    );

    when('o cliente desiste do atendimento', async () => {
      await jornada.desistir('Cliente desistiu');
    });

    then(
      'a ordem entra em cancelamento',
      ordemEntraEmCancelamento(StatusOS.EM_DIAGNOSTICO),
    );

    and(
      'a execução não é acionada porque o diagnóstico já foi concluído',
      async () => {
        expect(await jornada.caixa.contar(COMANDO_CANCELAR_TAREFA)).toBe(0);
      },
    );

    then(
      'o financeiro é solicitado a cancelar o que houver com o reparo não iniciado',
      async () => {
        const pedidos = await jornada.caixa.emitidos(
          COMANDO_CANCELAR_FINANCEIRO,
        );
        expect(pedidos).toHaveLength(1);
        expect(pedidos[0].payload).toMatchObject({
          etapaOrigem: StatusOS.EM_DIAGNOSTICO,
          resultadoExecucao: 'REPARO_NAO_INICIADO',
        });
      },
    );

    and(
      'a situação financeira não é consultada para finalizar a ordem',
      async () => {
        expect(
          await jornada.caixa.contar(COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
        ).toBe(0);
        expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
      },
    );

    when('o financeiro informa que não havia nada a cancelar', async () => {
      await jornada.billing.responderCancelamentoFinanceiro('NADA_A_CANCELAR');
    });

    then('a ordem é cancelada', ordemCancelada);

    and('nenhuma peça chegou a ser reservada', async () => {
      expect(
        await reservasDaOrdem(ambiente.prisma, jornada.ordemServicoId, peca.id),
      ).toHaveLength(0);
      expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
        fisico: 10,
        reservado: 0,
      });
      expect(await jornada.historicoDeStatus()).not.toContain(
        StatusOS.FINALIZADA,
      );
    });
  });
});
