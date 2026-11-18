import { join } from 'node:path';
import { defineFeature, loadFeature } from 'jest-cucumber';
import {
  SituacaoReservaEstoque,
  StatusOS,
} from '@/shared/generated/prisma/enums';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_GERAR_ORCAMENTO,
  COMANDO_INICIAR_DIAGNOSTICO,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import { AmbienteBdd, type Catalogo } from './helpers/ambiente-bdd';
import { estoqueDaPeca } from './helpers/estoque-bdd';
import { JornadaOs } from './helpers/jornada-os';

const feature = loadFeature(
  join(__dirname, 'features/recusa-de-orcamento.feature'),
);

interface ItemDoPedido {
  tipo: string;
  itemId: string;
  quantidade: number;
  precoUnitarioCentavos?: number;
}

defineFeature(feature, (test) => {
  let ambiente: AmbienteBdd;
  let catalogo: Catalogo;
  let peca: { id: string };
  let pecaNova: { id: string };
  let jornada: JornadaOs;
  let orcamentoRecusado: string;
  let recusa: EnvelopeMensagem;

  beforeAll(async () => {
    ambiente = await AmbienteBdd.criar();
    catalogo = await ambiente.criarCatalogo();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  test('Cliente recusa o orçamento e o diagnóstico é refeito', ({
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
        pecaNova = await ambiente.criarPeca('Disco de freio', 70, 10);
      },
    );

    and(
      /^uma ordem de serviço com o orçamento gerado para (\d+) serviço e (\d+) unidades da peça$/,
      async (servicos: string, unidades: string) => {
        jornada = await JornadaOs.abrir(ambiente, catalogo, {
          descricaoProblema: 'Barulho ao frear',
          pecas: [{ pecaId: peca.id, quantidade: Number(unidades) }],
        });
        await jornada.execution.iniciarDiagnostico();
        await jornada.execution.concluirDiagnostico(
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
        orcamentoRecusado = await jornada.billing.gerarOrcamento();
        expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_APROVACAO);
      },
    );

    when('o cliente recusa o orçamento', async () => {
      recusa = await jornada.billing.rejeitarOrcamento(
        'Cliente não aprovou o valor',
      );
    });

    then('a ordem volta ao diagnóstico em uma nova rodada', async () => {
      expect(await jornada.status()).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(await jornada.rodadaVigente()).toBe(2);
    });

    and(
      'a execução recebe o pedido de diagnóstico da nova rodada com os itens da rodada anterior',
      async () => {
        const pedidos = await jornada.caixa.emitidos(
          COMANDO_INICIAR_DIAGNOSTICO,
        );
        expect(pedidos.map((pedido) => pedido.rodada)).toEqual([1, 2]);
        expect(pedidos[1]).toMatchObject({
          ordemServicoId: jornada.ordemServicoId,
          correlationId: jornada.correlationId,
          payload: {
            sugestoes: expect.arrayContaining([
              {
                tipo: 'SERVICO',
                itemId: catalogo.servicoId,
                quantidade: 1,
              },
              { tipo: 'PECA', itemId: peca.id, quantidade: 2 },
            ]) as unknown,
          },
        });
        const detalhe = await jornada.detalhe();
        expect(detalhe.servicos).toHaveLength(1);
        expect(detalhe.pecas).toHaveLength(1);
      },
    );

    and('a rodada recusada não deixa reserva nem cobrança', async () => {
      expect(
        await ambiente.prisma.reservaEstoque.count({
          where: { ordemServicoId: jornada.ordemServicoId },
        }),
      ).toBe(0);
      expect(
        await ambiente.prisma.projecaoFinanceiraOs.count({
          where: {
            ordemServicoId: jornada.ordemServicoId,
            natureza: 'PAGAMENTO',
          },
        }),
      ).toBe(0);
      expect(await jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(0);
      expect(await estoqueDaPeca(ambiente.prisma, peca.id)).toEqual({
        fisico: 10,
        reservado: 0,
      });
    });

    when('o mecânico inicia o novo diagnóstico', async () => {
      await jornada.execution.iniciarDiagnostico(2);
      expect(await jornada.status()).toBe(StatusOS.EM_DIAGNOSTICO);
    });

    and('o preço da peça sobe no catálogo', async () => {
      await ambiente.prisma.peca.update({
        where: { id: peca.id },
        data: { precoUnitario: 80 },
      });
    });

    and(
      /^o mecânico conclui o novo diagnóstico com (\d+) unidades da peça e uma segunda peça nova$/,
      async (unidades: string) => {
        await jornada.execution.concluirDiagnostico(
          [
            { tipo: 'SERVICO', itemId: catalogo.servicoId, quantidade: 1 },
            { tipo: 'PECA', itemId: peca.id, quantidade: Number(unidades) },
            { tipo: 'PECA', itemId: pecaNova.id, quantidade: 1 },
          ],
          'Discos também gastos',
          2,
        );
        await jornada.billing.gerarOrcamento(2);
      },
    );

    then('o preço combinado da peça na rodada anterior é mantido', async () => {
      const [pedido] = (await jornada.caixa.emitidos(COMANDO_GERAR_ORCAMENTO))
        .filter((envelope) => envelope.rodada === 2)
        .map((envelope) => envelope.payload as { itens: ItemDoPedido[] });
      const itemPeca = pedido.itens.find((item) => item.itemId === peca.id);
      expect(itemPeca).toMatchObject({
        quantidade: 3,
        precoUnitarioCentavos: 5000,
      });
    });

    and('a peça nova entra com o preço atual do catálogo', async () => {
      const [pedido] = (await jornada.caixa.emitidos(COMANDO_GERAR_ORCAMENTO))
        .filter((envelope) => envelope.rodada === 2)
        .map((envelope) => envelope.payload as { itens: ItemDoPedido[] });
      const itemNovo = pedido.itens.find((item) => item.itemId === pecaNova.id);
      expect(itemNovo).toMatchObject({
        quantidade: 1,
        precoUnitarioCentavos: 7000,
      });
    });

    and(
      'o orçamento da nova rodada é independente do orçamento recusado',
      async () => {
        expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_APROVACAO);
        const detalhe = await jornada.detalhe();
        expect(detalhe.rodadaVigente).toBe(2);
        expect(detalhe.resumoFinanceiro.orcamento).toEqual({
          orcamentoId: jornada.billing.orcamentoId,
          valorCentavos: 12000 + 3 * 5000 + 7000,
        });
        expect(jornada.billing.orcamentoId).not.toBe(orcamentoRecusado);
        const projecoes = await ambiente.prisma.projecaoFinanceiraOs.findMany({
          where: { ordemServicoId: jornada.ordemServicoId },
          orderBy: { rodada: 'asc' },
        });
        expect(
          projecoes.map((p) => [p.rodada, p.natureza, p.orcamentoId]),
        ).toEqual([
          [1, 'ORCAMENTO', orcamentoRecusado],
          [2, 'ORCAMENTO', jornada.billing.orcamentoId],
        ]);
      },
    );

    when('o cliente aprova o novo orçamento', async () => {
      await jornada.billing.aprovarOrcamento(2);
    });

    then('só a nova rodada reserva peças', async () => {
      expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
      const reservas = await ambiente.prisma.reservaEstoque.findMany({
        where: { ordemServicoId: jornada.ordemServicoId },
        orderBy: { rodada: 'asc' },
      });
      expect(
        reservas.map((r) => [r.rodada, r.pecaId, r.quantidade, r.situacao]),
      ).toEqual(
        expect.arrayContaining([
          [2, peca.id, 3, SituacaoReservaEstoque.ATIVA],
          [2, pecaNova.id, 1, SituacaoReservaEstoque.ATIVA],
        ]),
      );
      expect(reservas.every((reserva) => reserva.rodada === 2)).toBe(true);
    });

    and('a recusa reenviada não abre outra rodada', async () => {
      await jornada.reentregar(recusa);
      expect(await jornada.rodadaVigente()).toBe(2);
      expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
      expect(
        (await jornada.caixa.emitidos(COMANDO_INICIAR_DIAGNOSTICO)).length,
      ).toBe(2);
    });
  });
});
