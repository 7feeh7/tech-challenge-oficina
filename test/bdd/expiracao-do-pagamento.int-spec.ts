import { join } from 'node:path';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { consultaIdPrazoReferencia } from '@/modules/coordenacao-saga/domain/consulta-financeira';
import {
  PassoCompensacaoSaga,
  SituacaoReservaEstoque,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  COMANDO_INICIAR_REPARO,
} from '@/shared/messaging/envelope';
import { AmbienteBdd, type Catalogo } from './helpers/ambiente-bdd';
import { estoqueDaPeca, reservasDaOrdem } from './helpers/estoque-bdd';
import { JornadaOs } from './helpers/jornada-os';

const feature = loadFeature(
  join(__dirname, 'features/expiracao-do-pagamento.feature'),
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

  test('Pagamento não chega no prazo e a ordem é cancelada com as peças devolvidas', ({
    given,
    and,
    when,
    then,
  }) => {
    given(
      /^uma peça com (\d+) unidades em estoque$/,
      async (unidades: string) => {
        peca = await ambiente.criarPeca(
          'Pastilha de freio',
          50,
          Number(unidades),
        );
      },
    );

    and(
      /^uma ordem de serviço com orçamento aprovado e (\d+) unidades da peça reservadas$/,
      async (unidades: string) => {
        jornada = await JornadaOs.ateAprovacaoDoOrcamento(
          ambiente,
          catalogo,
          peca,
          Number(unidades),
        );
        expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
      },
    );

    and('a cobrança está disponível para o cliente', async () => {
      await jornada.billing.criarCobranca();
      expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
    });

    when(
      'o prazo de referência da reserva vence sem aviso de pagamento',
      async () => {
        await ambiente.vencerPrazoDeReferencia(jornada.ordemServicoId);
        await ambiente.verificadorDePrazo.processarLote();
      },
    );

    then('o financeiro é consultado sobre o pagamento', async () => {
      const consultas = await jornada.caixa.emitidos(
        COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
      );
      expect(consultas).toHaveLength(1);
      expect(consultas[0]).toMatchObject({
        ordemServicoId: jornada.ordemServicoId,
        correlationId: jornada.correlationId,
        rodada: 1,
        payload: {
          consultaId: consultaIdPrazoReferencia(jornada.ordemServicoId, 1, 1),
          finalidade: 'PRAZO_DE_REFERENCIA_VENCIDO',
        },
      });
    });

    and(
      'a ordem continua aguardando o pagamento com a reserva mantida',
      async () => {
        expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
        const [reserva] = await reservasDaOrdem(
          ambiente.prisma,
          jornada.ordemServicoId,
          peca.id,
        );
        expect(reserva.situacao).toBe(SituacaoReservaEstoque.ATIVA);
        expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
          fisico: 10,
          reservado: 2,
        });
        const pendencias = await ambiente.prisma.pendenciaOs.findMany({
          where: {
            ordemServicoId: jornada.ordemServicoId,
            tipo: TipoPendenciaOs.FINANCEIRA,
            resolvida: false,
          },
        });
        expect(pendencias.map((p) => p.detalhes)).toEqual([
          expect.objectContaining({ natureza: 'CONSULTA_PRAZO_REFERENCIA' }),
        ]);
      },
    );

    and('o reparo não é iniciado', async () => {
      expect(await jornada.caixa.contar(COMANDO_INICIAR_REPARO)).toBe(0);
    });

    when('o financeiro responde que não houve pagamento', async () => {
      await jornada.billing.responderConsulta('SEM_PAGAMENTO');
    });

    then('a ordem entra em cancelamento', async () => {
      expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
      const ordem = await ambiente.prisma.ordemServico.findUniqueOrThrow({
        where: { id: jornada.ordemServicoId },
      });
      expect(ordem.etapaOrigemCancelamento).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
    });

    and('o financeiro é solicitado a cancelar a cobrança', async () => {
      const pedidos = await jornada.caixa.emitidos(COMANDO_CANCELAR_FINANCEIRO);
      expect(pedidos).toHaveLength(1);
      expect(pedidos[0].payload).toMatchObject({
        etapaOrigem: StatusOS.AGUARDANDO_PAGAMENTO,
        resultadoExecucao: 'REPARO_NAO_INICIADO',
      });
      expect(await jornada.caixa.contar(COMANDO_CANCELAR_TAREFA)).toBe(0);
    });

    and('a reserva continua mantida até o financeiro concluir', async () => {
      const [reserva] = await reservasDaOrdem(
        ambiente.prisma,
        jornada.ordemServicoId,
        peca.id,
      );
      expect(reserva.situacao).toBe(SituacaoReservaEstoque.ATIVA);
      expect(await jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
    });

    when('o financeiro confirma o cancelamento da cobrança', async () => {
      // O Billing em 568e04e não responde ao CancelarFinanceiro de uma cobrança
      // EXPIRADA; a resposta usada é a que a regra de compensação (D4.3) exige.
      await jornada.billing.responderCancelamentoFinanceiro('CANCELADA');
    });

    then('a ordem é cancelada', async () => {
      expect(await jornada.status()).toBe(StatusOS.CANCELADA);
      const estado =
        await ambiente.prisma.estadoCompensacaoOs.findUniqueOrThrow({
          where: { ordemServicoId: jornada.ordemServicoId },
        });
      expect(estado.passo).toBe(PassoCompensacaoSaga.CONCLUIDO);
      expect(
        await ambiente.prisma.pendenciaOs.count({
          where: { ordemServicoId: jornada.ordemServicoId, resolvida: false },
        }),
      ).toBe(0);
    });

    and(
      /^as (\d+) unidades reservadas voltam ao estoque disponível$/,
      async () => {
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
      },
    );

    and('o reparo nunca foi iniciado', async () => {
      expect(await jornada.caixa.contar(COMANDO_INICIAR_REPARO)).toBe(0);
      expect(await jornada.historicoDeStatus()).toEqual([
        StatusOS.RECEBIDA,
        StatusOS.EM_DIAGNOSTICO,
        StatusOS.AGUARDANDO_APROVACAO,
        StatusOS.AGUARDANDO_PAGAMENTO,
        StatusOS.EM_CANCELAMENTO,
        StatusOS.CANCELADA,
      ]);
    });
  });
});
