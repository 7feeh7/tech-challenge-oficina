import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { Peca } from '../../domain/entities/peca.entity';
import type { AtualizarPecaInput } from '../use-cases/atualizar-peca.use-case';

export interface PaginaPecas {
  pecas: Peca[];
  total: number;
}

export interface PecaGateway {
  buscarPorId(id: string): Promise<Peca | null>;
  existeComCodigo(codigo: string): Promise<boolean>;
  codigoPertenceAOutraPeca(id: string, codigo: string): Promise<boolean>;
  listar(page: number, limit: number, search?: string): Promise<PaginaPecas>;
  criar(peca: Peca): Promise<Peca>;
  atualizar(id: string, peca: Peca): Promise<Peca>;
  atualizarNoContexto(
    contexto: ContextoTransacao,
    id: string,
    peca: Peca,
    input: AtualizarPecaInput,
  ): Promise<Peca>;
  remover(id: string): Promise<void>;
}
