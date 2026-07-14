import { StatusOS as StatusPrisma } from '@/generated/prisma/enums';
import {
  ItemPecaOrdem,
  ItemServicoOrdem,
} from '../../domain/entities/item-ordem';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
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

export interface OrdemServicoPrisma {
  id: string;
  numero: number;
  status: StatusPrisma;
  clienteId: string;
  veiculoId: string;
  descricaoProblema: string | null;
  diagnostico: string | null;
  iniciadaEm: Date | null;
  finalizadaEm: Date | null;
  entregueEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  servicos?: ItemServicoPrisma[];
  pecas?: ItemPecaPrisma[];
}

export class PrismaOrdemServicoMapper {
  static toDomain(raw: OrdemServicoPrisma): OrdemServico {
    return new OrdemServico({
      id: raw.id,
      numero: raw.numero,
      status: raw.status as unknown as StatusOS,
      clienteId: raw.clienteId,
      veiculoId: raw.veiculoId,
      descricaoProblema: raw.descricaoProblema,
      diagnostico: raw.diagnostico,
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
      iniciadaEm: raw.iniciadaEm,
      finalizadaEm: raw.finalizadaEm,
      entregueEm: raw.entregueEm,
      criadoEm: raw.criadoEm,
      atualizadoEm: raw.atualizadoEm,
    });
  }

  static toStatusPrisma(this: void, status: StatusOS): StatusPrisma {
    return status;
  }
}
