import {
  ItemPecaOrdem,
  ItemServicoOrdem,
} from '@/modules/ordens-servico/domain/entities/item-ordem';
import { OrdemServico } from '@/modules/ordens-servico/domain/entities/ordem-servico.entity';
import type { CatalogoGateway } from '@/modules/ordens-servico/application/ports/catalogo.gateway';
import { ItemInvalidoInternoError } from '../domain/erros-internos';

export interface ItemDiagnosticoInput {
  tipo: 'PECA' | 'SERVICO';
  itemId: string;
  quantidade: number;
}

export interface ItemOficialSaida {
  tipo: 'PECA' | 'SERVICO';
  itemId: string;
  nome: string;
  quantidade: number;
}

export interface ItensDiagnosticoMontados {
  servicos: ItemServicoOrdem[];
  pecas: ItemPecaOrdem[];
  saida: ItemOficialSaida[];
  itensGerarOrcamento: {
    tipo: 'PECA' | 'SERVICO';
    itemId: string;
    nome: string;
    quantidade: number;
    precoUnitarioCentavos: number;
  }[];
}

function precoMantido(
  ordem: OrdemServico,
  tipo: 'PECA' | 'SERVICO',
  itemId: string,
  precoCatalogo: number,
): number {
  if (tipo === 'SERVICO') {
    const atual = ordem.servicos.find((s) => s.servicoId === itemId);
    return atual?.precoUnitario ?? precoCatalogo;
  }
  const atual = ordem.pecas.find((p) => p.pecaId === itemId);
  return atual?.precoUnitario ?? precoCatalogo;
}

function paraCentavos(precoReais: number): number {
  return Math.round(precoReais * 100);
}

export async function montarItensDiagnostico(
  ordem: OrdemServico,
  catalogo: CatalogoGateway,
  itens: ItemDiagnosticoInput[],
): Promise<ItensDiagnosticoMontados> {
  const servicos: ItemServicoOrdem[] = [];
  const pecas: ItemPecaOrdem[] = [];
  const saida: ItemOficialSaida[] = [];
  const itensGerarOrcamento: ItensDiagnosticoMontados['itensGerarOrcamento'] =
    [];

  for (const item of itens) {
    if (item.tipo === 'SERVICO') {
      const cat = await catalogo.buscarServicoParaDiagnostico(item.itemId);
      if (!cat?.ativo) {
        throw new ItemInvalidoInternoError(item.itemId);
      }
      const preco = precoMantido(
        ordem,
        'SERVICO',
        item.itemId,
        cat.precoUnitario,
      );
      servicos.push(
        new ItemServicoOrdem({
          servicoId: item.itemId,
          quantidade: item.quantidade,
          precoUnitario: preco,
        }),
      );
      saida.push({
        tipo: 'SERVICO',
        itemId: item.itemId,
        nome: cat.nome,
        quantidade: item.quantidade,
      });
      itensGerarOrcamento.push({
        tipo: 'SERVICO',
        itemId: item.itemId,
        nome: cat.nome,
        quantidade: item.quantidade,
        precoUnitarioCentavos: paraCentavos(preco),
      });
      continue;
    }

    const cat = await catalogo.buscarPecaParaDiagnostico(item.itemId);
    if (!cat?.ativo) {
      throw new ItemInvalidoInternoError(item.itemId);
    }
    const preco = precoMantido(ordem, 'PECA', item.itemId, cat.precoUnitario);
    pecas.push(
      new ItemPecaOrdem({
        pecaId: item.itemId,
        quantidade: item.quantidade,
        precoUnitario: preco,
      }),
    );
    saida.push({
      tipo: 'PECA',
      itemId: item.itemId,
      nome: cat.nome,
      quantidade: item.quantidade,
    });
    itensGerarOrcamento.push({
      tipo: 'PECA',
      itemId: item.itemId,
      nome: cat.nome,
      quantidade: item.quantidade,
      precoUnitarioCentavos: paraCentavos(preco),
    });
  }

  return { servicos, pecas, saida, itensGerarOrcamento };
}
