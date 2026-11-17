import { randomUUID } from 'crypto';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import { ConsumirReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import type {
  ContextoConsumoEstoque,
  ReservaEstoqueGateway,
} from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { ConsumoAplicadoIncompativelError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ReservaJaProcessadaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import type { RespostaCancelamentoContrato } from '../../domain/resposta-cancelamento-contrato';
import {
  conteudosConsumoSemanticamenteEquivalentes,
  deContextoConsumo,
  type ConteudoConsumoComparavel,
} from '../../domain/comparar-consumo-semantico';
import {
  montarContextoConsumoDaResposta,
  respostaAuditoriaInsuficiente,
  respostaExigeReconciliacaoConsumo,
} from '../../domain/montar-contexto-consumo-resposta';
import {
  avaliarCompatibilidadeFatoTardio,
  UUID_RE_PECA_ID,
} from '../../domain/compatibilidade-fato-tardio';
import { validarRespostaCancelamento } from '../../domain/validar-resposta-cancelamento';

export const NATUREZA_PENDENCIA_INFORMACAO_INSUFICIENTE =
  'INFORMACAO_INSUFICIENTE';
export const NATUREZA_PENDENCIA_CONFLITO_CONSUMO = 'CONFLITO_CONSUMO';

export type ResultadoReconciliacaoConsumo =
  | 'nada'
  | 'aplicado'
  | 'reutilizado'
  | 'pendencia_informacao'
  | 'pendencia_conflito'
  | 'impedimento_inventario';

export class ReconciliacaoConsumoSagaService {
  constructor(
    private readonly consumir: ConsumirReservaEstoqueUseCase,
    private readonly reservas: ReservaEstoqueGateway,
    private readonly prisma: PrismaService,
  ) {}

  validarPayloadRespostaCancelamento(
    bruto: unknown,
  ): RespostaCancelamentoContrato {
    return validarRespostaCancelamento(bruto);
  }

  async consumoConciliadoNaRodada(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const resolucao = await cliente.resolucaoConsumoManual.findUnique({
      where: { ordemServicoId_rodada: { ordemServicoId, rodada } },
    });
    if (resolucao) {
      return true;
    }
    const consumo = await cliente.consumoAplicadoOs.findUnique({
      where: { ordemServicoId_rodada: { ordemServicoId, rodada } },
    });
    if (!consumo) {
      return false;
    }
    if (consumo.situacaoReconciliacao === 'APLICADO') {
      return true;
    }
    if (consumo.situacaoReconciliacao === 'DIVERGENCIA_RESOLVIDA') {
      return true;
    }
    const pendenciasBloqueantes = await cliente.pendenciaOs.count({
      where: {
        ordemServicoId,
        rodada,
        resolvida: false,
        tipo: TipoPendenciaOs.INVENTARIO,
      },
    });
    if (
      consumo.situacaoReconciliacao === 'DIVERGENCIA_PENDENTE' &&
      pendenciasBloqueantes === 0
    ) {
      return true;
    }
    return false;
  }

  async reconciliarRespostaCancelamento(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    envelopeEventId: string,
    bruto: unknown,
  ): Promise<ResultadoReconciliacaoConsumo> {
    const payload = validarRespostaCancelamento(bruto);
    if (!respostaExigeReconciliacaoConsumo(payload)) {
      return 'nada';
    }
    if (respostaAuditoriaInsuficiente(payload)) {
      await this.abrirPendenciaInformacaoInsuficiente(
        contexto,
        ordemServicoId,
        rodada,
        { origem: 'RESPOSTA_CANCELAMENTO', envelopeEventId, conteudo: payload },
      );
      return 'pendencia_informacao';
    }
    const contextoFato = montarContextoConsumoDaResposta(payload);
    if (!contextoFato) {
      await this.abrirPendenciaInformacaoInsuficiente(
        contexto,
        ordemServicoId,
        rodada,
        { origem: 'RESPOSTA_CANCELAMENTO', envelopeEventId, conteudo: payload },
      );
      return 'pendencia_informacao';
    }
    return this.aplicarOuConvergir(
      contexto,
      ordemServicoId,
      rodada,
      contextoFato,
      payload.pecasUtilizadas ?? [],
      payload.divergencias?.map((d) => ({
        itemId: d.itemId,
        tipo: d.tipo,
        quantidadePrevista: d.quantidadePrevista,
        quantidadeUtilizada: d.quantidadeUtilizada,
        justificativa: d.justificativa,
      })) ?? [],
      payload.motivo,
      `estoque.consumir:resposta:${envelopeEventId}`,
    );
  }

  async reconciliarFatoTerminal(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    contextoFato: ContextoConsumoEstoque,
    pecas: { itemId: string; quantidade: number }[],
    divergencias: ConteudoConsumoComparavel['divergencias'],
    motivo: string | null | undefined,
    idempotencyKey: string,
  ): Promise<ResultadoReconciliacaoConsumo> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const resolucao = await cliente.resolucaoConsumoManual.findUnique({
      where: { ordemServicoId_rodada: { ordemServicoId, rodada } },
    });
    if (resolucao) {
      return this.tratarFatoTardioAposResolucaoManual(
        contexto,
        ordemServicoId,
        rodada,
        resolucao.id,
        contextoFato,
        pecas,
        divergencias,
        motivo,
      );
    }
    return this.aplicarOuConvergir(
      contexto,
      ordemServicoId,
      rodada,
      contextoFato,
      pecas,
      divergencias,
      motivo,
      idempotencyKey,
    );
  }

  private async aplicarOuConvergir(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    contextoFato: ContextoConsumoEstoque,
    pecas: { itemId: string; quantidade: number }[],
    divergencias: ConteudoConsumoComparavel['divergencias'],
    motivo: string | null | undefined,
    idempotencyKey: string,
  ): Promise<ResultadoReconciliacaoConsumo> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const resolucao = await cliente.resolucaoConsumoManual.findUnique({
      where: { ordemServicoId_rodada: { ordemServicoId, rodada } },
    });
    if (resolucao) {
      return 'reutilizado';
    }

    const existente = await cliente.consumoAplicadoOs.findUnique({
      where: { ordemServicoId_rodada: { ordemServicoId, rodada } },
    });
    const candidato = deContextoConsumo(
      contextoFato,
      pecas,
      divergencias,
      motivo,
    );

    if (existente) {
      const gravado: ConteudoConsumoComparavel = {
        eventId: existente.eventId,
        tipoFato: existente.tipoFato,
        fatoOcorridoEm: existente.fatoOcorridoEm,
        concluidoEm: existente.concluidoEm,
        responsavelId: existente.responsavelId,
        motivo: null,
        pecasUtilizadas:
          (existente.consumoEfetivo as {
            itemId: string;
            quantidade: number;
          }[]) ?? [],
        divergencias:
          (existente.divergencias as ConteudoConsumoComparavel['divergencias']) ??
          [],
      };
      if (conteudosConsumoSemanticamenteEquivalentes(gravado, candidato)) {
        return 'reutilizado';
      }
      await this.abrirPendenciaConflitoConsumo(
        contexto,
        ordemServicoId,
        rodada,
        {
          registroExistente: gravado,
          conteudoRecebido: candidato,
        },
      );
      return 'pendencia_conflito';
    }

    try {
      const consumo = await this.consumir.execute(
        {
          ordemServicoId,
          rodada,
          itensUtilizados: pecas.map((p) => ({
            pecaId: p.itemId,
            quantidade: p.quantidade,
          })),
          idempotencyKey,
          contextoFato,
        },
        contexto,
      );
      if (consumo.impedimentoInventario) {
        return 'impedimento_inventario';
      }
      return consumo.reutilizado ? 'reutilizado' : 'aplicado';
    } catch (erro) {
      if (erro instanceof ConsumoAplicadoIncompativelError) {
        await this.abrirPendenciaConflitoConsumo(
          contexto,
          ordemServicoId,
          rodada,
          {
            conteudoRecebido: candidato,
          },
        );
        return 'pendencia_conflito';
      }
      if (erro instanceof ReservaJaProcessadaError) {
        const reaplicado = await this.reservas.possuiConsumoAplicadoNaRodada(
          contexto,
          ordemServicoId,
          rodada,
        );
        if (reaplicado) {
          return 'reutilizado';
        }
      }
      throw erro;
    }
  }

  async resolverPendenciaInformacaoInsuficienteSeCausaEliminada(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const pendencias = await cliente.pendenciaOs.findMany({
      where: {
        ordemServicoId,
        rodada,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    const alvo = pendencias.find((p) => {
      const det = p.detalhes as Record<string, unknown>;
      return det.natureza === NATUREZA_PENDENCIA_INFORMACAO_INSUFICIENTE;
    });
    if (!alvo) {
      return;
    }
    const conciliado = await this.consumoConciliadoNaRodada(
      contexto,
      ordemServicoId,
      rodada,
    );
    if (!conciliado) {
      return;
    }
    await cliente.pendenciaOs.update({
      where: { id: alvo.id },
      data: { resolvida: true, resolvidaEm: new Date() },
    });
  }

  private async tratarFatoTardioAposResolucaoManual(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    resolucaoId: string,
    contextoFato: ContextoConsumoEstoque,
    pecas: { itemId: string; quantidade: number }[],
    _divergencias: ConteudoConsumoComparavel['divergencias'],
    motivo: string | null | undefined,
  ): Promise<ResultadoReconciliacaoConsumo> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const resolucao = await cliente.resolucaoConsumoManual.findUniqueOrThrow({
      where: { id: resolucaoId },
    });
    if (resolucao.fatoTardioEventId) {
      if (resolucao.fatoTardioEventId === contextoFato.eventId) {
        return 'reutilizado';
      }
      await this.abrirPendenciaConflitoConsumo(
        contexto,
        ordemServicoId,
        rodada,
        {
          resolucaoManualId: resolucao.id,
          conteudoRecebido: deContextoConsumo(
            contextoFato,
            pecas,
            _divergencias,
            motivo,
          ),
        },
      );
      return 'pendencia_conflito';
    }

    const reservas = await cliente.reservaEstoque.findMany({
      where: { ordemServicoId, rodada },
      select: { pecaId: true, quantidade: true },
    });
    const pecaIds = [...new Set(pecas.map((p) => p.itemId))];
    const pecaIdsConsulta = pecaIds.filter((id) => UUID_RE_PECA_ID.test(id));
    const catalogo = new Set(
      pecaIdsConsulta.length === 0
        ? []
        : (
            await cliente.peca.findMany({
              where: { id: { in: pecaIdsConsulta } },
              select: { id: true },
            })
          ).map((p) => p.id),
    );
    const compat = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: reservas.map((r) => ({
        pecaId: r.pecaId,
        quantidade: r.quantidade,
      })),
      itensConsumidosResolucao:
        (resolucao.itensConsumidos as {
          itemId: string;
          quantidade: number;
        }[]) ?? [],
      pecasUtilizadasFato: pecas,
      pecasCatalogoValidas: (id) => catalogo.has(id),
    });

    if (!compat.compativel) {
      await this.abrirPendenciaConflitoConsumo(
        contexto,
        ordemServicoId,
        rodada,
        {
          resolucaoManualId: resolucao.id,
          conteudoRecebido: deContextoConsumo(
            contextoFato,
            pecas,
            _divergencias,
            motivo,
          ),
          motivoIncompatibilidade: compat.motivo,
        },
      );
      return 'pendencia_conflito';
    }

    await cliente.resolucaoConsumoManual.update({
      where: { id: resolucao.id },
      data: {
        fatoTardioEventId: contextoFato.eventId,
        fatoTardioRecebidoEm: new Date(),
        fatoTardioConteudo: {
          tipoFato: contextoFato.tipoFato,
          fatoOcorridoEm: contextoFato.fatoOcorridoEm.toISOString(),
          concluidoEm: contextoFato.concluidoEm?.toISOString() ?? null,
          responsavelId: contextoFato.responsavelId,
          motivo: motivo ?? null,
          pecasUtilizadas: pecas,
        },
      },
    });
    return 'reutilizado';
  }

  private async abrirPendenciaInformacaoInsuficiente(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    detalhes: Record<string, unknown>,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const duplicada = await cliente.pendenciaOs.findFirst({
      where: {
        ordemServicoId,
        rodada,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    if (duplicada) {
      const det = duplicada.detalhes as Record<string, unknown>;
      if (det.natureza === NATUREZA_PENDENCIA_INFORMACAO_INSUFICIENTE) {
        return;
      }
    }
    await cliente.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId,
        rodada,
        tipo: TipoPendenciaOs.INVENTARIO,
        detalhes: {
          natureza: NATUREZA_PENDENCIA_INFORMACAO_INSUFICIENTE,
          ...detalhes,
        },
      },
    });
  }

  private async abrirPendenciaConflitoConsumo(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    detalhes: Record<string, unknown>,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const duplicada = await cliente.pendenciaOs.findFirst({
      where: {
        ordemServicoId,
        rodada,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    if (duplicada) {
      const det = duplicada.detalhes as Record<string, unknown>;
      if (det.natureza === NATUREZA_PENDENCIA_CONFLITO_CONSUMO) {
        return;
      }
    }
    await cliente.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId,
        rodada,
        tipo: TipoPendenciaOs.INVENTARIO,
        detalhes: {
          natureza: NATUREZA_PENDENCIA_CONFLITO_CONSUMO,
          ...detalhes,
        },
      },
    });
  }
}
