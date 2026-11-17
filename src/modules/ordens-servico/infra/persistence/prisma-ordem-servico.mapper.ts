import {
  StatusOS as StatusPrisma,
  TipoSugestaoItemOs as TipoSugestaoPrisma,
} from '@/shared/generated/prisma/enums';
import {
  ItemPecaOrdem,
  ItemServicoOrdem,
} from '../../domain/entities/item-ordem';
import {
  OrdemServico,
  SugestaoItemOrdem,
} from '../../domain/entities/ordem-servico.entity';
import { StatusOS } from '../../domain/status-os';

export interface ItemServicoPrisma {
  id: string;
  servicoId: string;
  quantidade: number;
  precoUnitario: unknown;
}

export interface ItemPecaPrisma {
  id: string;
  pecaId: string;
  quantidade: number;
  precoUnitario: unknown;
}

export interface SugestaoItemPrisma {
  id: string;
  tipo: TipoSugestaoPrisma;
  itemId: string;
  quantidade: number;
}

export interface OrdemServicoPrisma {
  id: string;
  numero: number;
  status: StatusPrisma;
  rodadaVigente: number;
  prioridadeFila: number;
  correlationId: string;
  clienteId: string;
  veiculoId: string;
  descricaoProblema: string | null;
  diagnostico: string | null;
  diagnosticoConcluidoEm: Date | null;
  etapaOrigemCancelamento: StatusPrisma | null;
  motivoEncerramento: string | null;
  veiculoLiberadoRetirada: boolean;
  devolvidaEm: Date | null;
  prazoReferenciaReserva: Date | null;
  iniciadaEm: Date | null;
  finalizadaEm: Date | null;
  entregueEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  servicos?: ItemServicoPrisma[];
  pecas?: ItemPecaPrisma[];
  sugestoesItens?: SugestaoItemPrisma[];
}

export class PrismaOrdemServicoMapper {
  static toDomain(raw: OrdemServicoPrisma): OrdemServico {
    return new OrdemServico({
      id: raw.id,
      numero: raw.numero,
      status: raw.status as unknown as StatusOS,
      rodadaVigente: raw.rodadaVigente,
      prioridadeFila: raw.prioridadeFila,
      correlationId: raw.correlationId,
      clienteId: raw.clienteId,
      veiculoId: raw.veiculoId,
      descricaoProblema: raw.descricaoProblema,
      diagnostico: raw.diagnostico,
      diagnosticoConcluidoEm: raw.diagnosticoConcluidoEm,
      etapaOrigemCancelamento:
        (raw.etapaOrigemCancelamento as unknown as StatusOS) ?? null,
      motivoEncerramento: raw.motivoEncerramento,
      veiculoLiberadoRetirada: raw.veiculoLiberadoRetirada,
      devolvidaEm: raw.devolvidaEm,
      prazoReferenciaReserva: raw.prazoReferenciaReserva,
      servicos: (raw.servicos ?? []).map(
        (item) =>
          new ItemServicoOrdem({
            id: item.id,
            servicoId: item.servicoId,
            quantidade: item.quantidade,
            precoUnitario: Number(item.precoUnitario),
          }),
      ),
      pecas: (raw.pecas ?? []).map(
        (item) =>
          new ItemPecaOrdem({
            id: item.id,
            pecaId: item.pecaId,
            quantidade: item.quantidade,
            precoUnitario: Number(item.precoUnitario),
          }),
      ),
      sugestoes: (raw.sugestoesItens ?? []).map((item) =>
        PrismaOrdemServicoMapper.sugestaoToDomain(item),
      ),
      iniciadaEm: raw.iniciadaEm,
      finalizadaEm: raw.finalizadaEm,
      entregueEm: raw.entregueEm,
      criadoEm: raw.criadoEm,
      atualizadoEm: raw.atualizadoEm,
    });
  }

  static sugestaoToDomain(raw: SugestaoItemPrisma): SugestaoItemOrdem {
    return {
      tipo: raw.tipo === TipoSugestaoPrisma.PECA ? 'PECA' : 'SERVICO',
      itemId: raw.itemId,
      quantidade: raw.quantidade,
    };
  }

  static toStatusPrisma(this: void, status: StatusOS): StatusPrisma {
    return status;
  }

  static toTipoSugestaoPrisma(
    tipo: SugestaoItemOrdem['tipo'],
  ): TipoSugestaoPrisma {
    return tipo === 'PECA'
      ? TipoSugestaoPrisma.PECA
      : TipoSugestaoPrisma.SERVICO;
  }
}
