import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { MovimentacaoEstoque } from '../../domain/entities/movimentacao-estoque.entity';
import { PecaDaMovimentacaoNaoEncontradaError } from '../../domain/errors/movimentacao-estoque.errors';
import { TipoMovimentacaoEstoque } from '../../domain/tipo-movimentacao-estoque';
import {
  MovimentacaoEstoqueOutput,
  MovimentacaoEstoqueOutputMapper,
} from '../mappers/movimentacao-estoque-output.mapper';
import { MovimentacaoEstoqueGateway } from '../ports/movimentacao-estoque.gateway';

export interface RegistrarMovimentacaoInput {
  pecaId: string;
  tipo: TipoMovimentacaoEstoque;
  quantidade: number;
  ordemServicoId?: string;
  observacao?: string;
}

export class RegistrarMovimentacaoUseCase {
  constructor(
    private readonly movimentacoes: MovimentacaoEstoqueGateway,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    input: RegistrarMovimentacaoInput,
  ): Promise<MovimentacaoEstoqueOutput> {
    const movimentacao = new MovimentacaoEstoque(input);

    const saldos = await this.movimentacoes.buscarSaldosDaPeca(
      movimentacao.pecaId,
    );
    if (saldos === null) {
      throw new PecaDaMovimentacaoNaoEncontradaError(movimentacao.pecaId);
    }

    return this.unitOfWork.executar(async (contexto) => {
      movimentacao.saldoFisicoApos(
        saldos.quantidadeFisica,
        saldos.quantidadeDisponivel,
      );

      return MovimentacaoEstoqueOutputMapper.toOutput(
        await this.movimentacoes.registrar(contexto, movimentacao),
      );
    });
  }
}
