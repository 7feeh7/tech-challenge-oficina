import { Servico } from '../../domain/entities/servico.entity';

export interface PaginaServicos {
  servicos: Servico[];
  total: number;
}

export interface ServicoGateway {
  buscarPorId(id: string): Promise<Servico | null>;
  existeComNome(nome: string): Promise<boolean>;
  nomePertenceAOutroServico(id: string, nome: string): Promise<boolean>;
  listar(page: number, limit: number, search?: string): Promise<PaginaServicos>;
  criar(servico: Servico): Promise<Servico>;
  atualizar(id: string, servico: Servico): Promise<Servico>;
  remover(id: string): Promise<void>;
}
