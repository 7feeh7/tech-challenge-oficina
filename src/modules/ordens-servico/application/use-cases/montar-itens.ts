import {
  ItemPecaOrdem,
  ItemServicoOrdem,
} from '../../domain/entities/item-ordem';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import {
  PecaDaOrdemNaoEncontradaError,
  ServicoDaOrdemNaoEncontradoError,
} from '../../domain/errors/ordem-servico.errors';
import { CatalogoGateway } from '../ports/catalogo.gateway';

export interface ItemServicoInput {
  servicoId: string;
  quantidade?: number;
}

export interface ItemPecaInput {
  pecaId: string;
  quantidade: number;
}

/**
 * Resolve o preço vigente de cada item no catálogo e o congela na OS.
 * Compartilhado por criar e atualizar, que lançam itens do mesmo jeito.
 */
export async function adicionarItensNaOrdem(
  ordem: OrdemServico,
  catalogo: CatalogoGateway,
  servicos: ItemServicoInput[] = [],
  pecas: ItemPecaInput[] = [],
): Promise<void> {
  for (const item of servicos) {
    const precoUnitario = await catalogo.buscarPrecoDoServico(item.servicoId);
    if (precoUnitario === null) {
      throw new ServicoDaOrdemNaoEncontradoError(item.servicoId);
    }

    ordem.adicionarServico(
      new ItemServicoOrdem({
        servicoId: item.servicoId,
        quantidade: item.quantidade ?? 1,
        precoUnitario,
      }),
    );
  }

  for (const item of pecas) {
    const precoUnitario = await catalogo.buscarPrecoDaPeca(item.pecaId);
    if (precoUnitario === null) {
      throw new PecaDaOrdemNaoEncontradaError(item.pecaId);
    }

    ordem.adicionarPeca(
      new ItemPecaOrdem({
        pecaId: item.pecaId,
        quantidade: item.quantidade,
        precoUnitario,
      }),
    );
  }
}
