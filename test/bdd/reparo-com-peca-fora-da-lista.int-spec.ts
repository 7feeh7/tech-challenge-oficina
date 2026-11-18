import { join } from 'node:path';
import { defineFeature, loadFeature } from 'jest-cucumber';
import {
  SituacaoReconciliacaoConsumo,
  SituacaoReservaEstoque,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import type { EnvelopeMensagem } from '@/shared/messaging/envelope';
import { AmbienteBdd, type Catalogo } from './helpers/ambiente-bdd';
import { estoqueDaPeca, reservasDaOrdem } from './helpers/estoque-bdd';
import { JornadaOs } from './helpers/jornada-os';

const feature = loadFeature(
  join(__dirname, 'features/reparo-com-peca-fora-da-lista.feature'),
);

defineFeature(feature, (test) => {
  let ambiente: AmbienteBdd;
  let catalogo: Catalogo;
  let pecaPrincipal: { id: string };
  let pecaForaDaLista: { id: string };
  let outraOrdem: JornadaOs;
  let jornada: JornadaOs;
  let reparoConcluido: EnvelopeMensagem;
  let pendenciaId: string;

  beforeAll(async () => {
    ambiente = await AmbienteBdd.criar();
    catalogo = await ambiente.criarCatalogo();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  const pendenciaDeInventario = async () =>
    await ambiente.prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: jornada.ordemServicoId,
        tipo: TipoPendenciaOs.INVENTARIO,
      },
    });

  test('Mecânico usa mais peças do que o autorizado e uma peça fora da lista', ({
    given,
    and,
    when,
    then,
  }) => {
    given(
      /^uma peça com (\d+) unidades em estoque e outra peça com (\d+) unidades$/,
      async (primeira: string, segunda: string) => {
        pecaPrincipal = await ambiente.criarPeca(
          'Pastilha de freio',
          50,
          Number(primeira),
        );
        pecaForaDaLista = await ambiente.criarPeca(
          'Parafuso especial',
          5,
          Number(segunda),
        );
      },
    );

    and(
      /^uma outra ordem de serviço com (\d+) unidades da primeira peça reservadas$/,
      async (unidades: string) => {
        outraOrdem = await JornadaOs.ateAprovacaoDoOrcamento(
          ambiente,
          catalogo,
          pecaPrincipal,
          Number(unidades),
        );
      },
    );

    and(
      /^uma ordem de serviço paga com (\d+) unidades da primeira peça reservadas e o reparo iniciado$/,
      async (unidades: string) => {
        jornada = await JornadaOs.ateAprovacaoDoOrcamento(
          ambiente,
          catalogo,
          pecaPrincipal,
          Number(unidades),
        );
        // O foco aqui é o consumo; a sequência com cobrança criada está no caminho feliz.
        await jornada.billing.confirmarPagamento();
        await jornada.execution.iniciarReparo();
        expect(await jornada.status()).toBe(StatusOS.EM_EXECUCAO);
      },
    );

    when(
      /^o mecânico conclui o reparo com (\d+) unidades da primeira peça e (\d+) da outra peça fora da lista$/,
      async (usadasDaPrimeira: string, usadasDaOutra: string) => {
        reparoConcluido = await jornada.execution.concluirReparo({
          pecasUtilizadas: [
            { itemId: pecaPrincipal.id, quantidade: Number(usadasDaPrimeira) },
            { itemId: pecaForaDaLista.id, quantidade: Number(usadasDaOutra) },
          ],
          servicosRealizados: [{ itemId: catalogo.servicoId, quantidade: 1 }],
          divergencias: [
            {
              itemId: pecaPrincipal.id,
              tipo: 'CONSUMO_ACIMA',
              quantidadePrevista: 2,
              quantidadeUtilizada: Number(usadasDaPrimeira),
              observacao: 'Consumo efetivo acima do autorizado para a peça.',
              justificativa: 'Peça adicional usada no reparo emergencial.',
            },
            {
              itemId: pecaForaDaLista.id,
              tipo: 'FORA_DA_LISTA',
              quantidadePrevista: 0,
              quantidadeUtilizada: Number(usadasDaOutra),
              observacao: 'Peça utilizada fora do previsto.',
              justificativa: 'Peça substituta emergencial',
            },
          ],
        });
      },
    );

    then(
      /^só as (\d+) unidades reservadas saem do estoque da primeira peça$/,
      async (unidades: string) => {
        expect(await estoqueDaPeca(ambiente.prisma, pecaPrincipal.id)).toEqual({
          fisico: 10 - Number(unidades),
          reservado: 3,
        });
        const [reserva] = await reservasDaOrdem(
          ambiente.prisma,
          jornada.ordemServicoId,
          pecaPrincipal.id,
        );
        expect(reserva).toMatchObject({
          situacao: SituacaoReservaEstoque.CONSUMIDA,
          quantidadeConsumida: Number(unidades),
        });
      },
    );

    and(
      'a reserva da outra ordem e o estoque livre da outra peça não são consumidos',
      async () => {
        const [reservaDaOutra] = await reservasDaOrdem(
          ambiente.prisma,
          outraOrdem.ordemServicoId,
          pecaPrincipal.id,
        );
        expect(reservaDaOutra).toMatchObject({
          situacao: SituacaoReservaEstoque.ATIVA,
          quantidade: 3,
          quantidadeConsumida: 0,
        });
        expect(
          await estoqueDaPeca(ambiente.prisma, pecaForaDaLista.id),
        ).toEqual({ fisico: 5, reservado: 0 });
        expect(
          await reservasDaOrdem(
            ambiente.prisma,
            jornada.ordemServicoId,
            pecaForaDaLista.id,
          ),
        ).toHaveLength(0);
      },
    );

    and(
      'uma pendência de inventário registra as duas divergências com a justificativa do mecânico',
      async () => {
        const pendencia = await pendenciaDeInventario();
        pendenciaId = pendencia.id;
        expect(pendencia.resolvida).toBe(false);
        const detalhes = pendencia.detalhes as {
          natureza: string;
          divergencias: { pecaId: string; tipo: string }[];
          divergenciasAuditoria: {
            pecaId: string;
            tipo: string;
            justificativa: string | null;
          }[];
        };
        expect(detalhes.natureza).toBe('DIVERGENCIA_CONSUMO');
        expect(detalhes.divergencias.map((d) => [d.pecaId, d.tipo])).toEqual([
          [pecaPrincipal.id, 'CONSUMO_ACIMA'],
          [pecaForaDaLista.id, 'FORA_DA_LISTA'],
        ]);
        expect(detalhes.divergenciasAuditoria).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              pecaId: pecaPrincipal.id,
              tipo: 'CONSUMO_ACIMA',
              justificativa: 'Peça adicional usada no reparo emergencial.',
            }),
            expect.objectContaining({
              pecaId: pecaForaDaLista.id,
              tipo: 'FORA_DA_LISTA',
              justificativa: 'Peça substituta emergencial',
            }),
          ]),
        );
        const consumo =
          await ambiente.prisma.consumoAplicadoOs.findUniqueOrThrow({
            where: {
              ordemServicoId_rodada: {
                ordemServicoId: jornada.ordemServicoId,
                rodada: 1,
              },
            },
          });
        expect(consumo).toMatchObject({
          eventId: reparoConcluido.eventId,
          tipoFato: 'REPARO_CONCLUIDO',
          responsavelId: 'mecanico-1',
          situacaoReconciliacao:
            SituacaoReconciliacaoConsumo.DIVERGENCIA_PENDENTE,
        });
        expect(consumo.concluidoEm?.toISOString()).toBe(
          (reparoConcluido.payload as { concluidoEm: string }).concluidoEm,
        );
      },
    );

    and('a ordem continua em execução e não pode ser finalizada', async () => {
      expect(await jornada.status()).toBe(StatusOS.EM_EXECUCAO);
    });

    when(
      'o administrador autenticado ajusta o estoque físico da primeira peça',
      async () => {
        await ambiente
          .administrador()
          .post('/v1/reservas-estoque/ajustes-divergencia')
          .send({
            pendenciaId,
            pecaId: pecaPrincipal.id,
            quantidadeFisicaNova: 7,
            motivo: 'Contagem física após o reparo emergencial',
          })
          .expect(204);
      },
    );

    then(
      'a pendência é resolvida com o administrador como responsável',
      async () => {
        const pendencia = await pendenciaDeInventario();
        expect(pendencia.resolvida).toBe(true);
        expect(pendencia.resolvidaPorId).toBe(ambiente.administradorId);
        const ajuste =
          await ambiente.prisma.ajusteEstoqueAdministrativo.findFirstOrThrow({
            where: { pendenciaId },
          });
        expect(ajuste).toMatchObject({
          pecaId: pecaPrincipal.id,
          ordemServicoId: jornada.ordemServicoId,
          quantidadeFisicaAnterior: 8,
          quantidadeFisicaNova: 7,
          responsavelId: ambiente.administradorId,
        });
        expect(await estoqueDaPeca(ambiente.prisma, pecaPrincipal.id)).toEqual({
          fisico: 7,
          reservado: 3,
        });
      },
    );

    and('a ordem é finalizada com a conclusão original do reparo', async () => {
      expect(await jornada.status()).toBe(StatusOS.FINALIZADA);
      const ordem = await ambiente.prisma.ordemServico.findUniqueOrThrow({
        where: { id: jornada.ordemServicoId },
      });
      expect(ordem.finalizadaEm?.toISOString()).toBe(
        (reparoConcluido.payload as { concluidoEm: string }).concluidoEm,
      );
      const consumo = await ambiente.prisma.consumoAplicadoOs.findFirstOrThrow({
        where: { ordemServicoId: jornada.ordemServicoId },
      });
      expect(consumo.situacaoReconciliacao).toBe(
        SituacaoReconciliacaoConsumo.DIVERGENCIA_RESOLVIDA,
      );
    });

    and('o consumo não foi aplicado duas vezes', async () => {
      await jornada.reentregar(reparoConcluido);
      expect(
        await ambiente.prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: jornada.ordemServicoId },
        }),
      ).toBe(1);
      expect(await estoqueDaPeca(ambiente.prisma, pecaPrincipal.id)).toEqual({
        fisico: 7,
        reservado: 3,
      });
      expect(await jornada.status()).toBe(StatusOS.FINALIZADA);
    });

    and('a reserva original mantém a quantidade autorizada', async () => {
      const [reserva] = await reservasDaOrdem(
        ambiente.prisma,
        jornada.ordemServicoId,
        pecaPrincipal.id,
      );
      expect(reserva.quantidade).toBe(2);
      expect(reserva.quantidadeConsumida).toBe(2);
    });
  });
});
