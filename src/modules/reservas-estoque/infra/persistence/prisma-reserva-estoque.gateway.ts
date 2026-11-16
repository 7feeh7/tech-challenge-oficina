import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { devePersistirResultadoIdempotente } from '@/shared/idempotency/idempotencia-interna';
import {
  EstoqueInsuficienteReservaError,
  PendenciaInventarioJaResolvidaError,
  PendenciaInventarioNaoEncontradaError,
  ConteudoIdempotenciaDivergenteError,
  ReservaJaProcessadaError,
} from '../../domain/errors/reserva-estoque.errors';
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

const TTL_HORAS = 24;

@Injectable()
export class PrismaReservaEstoqueGateway implements ReservaEstoqueGateway {
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
    const linhas = await cliente.reservaEstoque.findMany({
      where: {
        ordemServicoId,
        rodada,
        situacao: SituacaoReservaEstoque.ATIVA,
      },
      orderBy: { pecaId: 'asc' },
    });

    if (linhas.length === 0) {
      return [];
    }

    for (const linha of linhas) {
      await this.bloquearPeca(cliente, linha.pecaId);

      const liberado = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_reservada = quantidade_reservada - ${linha.quantidade}
        WHERE id = ${linha.pecaId}::uuid
          AND quantidade_reservada >= ${linha.quantidade}
      `;

      if (liberado !== 1) {
        throw new ReservaJaProcessadaError();
      }

      await cliente.reservaEstoque.update({
        where: { id: linha.id },
        data: { situacao: SituacaoReservaEstoque.LIBERADA },
      });
    }

    const atualizadas = await cliente.reservaEstoque.findMany({
      where: {
        ordemServicoId,
        rodada,
        id: { in: linhas.map((l) => l.id) },
      },
    });

    return atualizadas.map((raw) => PrismaReservaEstoqueMapper.toLinha(raw));
  }

  async consumir(
    contexto: ContextoTransacao,
    input: {
      ordemServicoId: string;
      rodada: number;
      itensUtilizados: ItemReservaEstoque[];
    },
  ): Promise<ResultadoConsumoReserva> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const linhasAtivas = await cliente.reservaEstoque.findMany({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        situacao: SituacaoReservaEstoque.ATIVA,
      },
    });

    const mapaReservas = new Map(linhasAtivas.map((l) => [l.pecaId, l]));
    const divergencias: ResultadoConsumoReserva['divergencias'] = [];

    const pecasProcessadas = new Set<string>();

    for (const item of input.itensUtilizados) {
      const linha = mapaReservas.get(item.pecaId);
      if (!linha) {
        divergencias.push({
          pecaId: item.pecaId,
          quantidadeReservada: 0,
          quantidadeInformada: item.quantidade,
          motivo: 'Peça não consta na reserva ativa.',
        });
        continue;
      }

      if (item.quantidade > linha.quantidade) {
        divergencias.push({
          pecaId: item.pecaId,
          quantidadeReservada: linha.quantidade,
          quantidadeInformada: item.quantidade,
          motivo: 'Quantidade informada excede a reservada.',
        });
      }

      const utilizada = Math.min(item.quantidade, linha.quantidade);
      pecasProcessadas.add(item.pecaId);

      await this.bloquearPeca(cliente, linha.pecaId);

      const consumoFisico = await cliente.$executeRaw`
      UPDATE pecas
      SET quantidade_estoque = quantidade_estoque - ${utilizada},
          quantidade_reservada = quantidade_reservada - ${linha.quantidade}
      WHERE id = ${linha.pecaId}::uuid
        AND quantidade_estoque >= ${utilizada}
        AND quantidade_reservada >= ${linha.quantidade}
    `;

      if (consumoFisico !== 1) {
        throw new ReservaJaProcessadaError();
      }

      await cliente.reservaEstoque.update({
        where: { id: linha.id },
        data: {
          quantidadeConsumida: utilizada,
          situacao: SituacaoReservaEstoque.CONSUMIDA,
        },
      });
    }

    for (const linha of linhasAtivas) {
      if (pecasProcessadas.has(linha.pecaId)) {
        continue;
      }

      await this.bloquearPeca(cliente, linha.pecaId);

      const liberado = await cliente.$executeRaw`
      UPDATE pecas
      SET quantidade_reservada = quantidade_reservada - ${linha.quantidade}
      WHERE id = ${linha.pecaId}::uuid
        AND quantidade_reservada >= ${linha.quantidade}
    `;

      if (liberado !== 1) {
        throw new ReservaJaProcessadaError();
      }

      await cliente.reservaEstoque.update({
        where: { id: linha.id },
        data: { situacao: SituacaoReservaEstoque.LIBERADA },
      });
    }

    const linhasAtualizadas = await cliente.reservaEstoque.findMany({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
      },
    });

    let pendenciaInventarioId: string | null = null;
    if (divergencias.length > 0) {
      const pendencia = await cliente.pendenciaOs.create({
        data: {
          id: randomUUID(),
          ordemServicoId: input.ordemServicoId,
          rodada: input.rodada,
          tipo: 'INVENTARIO',
          detalhes: { divergencias } as object,
        },
      });
      pendenciaInventarioId = pendencia.id;
    }

    return {
      linhasAtualizadas: linhasAtualizadas.map((raw) =>
        PrismaReservaEstoqueMapper.toLinha(raw),
      ),
      divergencias,
      pendenciaInventarioId,
    };
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

  async ajustarFisicoAdministrativo(
    contexto: ContextoTransacao,
    input: {
      pendenciaId: string;
      pecaId: string;
      quantidadeFisicaNova: number;
      motivo: string;
      responsavelId: string;
    },
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const pendencia = await cliente.pendenciaOs.findUnique({
      where: { id: input.pendenciaId },
    });

    if (!pendencia) {
      throw new PendenciaInventarioNaoEncontradaError(input.pendenciaId);
    }

    if (pendencia.resolvida) {
      throw new PendenciaInventarioJaResolvidaError();
    }

    await this.bloquearPeca(cliente, input.pecaId);
    const peca = await cliente.peca.findUniqueOrThrow({
      where: { id: input.pecaId },
      select: { quantidadeEstoque: true, quantidadeReservada: true },
    });

    if (input.quantidadeFisicaNova < peca.quantidadeReservada) {
      throw new ReservaJaProcessadaError();
    }

    await cliente.peca.update({
      where: { id: input.pecaId },
      data: { quantidadeEstoque: input.quantidadeFisicaNova },
    });

    await cliente.ajusteEstoqueAdministrativo.create({
      data: {
        id: randomUUID(),
        pecaId: input.pecaId,
        ordemServicoId: pendencia.ordemServicoId,
        pendenciaId: pendencia.id,
        quantidadeFisicaAnterior: peca.quantidadeEstoque,
        quantidadeFisicaNova: input.quantidadeFisicaNova,
        motivo: input.motivo,
        responsavelId: input.responsavelId,
      },
    });

    await cliente.pendenciaOs.update({
      where: { id: pendencia.id },
      data: {
        resolvida: true,
        resolvidaEm: new Date(),
        resolvidaPorId: input.responsavelId,
      },
    });
  }

  private async bloquearPeca(
    cliente: ReturnType<typeof obterClienteTransacao>,
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
