import { Servico } from '../../domain/entities/servico.entity';

export interface ServicoOutput {
  id?: string;
  nome: string;
  descricao: string | null;
  precoBase: number;
  tempoEstimadoMin: number;
  ativo: boolean;
}

export class ServicoOutputMapper {
  static toOutput(this: void, servico: Servico): ServicoOutput {
    return {
      id: servico.id,
      nome: servico.nome,
      descricao: servico.descricao,
      precoBase: servico.precoBase,
      tempoEstimadoMin: servico.tempoEstimadoMin,
      ativo: servico.ativo,
    };
  }
}
