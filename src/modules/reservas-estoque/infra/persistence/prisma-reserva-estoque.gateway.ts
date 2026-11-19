import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { devePersistirResultadoIdempotente } from '@/shared/idempotency/idempotencia-interna';
import {
  EstoqueFisicoAbaixoReservadoError,
  EstoqueInsuficienteReservaError,
  MotivoAjusteAdministrativoInvalidoError,
  PendenciaInventarioJaResolvidaError,
  PendenciaInventarioNaoEncontradaError,
  ConteudoIdempotenciaDivergenteError,
  PecaNaoConstaDivergenciaError,
  ReservaEstoqueNaoEncontradaError,
  ReservaJaProcessadaError,
  ConsumoAplicadoIncompativelError,
  PendenciaResolucaoConsumoInvalidaError,
  QuantidadeResolucaoManualInvalidaError,
  ResolucaoConsumoManualComConsumoAplicadoError,
  ResolucaoConsumoManualJaExisteError,
} from '../../domain/errors/reserva-estoque.errors';
import { consolidarItensQuantidade } from '@/modules/coordenacao-saga/domain/consolidar-itens-quantidade';
import { conciliarConsumoEfetivo } from '../../domain/conciliar-consumo-efetivo';
import type {
  ContextoConsumoEstoque,
  DivergenciaInventarioDetalhe,
} from '../../application/ports/reserva-estoque.gateway';
import type { Prisma } from '@/shared/generated/prisma/client';
import { SituacaoReservaEstoque } from '@/shared/generated/prisma/enums';
import type {
  ItemReservaEstoque,
  LinhaReservaEstoque,
  ReservaEstoqueGateway,
  ResultadoConsumoReserva,
  ResultadoIdempotenciaEstoque,
  ResultadoReservaEstoque,
  SaldoPecaEstoque,
} from '../../application/ports/reserva-estoque.gateway';
import { PrismaReservaEstoqueMapper } from './prisma-reserva-estoque.mapper';
import {
  NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO,
  naturezaPendenciaInventario,
} from '../../domain/natureza-pendencia-inventario';

const TTL_HORAS = 24;

type ClienteTransacao = ReturnType<typeof obterClienteTransacao>;

interface ReservaBloqueadaRow {
  id: string;
  grupo_reserva_id: string;
  ordem_servico_id: string;
  rodada: number;
  peca_id: string;
  quantidade: number;
  quantidade_consumida: number;
  situacao: string;
  prazo_referencia: Date | null;
}

interface PendenciaBloqueadaRow {
  id: string;
  ordem_servico_id: string;
  rodada: number;
  resolvida: boolean;
  detalhes: { divergencias?: { pecaId: string }[] };
}

