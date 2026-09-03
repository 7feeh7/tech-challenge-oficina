import { Servico } from '../../domain/entities/servico.entity';
import { NomeServicoJaExisteError } from '../../domain/errors/servico.errors';
import {
  ServicoOutput,
  ServicoOutputMapper,
} from '../mappers/servico-output.mapper';
import { ServicoGateway } from '../ports/servico.gateway';

export interface CriarServicoInput {
  nome: string;
  descricao?: string;
  precoBase: number;
  tempoEstimadoMin: number;
  ativo?: boolean;
}

export class CriarServicoUseCase {
  constructor(private readonly servicos: ServicoGateway) {}

  async execute(input: CriarServicoInput): Promise<ServicoOutput> {
    const servico = new Servico(input);

    if (await this.servicos.existeComNome(servico.nome)) {
      throw new NomeServicoJaExisteError();
    }

    return ServicoOutputMapper.toOutput(await this.servicos.criar(servico));
  }
}
