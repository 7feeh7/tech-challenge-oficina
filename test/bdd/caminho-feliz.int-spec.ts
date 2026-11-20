import { join } from 'node:path';
import { defineFeature, loadFeature } from 'jest-cucumber';
import {
  COMANDO_GERAR_ORCAMENTO,
  COMANDO_INICIAR_DIAGNOSTICO,
  COMANDO_INICIAR_REPARO,
  EVENTO_PAGAMENTO_DISPONIVEL,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import {
  SituacaoReservaEstoque,
  StatusOS,
} from '@/shared/generated/prisma/enums';
import { AmbienteBdd, type Catalogo } from './helpers/ambiente-bdd';
import { estoqueDaPeca, reservasDaOrdem } from './helpers/estoque-bdd';
import { JornadaOs } from './helpers/jornada-os';

const feature = loadFeature(join(__dirname, 'features/caminho-feliz.feature'));

defineFeature(feature, (test) => {
  let ambiente: AmbienteBdd;
  let catalogo: Catalogo;
  let peca: { id: string };
  let jornada: JornadaOs;
  let reparoConcluido: EnvelopeMensagem;

  beforeAll(async () => {
    ambiente = await AmbienteBdd.criar();
    catalogo = await ambiente.criarCatalogo();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  test('Cliente aprova o orçamento, paga e retira o veículo reparado', ({
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
      /^uma ordem de serviço aberta para trocar (\d+) unidades dessa peça$/,
      async (unidades: string) => {
        jornada = await JornadaOs.abrir(ambiente, catalogo, {
          descricaoProblema: 'Barulho ao frear',
          pecas: [{ pecaId: peca.id, quantidade: Number(unidades) }],
        });
        await jornada.execution.iniciarDiagnostico();
        expect(await jornada.status()).toBe(StatusOS.EM_DIAGNOSTICO);
      },
    );

    when(
      /^o mecânico inicia e conclui o diagnóstico com (\d+) serviço e (\d+) unidades da peça$/,
      async (servicos: string, unidades: string) => {
        const concluido = await jornada.execution.concluirDiagnostico(
          [
            {
              tipo: 'SERVICO',
              itemId: catalogo.servicoId,
              quantidade: Number(servicos),
            },
            { tipo: 'PECA', itemId: peca.id, quantidade: Number(unidades) },
          ],
          'Pastilhas gastas',
        );
        expect(concluido.itensOficiais).toHaveLength(2);
        await jornada.billing.gerarOrcamento();
      },
    );

    then('a ordem aguarda a aprovação do orçamento', async () => {
      expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_APROVACAO);
    });

    and('o orçamento tem o valor dos itens do diagnóstico', async () => {
      const detalhe = await jornada.detalhe();
      expect(jornada.billing.valorTotalCentavos).toBe(12000 + 2 * 5000);
      expect(detalhe.resumoFinanceiro.orcamento).toEqual({
        orcamentoId: jornada.billing.orcamentoId,
        valorCentavos: 22000,
      });
    });

    when('o preço da peça sobe no catálogo', async () => {
      await ambiente.prisma.peca.update({
        where: { id: peca.id },
        data: { precoUnitario: 80 },
      });
    });

    then('a ordem mantém o preço combinado no diagnóstico', async () => {
      const detalhe = await jornada.detalhe();
      expect(Number(detalhe.pecas[0].precoUnitario)).toBe(50);
    });

    when('o cliente aprova o orçamento', async () => {
      const reserva = await jornada.billing.aprovarOrcamento();
      expect(reserva.prazoReferencia).toBeDefined();
    });

    then(
      /^(\d+) unidades da peça ficam reservadas sem sair do estoque físico$/,
      async (unidades: string) => {
        expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
          fisico: 10,
          reservado: Number(unidades),
        });
        const [reserva] = await reservasDaOrdem(
          ambiente.prisma,
          jornada.ordemServicoId,
          peca.id,
        );
        expect(reserva.situacao).toBe(SituacaoReservaEstoque.ATIVA);
        expect(reserva.quantidade).toBe(Number(unidades));
      },
    );

    and('a ordem aguarda o pagamento', async () => {
      expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
      expect(
        await ambiente.prisma.projecaoFinanceiraOs.count({
          where: {
            ordemServicoId: jornada.ordemServicoId,
            natureza: 'PAGAMENTO',
          },
        }),
      ).toBe(0);
    });

    when('a cobrança fica disponível para o cliente', async () => {
      await jornada.billing.criarCobranca();
    });

    then('o cliente recebe o link de pagamento', async () => {
      const cobranca = jornada.billing.cobranca!;
      const detalhe = await jornada.detalhe();
      expect(detalhe.resumoFinanceiro.pagamento?.orderId).toBe(
        cobranca.orderId,
      );
      expect(detalhe.resumoFinanceiro.pagamento?.linkPagamento).toContain(
        cobranca.orderId,
      );
      expect(await jornada.caixa.contar(EVENTO_PAGAMENTO_DISPONIVEL)).toBe(1);
    });

    and('o reparo ainda não foi pedido à execução', async () => {
      expect(await jornada.caixa.contar(COMANDO_INICIAR_REPARO)).toBe(0);
      expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
    });

    when('o cliente paga', async () => {
      await jornada.billing.confirmarPagamento();
    });

    then('a ordem aguarda a execução', async () => {
      expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_EXECUCAO);
    });

    and('o reparo é pedido à execução uma única vez', async () => {
      expect(await jornada.caixa.contar(COMANDO_INICIAR_REPARO)).toBe(1);
    });

    when(
      /^o mecânico inicia e conclui o reparo usando (\d+) unidades da peça$/,
      async (unidades: string) => {
        await jornada.execution.iniciarReparo();
        expect(await jornada.status()).toBe(StatusOS.EM_EXECUCAO);
        reparoConcluido = await jornada.execution.concluirReparo({
          pecasUtilizadas: [{ itemId: peca.id, quantidade: Number(unidades) }],
          servicosRealizados: [{ itemId: catalogo.servicoId, quantidade: 1 }],
        });
      },
    );

    then('a ordem é finalizada', async () => {
      expect(await jornada.status()).toBe(StatusOS.FINALIZADA);
    });

    and(
      /^(\d+) unidades saem do estoque físico e a reserva é consumida$/,
      async (unidades: string) => {
        expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
          fisico: 10 - Number(unidades),
          reservado: 0,
        });
        const [reserva] = await reservasDaOrdem(
          ambiente.prisma,
          jornada.ordemServicoId,
          peca.id,
        );
        expect(reserva).toMatchObject({
          situacao: SituacaoReservaEstoque.CONSUMIDA,
          quantidade: 2,
          quantidadeConsumida: 2,
        });
      },
    );

    when('o aviso de reparo concluído chega de novo', async () => {
      await jornada.reentregar(reparoConcluido);
    });

    then('o estoque e a ordem permanecem como estavam', async () => {
      expect(await jornada.status()).toBe(StatusOS.FINALIZADA);
      expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
        fisico: 8,
        reservado: 0,
      });
      expect(
        await ambiente.prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: jornada.ordemServicoId },
        }),
      ).toBe(1);
      expect(
        await ambiente.prisma.mensagemProcessada.count({
          where: { eventId: reparoConcluido.eventId },
        }),
      ).toBe(1);
    });

    when('o cliente retira o veículo', async () => {
      await jornada.retirarVeiculo();
    });

    then('a ordem é entregue', async () => {
      expect(await jornada.status()).toBe(StatusOS.ENTREGUE);
    });

    and(
      'todos os pedidos às outras áreas referem-se a esta ordem e à primeira rodada',
      async () => {
        const pedidos = (await jornada.caixa.emitidos()).filter((envelope) =>
          [
            COMANDO_INICIAR_DIAGNOSTICO,
            COMANDO_GERAR_ORCAMENTO,
            COMANDO_INICIAR_REPARO,
          ].includes(envelope.eventType),
        );
        expect(pedidos).toHaveLength(3);
        for (const pedido of pedidos) {
          expect(pedido).toMatchObject({
            ordemServicoId: jornada.ordemServicoId,
            correlationId: jornada.correlationId,
            rodada: 1,
          });
        }
      },
    );

    and('o atendimento seguiu a ordem esperada', async () => {
      expect(await jornada.historicoDeStatus()).toEqual([
        StatusOS.RECEBIDA,
        StatusOS.EM_DIAGNOSTICO,
        StatusOS.AGUARDANDO_APROVACAO,
        StatusOS.AGUARDANDO_PAGAMENTO,
        StatusOS.AGUARDANDO_EXECUCAO,
        StatusOS.EM_EXECUCAO,
        StatusOS.FINALIZADA,
        StatusOS.ENTREGUE,
      ]);
      expect(
        await jornada.caixa.ordemDeEmissao([
          COMANDO_INICIAR_DIAGNOSTICO,
          COMANDO_GERAR_ORCAMENTO,
          COMANDO_INICIAR_REPARO,
        ]),
      ).toEqual([
        COMANDO_INICIAR_DIAGNOSTICO,
        COMANDO_GERAR_ORCAMENTO,
        COMANDO_INICIAR_REPARO,
      ]);
      const [reserva] = await reservasDaOrdem(
        ambiente.prisma,
        jornada.ordemServicoId,
        peca.id,
      );
      const cobranca =
        await ambiente.prisma.projecaoFinanceiraOs.findFirstOrThrow({
          where: {
            ordemServicoId: jornada.ordemServicoId,
            natureza: 'PAGAMENTO',
          },
        });
      expect(reserva.criadoEm.getTime()).toBeLessThan(
        cobranca.criadoEm.getTime(),
      );
    });
  });
});