@Injectable()
export class PrismaReservaEstoqueGateway implements ReservaEstoqueGateway {
  private readonly logger = new Logger(PrismaReservaEstoqueGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  async buscarIdempotencia<T>(
    contexto: ContextoTransacao,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<ResultadoIdempotenciaEstoque<T> | null> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const record = await cliente.idempotencyRecord.findUnique({
      where: {
        idempotencyKey_scope: { idempotencyKey, scope },
      },
    });

    if (!record) {
      return null;
    }

    if (record.requestHash !== requestHash) {
      throw new ConteudoIdempotenciaDivergenteError();
    }

    return {
      reutilizado: true,
      resultado: record.responseBody as T,
    };
  }

  async gravarIdempotencia(
    contexto: ContextoTransacao,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
    responseBody: unknown,
  ): Promise<void> {
    if (!devePersistirResultadoIdempotente(200)) {
      return;
    }

    const cliente = obterClienteTransacao(contexto, this.prisma);
    const expiraEm = new Date(Date.now() + TTL_HORAS * 60 * 60 * 1000);

    await cliente.idempotencyRecord.create({
      data: {
        idempotencyKey,
        scope,
        requestHash,
        responseStatus: 200,
        responseBody: responseBody as object,
        expiraEm,
      },
    });
  }

  async reservar(
    contexto: ContextoTransacao,
    input: {
      ordemServicoId: string;
      rodada: number;
      grupoReservaId: string;
      prazoReferencia: Date | null;
      itens: ItemReservaEstoque[];
      permitirPecaInativa: boolean;
    },
  ): Promise<ResultadoReservaEstoque> {
    if (input.itens.length === 0) {
      throw new EstoqueInsuficienteReservaError([]);
    }

    const cliente = obterClienteTransacao(contexto, this.prisma);
    const agregados = new Map<string, number>();
    for (const item of input.itens) {
      agregados.set(
        item.pecaId,
        (agregados.get(item.pecaId) ?? 0) + item.quantidade,
      );
    }

    const itensOrdenados = [...agregados.entries()]
      .map(([pecaId, quantidade]) => ({ pecaId, quantidade }))
      .sort((a, b) => a.pecaId.localeCompare(b.pecaId));

    await this.bloquearReservasAtivas(
      cliente,
      input.ordemServicoId,
      input.rodada,
    );

    const saldos = new Map<string, SaldoPecaEstoque>();
    for (const item of itensOrdenados) {
      const saldo = await this.bloquearPeca(cliente, item.pecaId);
      if (!saldo) {
        throw new EstoqueInsuficienteReservaError([
          {
            pecaId: item.pecaId,
            disponivelAtual: 0,
            solicitado: item.quantidade,
          },
        ]);
      }

      if (!input.permitirPecaInativa && !saldo.ativo) {
        throw new EstoqueInsuficienteReservaError([
          {
            pecaId: item.pecaId,
            disponivelAtual: saldo.disponivel,
            solicitado: item.quantidade,
          },
        ]);
      }

      saldos.set(item.pecaId, saldo);
    }

    const indisponiveis: {
      pecaId: string;
      disponivelAtual: number;
      solicitado: number;
    }[] = [];

    for (const item of itensOrdenados) {
      const saldo = saldos.get(item.pecaId)!;
      if (item.quantidade > saldo.disponivel) {
        indisponiveis.push({
          pecaId: item.pecaId,
          disponivelAtual: saldo.disponivel,
          solicitado: item.quantidade,
        });
      }
    }

    if (indisponiveis.length > 0) {
      throw new EstoqueInsuficienteReservaError(indisponiveis);
    }

    const linhas: LinhaReservaEstoque[] = [];
    for (const item of itensOrdenados) {
      const condicional = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_reservada = quantidade_reservada + ${item.quantidade}
        WHERE id = ${item.pecaId}::uuid
          AND quantidade_estoque - quantidade_reservada >= ${item.quantidade}
      `;

      if (condicional !== 1) {
        const saldo = saldos.get(item.pecaId)!;
        throw new EstoqueInsuficienteReservaError([
          {
            pecaId: item.pecaId,
            disponivelAtual: saldo.disponivel,
            solicitado: item.quantidade,
          },
        ]);
      }

      const raw = await cliente.reservaEstoque.create({
        data: {
          id: randomUUID(),
          grupoReservaId: input.grupoReservaId,
          ordemServicoId: input.ordemServicoId,
          rodada: input.rodada,
          pecaId: item.pecaId,
          quantidade: item.quantidade,
          prazoReferencia: input.prazoReferencia,
          situacao: SituacaoReservaEstoque.ATIVA,
        },
      });

      linhas.push(PrismaReservaEstoqueMapper.toLinha(raw));
    }

    return {
      grupoReservaId: input.grupoReservaId,
      prazoReferencia: input.prazoReferencia,
      linhas,
    };
  }

  async liberar(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<LinhaReservaEstoque[]> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const linhas = await this.bloquearReservasAtivas(
      cliente,
      ordemServicoId,
      rodada,
    );

    if (linhas.length === 0) {
      const possuiAlgumaReserva = await cliente.reservaEstoque.findFirst({
        where: { ordemServicoId, rodada },
        select: { id: true },
      });
      if (!possuiAlgumaReserva) {
        throw new ReservaEstoqueNaoEncontradaError(ordemServicoId, rodada);
      }
      return [];
    }

    const idsProcessados: string[] = [];

    for (const linha of linhas) {
      await this.bloquearPeca(cliente, linha.peca_id);

      const liberado = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_reservada = quantidade_reservada - ${linha.quantidade}
        WHERE id = ${linha.peca_id}::uuid
          AND quantidade_reservada >= ${linha.quantidade}
      `;

      if (liberado !== 1) {
        throw new ReservaJaProcessadaError();
      }

      const transicionou = await this.transicionarReserva(
        cliente,
        linha.id,
        SituacaoReservaEstoque.LIBERADA,
        {},
      );
      if (!transicionou) {
        throw new ReservaJaProcessadaError();
      }

      idsProcessados.push(linha.id);
    }

    const atualizadas = await cliente.reservaEstoque.findMany({
      where: { id: { in: idsProcessados } },
    });

    return atualizadas.map((raw) => PrismaReservaEstoqueMapper.toLinha(raw));
  }

  async consumir(
    contexto: ContextoTransacao,
    input: {
      ordemServicoId: string;
      rodada: number;
      itensUtilizados: ItemReservaEstoque[];
      contextoFato?: ContextoConsumoEstoque;
    },
  ): Promise<ResultadoConsumoReserva> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.$queryRaw`
      SELECT id FROM ordens_servico WHERE id = ${input.ordemServicoId}::uuid FOR UPDATE
    `;

    const resolucaoManual = await cliente.resolucaoConsumoManual.findUnique({
      where: {
        ordemServicoId_rodada: {
          ordemServicoId: input.ordemServicoId,
          rodada: input.rodada,
        },
      },
    });
    if (resolucaoManual) {
      throw new ReservaJaProcessadaError();
    }

    const existente = await cliente.consumoAplicadoOs.findUnique({
      where: {
        ordemServicoId_rodada: {
          ordemServicoId: input.ordemServicoId,
          rodada: input.rodada,
        },
      },
    });
    if (existente) {
      if (!input.contextoFato) {
        throw new ReservaJaProcessadaError();
      }
      if (existente.eventId !== input.contextoFato.eventId) {
        throw new ConsumoAplicadoIncompativelError();
      }
      return this.montarResultadoDeConsumoAplicado(
        cliente,
        input,
        existente.id,
        true,
      );
    }

    const linhasAtivas = await this.bloquearReservasAtivas(
      cliente,
      input.ordemServicoId,
      input.rodada,
    );

    if (linhasAtivas.length === 0) {
      const possuiAlgumaReserva = await cliente.reservaEstoque.findFirst({
        where: {
          ordemServicoId: input.ordemServicoId,
          rodada: input.rodada,
        },
        select: { id: true },
      });
      if (!possuiAlgumaReserva) {
        throw new ReservaEstoqueNaoEncontradaError(
          input.ordemServicoId,
          input.rodada,
        );
      }
      throw new ReservaJaProcessadaError();
    }

    const pecasUtilizadas =
      input.contextoFato?.consumoEfetivo?.map((p) => ({
        itemId: p.itemId,
        quantidade: p.quantidade,
      })) ??
      input.itensUtilizados.map((p) => ({
        itemId: p.pecaId,
        quantidade: p.quantidade,
      }));

    const divergenciasFato =
      input.contextoFato?.divergenciasFato?.map((d) => {
        const n = this.normalizarDivergencia(d);
        return {
          itemId: n.pecaId,
          quantidadePrevista: n.quantidadePrevista ?? n.quantidadeReservada,
          quantidadeUtilizada: n.quantidadeUtilizada ?? n.quantidadeInformada,
          tipo: n.tipo ?? undefined,
          observacao: n.observacao ?? undefined,
          justificativa: n.justificativa ?? undefined,
          motivo: n.motivo,
          quantidadeReservada: n.quantidadeReservada,
          quantidadeInformada: n.quantidadeInformada,
        };
      }) ?? [];

    const pecaIdsValidos = [
      ...new Set(
        pecasUtilizadas
          .map((p) => p.itemId)
          .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
      ),
    ];
    const pecasCatalogo = new Set(
      pecaIdsValidos.length === 0
        ? []
        : (
            await cliente.peca.findMany({
              where: { id: { in: pecaIdsValidos } },
              select: { id: true },
            })
          ).map((p) => p.id),
    );

    const conciliacao = conciliarConsumoEfetivo(
      linhasAtivas.map((l) => ({
        pecaId: l.peca_id,
        quantidadeReservada: l.quantidade,
      })),
      pecasUtilizadas,
      divergenciasFato,
      (pecaId) => pecasCatalogo.has(pecaId),
    );

    const mapaReservas = new Map(linhasAtivas.map((l) => [l.peca_id, l]));
    const divergenciasInventario = conciliacao.divergenciasInventario.map((d) =>
      this.paraDivergenciaDetalhe(d),
    );
    const divergenciasAuditoria = conciliacao.divergenciasAuditoria.map((d) =>
      this.paraDivergenciaDetalhe(d),
    );

    const pecasProcessadas = new Set<string>();
    const itensAutomaticos = [...conciliacao.itensAutomaticos].sort((a, b) =>
      a.itemId.localeCompare(b.itemId),
    );

    const pecaIdsOrdenados = [
      ...new Set<string>([
        ...linhasAtivas.map((l) => l.peca_id),
        ...itensAutomaticos
          .map((i) => i.itemId)
          .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
      ]),
    ].sort((a, b) => a.localeCompare(b));

    for (const pecaId of pecaIdsOrdenados) {
      await this.bloquearPeca(cliente, pecaId);
    }

    for (const item of itensAutomaticos) {
      const linha = mapaReservas.get(item.itemId);
      if (!linha) {
        continue;
      }
      const utilizada = Math.min(item.quantidade, linha.quantidade);
      pecasProcessadas.add(item.itemId);

      const consumoFisico = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_estoque = quantidade_estoque - ${utilizada},
            quantidade_reservada = quantidade_reservada - ${linha.quantidade}
        WHERE id = ${linha.peca_id}::uuid
          AND quantidade_estoque >= ${utilizada}
          AND quantidade_reservada >= ${linha.quantidade}
      `;

      if (consumoFisico !== 1) {
        throw new ReservaJaProcessadaError();
      }

      const transicionou = await this.transicionarReserva(
        cliente,
        linha.id,
        SituacaoReservaEstoque.CONSUMIDA,
        { quantidadeConsumida: utilizada },
      );
      if (!transicionou) {
        throw new ReservaJaProcessadaError();
      }
    }

    for (const linha of linhasAtivas) {
      if (pecasProcessadas.has(linha.peca_id)) {
        continue;
      }

      const liberado = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_reservada = quantidade_reservada - ${linha.quantidade}
        WHERE id = ${linha.peca_id}::uuid
          AND quantidade_reservada >= ${linha.quantidade}
      `;

      if (liberado !== 1) {
        throw new ReservaJaProcessadaError();
      }

      const transicionou = await this.transicionarReserva(
        cliente,
        linha.id,
        SituacaoReservaEstoque.LIBERADA,
        {},
      );
      if (!transicionou) {
        throw new ReservaJaProcessadaError();
      }
    }

    const linhasAtualizadas = await cliente.reservaEstoque.findMany({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
      },
    });

