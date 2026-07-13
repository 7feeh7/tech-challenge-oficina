import { Servico } from '../../domain/entities/servico.entity';

/** `precoBase` chega como Decimal do Prisma; o domínio trabalha com number. */
export interface ServicoPrisma {
  id: string;
  nome: string;
  descricao: string | null;
  precoBase: unknown;
  tempoEstimadoMin: number;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class PrismaServicoMapper {
  static toDomain(raw: ServicoPrisma): Servico {
    return new Servico({ ...raw, precoBase: Number(raw.precoBase) });
  }

  static toPersistence(servico: Servico) {
    return {
      nome: servico.nome,
      descricao: servico.descricao,
      precoBase: servico.precoBase,
      tempoEstimadoMin: servico.tempoEstimadoMin,
      ativo: servico.ativo,
    };
  }
}