    const impedimentoInventario = divergenciasInventario.length > 0;
    let pendenciaInventarioId: string | null = null;
    if (impedimentoInventario) {
      const abertas = await cliente.pendenciaOs.findMany({
        where: {
          ordemServicoId: input.ordemServicoId,
          rodada: input.rodada,
          tipo: 'INVENTARIO',
          resolvida: false,
        },
      });
      const jaExiste = abertas.find(
        (p) =>
          naturezaPendenciaInventario(p.detalhes as Record<string, unknown>) ===
          NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO,
      );
      if (!jaExiste) {
        const pendencia = await cliente.pendenciaOs.create({
          data: {
            id: randomUUID(),
            ordemServicoId: input.ordemServicoId,
            rodada: input.rodada,
            tipo: 'INVENTARIO',
            detalhes: {
              natureza: NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO,
              divergencias: divergenciasInventario,
              divergenciasAuditoria,
              eventId: input.contextoFato?.eventId ?? null,
              responsavelId: input.contextoFato?.responsavelId ?? null,
              fatoOcorridoEm: input.contextoFato?.fatoOcorridoEm ?? null,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        pendenciaInventarioId = pendencia.id;
      } else {
        pendenciaInventarioId = jaExiste.id;
      }
    }

    if (!input.contextoFato) {
      throw new ReservaJaProcessadaError();
    }

    const consumoAplicadoId = randomUUID();
    const situacao = impedimentoInventario
      ? 'DIVERGENCIA_PENDENTE'
      : 'APLICADO';

    await cliente.consumoAplicadoOs.create({
      data: {
        id: consumoAplicadoId,
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        eventId: input.contextoFato.eventId,
        fatoOcorridoEm: input.contextoFato.fatoOcorridoEm,
        concluidoEm: input.contextoFato.concluidoEm ?? null,
        tipoFato: input.contextoFato.tipoFato,
        responsavelId: input.contextoFato.responsavelId ?? null,
        consumoEfetivo: pecasUtilizadas,
        divergencias: divergenciasAuditoria as unknown as Prisma.InputJsonValue,
        situacaoReconciliacao: situacao,
        aguardandoFinalizacao: Boolean(
          input.contextoFato?.aguardandoFinalizacao && impedimentoInventario,
        ),
      },
    });

    return {
      linhasAtualizadas: linhasAtualizadas.map((raw) =>
        PrismaReservaEstoqueMapper.toLinha(raw),
      ),
      divergencias: divergenciasInventario,
      divergenciasAuditoria,
      pendenciaInventarioId,
      impedimentoInventario,
      consumoAplicadoId,
      reutilizado: false,
    };
  }

  async possuiConsumoAplicadoNaRodada(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const registro = await cliente.consumoAplicadoOs.findUnique({
      where: { ordemServicoId_rodada: { ordemServicoId, rodada } },
      select: { id: true },
    });
    return registro !== null;
  }

  async listarLinhasAtivas(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<LinhaReservaEstoque[]> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const linhas = await cliente.reservaEstoque.findMany({
      where: {
        ordemServicoId,
        rodada,
        situacao: SituacaoReservaEstoque.ATIVA,
      },
    });
    return linhas.map((raw) => PrismaReservaEstoqueMapper.toLinha(raw));
  }

  async possuiConsumoAplicado(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    pecaIds: string[],
  ): Promise<boolean> {
    if (
      await this.possuiConsumoAplicadoNaRodada(contexto, ordemServicoId, rodada)
    ) {
      return true;
    }
    if (pecaIds.length === 0) {
      return false;
    }
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const consumidas = await cliente.reservaEstoque.count({
      where: {
        ordemServicoId,
        rodada,
        pecaId: { in: pecaIds },
        situacao: SituacaoReservaEstoque.CONSUMIDA,
      },
    });
    return consumidas === pecaIds.length;
  }

  async ajustarFisicoAdministrativo(
    contexto: ContextoTransacao,
    input: {
      pendenciaId: string;
      pecaId: string;
      quantidadeFisicaNova: number;
      motivo: string;
      responsavelId: string;
    },
  ): Promise<{ ordemServicoId: string; pendenciaResolvida: boolean }> {
    const motivoNormalizado = input.motivo.trim();
    if (!motivoNormalizado) {
      throw new MotivoAjusteAdministrativoInvalidoError();
    }

    const cliente = obterClienteTransacao(contexto, this.prisma);
    const referencia = await cliente.pendenciaOs.findUnique({
      where: { id: input.pendenciaId },
      select: {
        id: true,
        ordemServicoId: true,
      },
    });
    if (!referencia) {
      throw new PendenciaInventarioNaoEncontradaError(input.pendenciaId);
    }

    const osBloqueada = await cliente.$queryRaw<{ id: string }[]>`
      SELECT id FROM ordens_servico WHERE id = ${referencia.ordemServicoId}::uuid FOR UPDATE
    `;
    if (!osBloqueada[0]) {
      throw new PendenciaInventarioNaoEncontradaError(input.pendenciaId);
    }

    const pendenciaRows = await cliente.$queryRaw<PendenciaBloqueadaRow[]>`
      SELECT id, ordem_servico_id, rodada, resolvida, detalhes
      FROM pendencias_os
      WHERE id = ${input.pendenciaId}::uuid
        AND resolvida = false
      FOR UPDATE
    `;

    const pendencia = pendenciaRows[0];
    if (!pendencia) {
      throw new PendenciaInventarioJaResolvidaError();
    }

    const divergencias = pendencia.detalhes?.divergencias ?? [];
    if (!divergencias.some((d) => d.pecaId === input.pecaId)) {
      throw new PecaNaoConstaDivergenciaError(input.pecaId);
    }

    await this.bloquearReservasAtivas(
      cliente,
      pendencia.ordem_servico_id,
      pendencia.rodada,
    );

    const saldo = await this.bloquearPeca(cliente, input.pecaId);
    if (!saldo) {
      throw new PendenciaInventarioNaoEncontradaError(input.pendenciaId);
    }

    if (input.quantidadeFisicaNova < saldo.quantidadeReservada) {
      throw new EstoqueFisicoAbaixoReservadoError();
    }

    const fisicoAtualizado = await cliente.$executeRaw`
      UPDATE pecas
      SET quantidade_estoque = ${input.quantidadeFisicaNova}
      WHERE id = ${input.pecaId}::uuid
        AND quantidade_reservada <= ${input.quantidadeFisicaNova}
    `;

    if (fisicoAtualizado !== 1) {
      throw new EstoqueFisicoAbaixoReservadoError();
    }

    await cliente.ajusteEstoqueAdministrativo.create({
      data: {
        id: randomUUID(),
        pecaId: input.pecaId,
        ordemServicoId: pendencia.ordem_servico_id,
        pendenciaId: pendencia.id,
        quantidadeFisicaAnterior: saldo.quantidadeFisica,
        quantidadeFisicaNova: input.quantidadeFisicaNova,
        motivo: motivoNormalizado,
        responsavelId: input.responsavelId,
      },
    });

    if (
      !(await this.todasPecasDivergentesAjustadas(
        cliente,
        pendencia.id,
        divergencias,
      ))
    ) {
      this.logger.log({
        message: 'estoque.ajuste_administrativo_parcial',
        pendenciaId: pendencia.id,
        pecaId: input.pecaId,
        ordemServicoId: pendencia.ordem_servico_id,
        responsavelId: input.responsavelId,
      });
      return {
        ordemServicoId: pendencia.ordem_servico_id,
        pendenciaResolvida: false,
      };
    }

    const resolvida = await cliente.$executeRaw`
      UPDATE pendencias_os
      SET resolvida = true,
          resolvida_em = NOW(),
          resolvida_por_id = ${input.responsavelId}::uuid
      WHERE id = ${input.pendenciaId}::uuid
        AND resolvida = false
    `;

    if (resolvida !== 1) {
      throw new PendenciaInventarioJaResolvidaError();
    }

    this.logger.log({
      message: 'estoque.ajuste_administrativo',
      pendenciaId: pendencia.id,
      pecaId: input.pecaId,
      ordemServicoId: pendencia.ordem_servico_id,
      quantidadeFisicaAnterior: saldo.quantidadeFisica,
      quantidadeFisicaNova: input.quantidadeFisicaNova,
      responsavelId: input.responsavelId,
    });

    return {
      ordemServicoId: pendencia.ordem_servico_id,
      pendenciaResolvida: true,
    };
  }

  /**
   * A pendência só é resolvida com ajuste registrado para toda peça divergente
   * (D4.8, decisão de 2026-11-18). Peça fora do catálogo não tem estoque físico
   * a ajustar e fica só na auditoria da pendência.
   */
  private async todasPecasDivergentesAjustadas(
    cliente: ClienteTransacao,
    pendenciaId: string,
    divergencias: { pecaId: string }[],
  ): Promise<boolean> {
    const noCatalogo = await this.buscarPecasNoCatalogo(cliente, divergencias);
    const ajustadas = new Set(
      (
        await cliente.ajusteEstoqueAdministrativo.findMany({
          where: { pendenciaId },
          select: { pecaId: true },
        })
      ).map((a) => a.pecaId),
    );
    return noCatalogo.every((peca) => ajustadas.has(peca.id));
  }

  /**
   * Peça divergente fora do catálogo: identificador sem formato de UUID ou UUID
   * sem peça cadastrada. Mesma regra do ajuste por peça (D4.8).
   */
  async listarPecasDivergentesNoCatalogo(
    contexto: ContextoTransacao,
    divergencias: { pecaId: string }[],
  ): Promise<string[]> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const noCatalogo = await this.buscarPecasNoCatalogo(cliente, divergencias);
    return noCatalogo.map((peca) => peca.id);
  }

  private async buscarPecasNoCatalogo(
    cliente: ClienteTransacao,
    divergencias: { pecaId: string }[],
  ): Promise<{ id: string }[]> {
    const candidatas = [
      ...new Set(
        divergencias
          .map((d) => d.pecaId)
          .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
      ),
    ];
    return cliente.peca.findMany({
      where: { id: { in: candidatas } },
      select: { id: true },
    });
  }

  async resolverConsumoManualInicial(
    contexto: ContextoTransacao,
    input: {
      pendenciaId: string;
      itensConsumidos: ItemReservaEstoque[];
      itensLiberados: ItemReservaEstoque[];
      motivo: string;
      responsavelId: string;
      ajustesFisicos?: { pecaId: string; quantidadeFisicaNova: number }[];
    },
  ): Promise<{
    ordemServicoId: string;
    rodada: number;
    resolucaoId: string;
  }> {
    const motivoNormalizado = input.motivo.trim();
    if (!motivoNormalizado || motivoNormalizado.length > 500) {
      throw new MotivoAjusteAdministrativoInvalidoError();
    }

    const cliente = obterClienteTransacao(contexto, this.prisma);
    const pendenciaRef = await cliente.pendenciaOs.findUnique({
      where: { id: input.pendenciaId },
      select: { id: true, ordemServicoId: true, rodada: true },
    });
    if (!pendenciaRef) {
      throw new PendenciaInventarioNaoEncontradaError(input.pendenciaId);
    }

    await cliente.$queryRaw`
      SELECT id FROM ordens_servico WHERE id = ${pendenciaRef.ordemServicoId}::uuid FOR UPDATE
    `;

    const consumoAplicado = await cliente.consumoAplicadoOs.findUnique({
      where: {
        ordemServicoId_rodada: {
          ordemServicoId: pendenciaRef.ordemServicoId,
          rodada: pendenciaRef.rodada,
        },
      },
    });
    if (consumoAplicado) {
      throw new ResolucaoConsumoManualComConsumoAplicadoError();
    }

    const resolucaoExistente = await cliente.resolucaoConsumoManual.findUnique({
      where: {
        ordemServicoId_rodada: {
          ordemServicoId: pendenciaRef.ordemServicoId,
          rodada: pendenciaRef.rodada,
        },
      },
    });
    if (resolucaoExistente) {
      throw new ResolucaoConsumoManualJaExisteError();
    }

    const pendenciaRows = await cliente.$queryRaw<
      {
        id: string;
        ordem_servico_id: string;
        rodada: number;
        resolvida: boolean;
        detalhes: { natureza?: string };
      }[]
    >`
      SELECT id, ordem_servico_id, rodada, resolvida, detalhes
      FROM pendencias_os
      WHERE id = ${input.pendenciaId}::uuid
      FOR UPDATE
    `;
    const pendencia = pendenciaRows[0];
    if (!pendencia || pendencia.resolvida) {
      throw new PendenciaInventarioJaResolvidaError();
    }
    if (pendencia.detalhes?.natureza !== 'INFORMACAO_INSUFICIENTE') {
      throw new PendenciaResolucaoConsumoInvalidaError();
    }

    const consumidos = consolidarItensQuantidade(
      input.itensConsumidos.map((i) => ({
        itemId: i.pecaId,
        quantidade: i.quantidade,
      })),
    );
    const liberados = consolidarItensQuantidade(
      input.itensLiberados.map((i) => ({
        itemId: i.pecaId,
        quantidade: i.quantidade,
      })),
    );
    const mapaConsumido = new Map(
      consumidos.map((i) => [i.itemId, i.quantidade]),
    );
    const mapaLiberado = new Map(
      liberados.map((i) => [i.itemId, i.quantidade]),
    );

    await cliente.$queryRaw`
      SELECT id FROM resolucoes_consumo_manuais
      WHERE ordem_servico_id = ${pendencia.ordem_servico_id}::uuid
        AND rodada = ${pendencia.rodada}
      FOR UPDATE
    `;

    const linhasAtivas = await this.bloquearReservasAtivas(
      cliente,
      pendencia.ordem_servico_id,
      pendencia.rodada,
    );

    const pecasReservaAtiva = new Set(linhasAtivas.map((l) => l.peca_id));
    for (const itemId of [
      ...mapaConsumido.keys(),
      ...mapaLiberado.keys(),
      ...(input.ajustesFisicos?.map((a) => a.pecaId) ?? []),
    ]) {
      if (!pecasReservaAtiva.has(itemId)) {
        throw new QuantidadeResolucaoManualInvalidaError(
          `Peça ${itemId} não possui reserva ativa nesta OS e rodada.`,
        );
      }
    }
    for (const [pecaId, qtd] of mapaConsumido) {
      if (qtd < 0 || !Number.isInteger(qtd)) {
        throw new QuantidadeResolucaoManualInvalidaError(
          `Quantidade consumida inválida para a peça ${pecaId}.`,
        );
      }
    }
    for (const [pecaId, qtd] of mapaLiberado) {
      if (qtd < 0 || !Number.isInteger(qtd)) {
        throw new QuantidadeResolucaoManualInvalidaError(
          `Quantidade liberada inválida para a peça ${pecaId}.`,
        );
      }
    }

    for (const linha of linhasAtivas) {
      const consumir = mapaConsumido.get(linha.peca_id) ?? 0;
      const liberarQty = mapaLiberado.get(linha.peca_id) ?? 0;
      if (consumir + liberarQty !== linha.quantidade) {
        throw new QuantidadeResolucaoManualInvalidaError(
          `Soma de consumido e liberado difere da reserva original para a peça ${linha.peca_id}.`,
        );
      }
      if (consumir > linha.quantidade) {
        throw new QuantidadeResolucaoManualInvalidaError(
          `Consumo manual excede reserva original para a peça ${linha.peca_id}.`,
        );
      }
    }

    const pecasAfetadas = new Set([
      ...mapaConsumido.keys(),
      ...mapaLiberado.keys(),
      ...(input.ajustesFisicos?.map((a) => a.pecaId) ?? []),
    ]);
    for (const pecaId of [...pecasAfetadas].sort()) {
      await this.bloquearPeca(cliente, pecaId);
    }

    for (const linha of linhasAtivas) {
      const utilizada = mapaConsumido.get(linha.peca_id) ?? 0;
      if (utilizada <= 0) {
        continue;
      }
      const consumoFisico = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_estoque = quantidade_estoque - ${utilizada},
            quantidade_reservada = quantidade_reservada - ${linha.quantidade}
        WHERE id = ${linha.peca_id}::uuid
          AND quantidade_estoque >= ${utilizada}
          AND quantidade_reservada >= ${linha.quantidade}
      `;
      if (consumoFisico !== 1) {
        throw new ReservaJaProcessadaError();
      }
      const transicionou = await this.transicionarReserva(
        cliente,
        linha.id,
        SituacaoReservaEstoque.CONSUMIDA,
        { quantidadeConsumida: utilizada },
      );
      if (!transicionou) {
        throw new ReservaJaProcessadaError();
      }
    }

    for (const linha of linhasAtivas) {
      if ((mapaConsumido.get(linha.peca_id) ?? 0) > 0) {
        continue;
      }
      const liberado = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_reservada = quantidade_reservada - ${linha.quantidade}
        WHERE id = ${linha.peca_id}::uuid
          AND quantidade_reservada >= ${linha.quantidade}
      `;
      if (liberado !== 1) {
        throw new ReservaJaProcessadaError();
      }
      const transicionou = await this.transicionarReserva(
        cliente,
        linha.id,
        SituacaoReservaEstoque.LIBERADA,
        {},
      );
      if (!transicionou) {
        throw new ReservaJaProcessadaError();
      }
    }

    for (const ajuste of input.ajustesFisicos ?? []) {
      const saldo = await cliente.peca.findUnique({
        where: { id: ajuste.pecaId },
        select: { quantidadeEstoque: true, quantidadeReservada: true },
      });
      if (!saldo) {
        throw new PendenciaInventarioNaoEncontradaError(input.pendenciaId);
      }
      if (ajuste.quantidadeFisicaNova < saldo.quantidadeReservada) {
        throw new EstoqueFisicoAbaixoReservadoError();
      }
      const fisicoAtualizado = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_estoque = ${ajuste.quantidadeFisicaNova}
        WHERE id = ${ajuste.pecaId}::uuid
          AND quantidade_reservada <= ${ajuste.quantidadeFisicaNova}
      `;
      if (fisicoAtualizado !== 1) {
        throw new EstoqueFisicoAbaixoReservadoError();
      }
      await cliente.ajusteEstoqueAdministrativo.create({
        data: {
          id: randomUUID(),
          pecaId: ajuste.pecaId,
          ordemServicoId: pendencia.ordem_servico_id,
          pendenciaId: pendencia.id,
          quantidadeFisicaAnterior: saldo.quantidadeEstoque,
          quantidadeFisicaNova: ajuste.quantidadeFisicaNova,
          motivo: motivoNormalizado,
          responsavelId: input.responsavelId,
        },
      });
    }

    const resolucaoId = randomUUID();
    const resolvidoEm = new Date();
    await cliente.resolucaoConsumoManual.create({
      data: {
        id: resolucaoId,
        ordemServicoId: pendencia.ordem_servico_id,
        rodada: pendencia.rodada,
        pendenciaId: pendencia.id,
        itensConsumidos: consumidos as unknown as Prisma.InputJsonValue,
        itensLiberados: liberados as unknown as Prisma.InputJsonValue,
        motivo: motivoNormalizado,
        responsavelId: input.responsavelId,
        resolvidoEm,
      },
    });

    const resolvida = await cliente.$executeRaw`
      UPDATE pendencias_os
      SET resolvida = true,
          resolvida_em = ${resolvidoEm},
          resolvida_por_id = ${input.responsavelId}::uuid
      WHERE id = ${pendencia.id}::uuid
        AND resolvida = false
    `;
    if (resolvida !== 1) {
      throw new PendenciaInventarioJaResolvidaError();
    }

    this.logger.log({
      message: 'estoque.resolucao_consumo_manual',
      pendenciaId: pendencia.id,
      ordemServicoId: pendencia.ordem_servico_id,
      rodada: pendencia.rodada,
      resolucaoId,
      responsavelId: input.responsavelId,
    });

    return {
      ordemServicoId: pendencia.ordem_servico_id,
      rodada: pendencia.rodada,
      resolucaoId,
    };
  }

  private normalizarDivergencia(
    d: DivergenciaInventarioDetalhe,
  ): DivergenciaInventarioDetalhe {
    return {
      pecaId: d.pecaId ?? (d as { itemId?: string }).itemId ?? '',
      quantidadeReservada: d.quantidadeReservada ?? d.quantidadePrevista ?? 0,
      quantidadeInformada: d.quantidadeInformada ?? d.quantidadeUtilizada ?? 0,
      quantidadePrevista: d.quantidadePrevista,
      quantidadeUtilizada: d.quantidadeUtilizada,
      tipo: d.tipo,
      observacao: d.observacao,
      justificativa: d.justificativa,
      motivo: d.motivo ?? '',
    };
  }

  private paraDivergenciaDetalhe(d: {
    itemId: string;
    quantidadePrevista?: number;
    quantidadeUtilizada?: number;
    quantidadeReservada?: number;
    quantidadeInformada?: number;
    tipo?: string;
    observacao?: string;
    justificativa?: string | null;
    motivo?: string;
  }): DivergenciaInventarioDetalhe {
    return {
      pecaId: d.itemId,
      quantidadeReservada: d.quantidadeReservada ?? 0,
      quantidadeInformada: d.quantidadeInformada ?? d.quantidadeUtilizada ?? 0,
      quantidadePrevista: d.quantidadePrevista,
      quantidadeUtilizada: d.quantidadeUtilizada,
      tipo: d.tipo ?? null,
      observacao: d.observacao ?? null,
      justificativa: d.justificativa ?? null,
      motivo: d.motivo ?? '',
    };
  }

  private async montarResultadoDeConsumoAplicado(
    cliente: ClienteTransacao,
    input: {
      ordemServicoId: string;
      rodada: number;
    },
    consumoAplicadoId: string,
    reutilizado: boolean,
  ): Promise<ResultadoConsumoReserva> {
    const registro = await cliente.consumoAplicadoOs.findUniqueOrThrow({
      where: { id: consumoAplicadoId },
    });
    const pendencia = await cliente.pendenciaOs.findFirst({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        tipo: 'INVENTARIO',
        resolvida: false,
      },
    });
    const divergenciasAuditoria = (registro.divergencias ??
      []) as unknown as DivergenciaInventarioDetalhe[];
    const divergencias = divergenciasAuditoria.filter((d) => Boolean(d.motivo));
    const linhasAtualizadas = await cliente.reservaEstoque.findMany({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
      },
    });
    return {
      linhasAtualizadas: linhasAtualizadas.map((raw) =>
        PrismaReservaEstoqueMapper.toLinha(raw),
      ),
      divergencias,
      divergenciasAuditoria,
      pendenciaInventarioId: pendencia?.id ?? null,
      impedimentoInventario:
        registro.situacaoReconciliacao === 'DIVERGENCIA_PENDENTE',
      consumoAplicadoId,
      reutilizado,
    };
  }

  private async bloquearReservasAtivas(
    cliente: ClienteTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<ReservaBloqueadaRow[]> {
    return cliente.$queryRaw<ReservaBloqueadaRow[]>`
      SELECT
        id,
        grupo_reserva_id,
        ordem_servico_id,
        rodada,
        peca_id,
        quantidade,
        quantidade_consumida,
        situacao,
        prazo_referencia
      FROM reservas_estoque
      WHERE ordem_servico_id = ${ordemServicoId}::uuid
        AND rodada = ${rodada}
        AND situacao = 'ATIVA'
      ORDER BY peca_id
      FOR UPDATE
    `;
  }

  private async transicionarReserva(
    cliente: ClienteTransacao,
    reservaId: string,
    situacaoNova: SituacaoReservaEstoque,
    extras: { quantidadeConsumida?: number },
  ): Promise<boolean> {
    if (extras.quantidadeConsumida !== undefined) {
      const linhas = await cliente.$executeRaw`
        UPDATE reservas_estoque
        SET situacao = ${situacaoNova},
            quantidade_consumida = ${extras.quantidadeConsumida}
        WHERE id = ${reservaId}::uuid
          AND situacao = 'ATIVA'
      `;
      return linhas === 1;
    }

    const linhas = await cliente.$executeRaw`
      UPDATE reservas_estoque
      SET situacao = ${situacaoNova}
      WHERE id = ${reservaId}::uuid
        AND situacao = 'ATIVA'
    `;
    return linhas === 1;
  }

  private async bloquearPeca(
    cliente: ClienteTransacao,
    pecaId: string,
  ): Promise<SaldoPecaEstoque | null> {
    const rows = await cliente.$queryRaw<
      {
        id: string;
        quantidade_estoque: number;
        quantidade_reservada: number;
        ativo: boolean;
      }[]
    >`
      SELECT id, quantidade_estoque, quantidade_reservada, ativo
      FROM pecas
      WHERE id = ${pecaId}::uuid
      FOR UPDATE
    `;

    const raw = rows[0];
    if (!raw) {
      return null;
    }

    const disponivel = raw.quantidade_estoque - raw.quantidade_reservada;
    return {
      pecaId: raw.id,
      quantidadeFisica: raw.quantidade_estoque,
      quantidadeReservada: raw.quantidade_reservada,
      disponivel,
      ativo: raw.ativo,
    };
  }
}
