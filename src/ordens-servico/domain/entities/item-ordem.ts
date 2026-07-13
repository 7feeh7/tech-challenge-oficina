import {
  PrecoItemInvalidoError,
  QuantidadeItemInvalidaError,
} from '../errors/ordem-servico.errors';

/**
 * Item da OS. O `precoUnitario` é um *snapshot*: o preço vigente no catálogo
 * quando o item entrou na ordem. Reajustes posteriores não alteram OS abertas.
 */
abstract class ItemOrdem {
  readonly id?: string;
  readonly quantidade: number;
  readonly precoUnitario: number;

  protected constructor(
    quantidade: number,
    precoUnitario: number,
    id?: string,
  ) {
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      throw new QuantidadeItemInvalidaError();
    }
    if (!Number.isFinite(precoUnitario) || precoUnitario <= 0) {
      throw new PrecoItemInvalidoError();
    }

    this.id = id;
    this.quantidade = quantidade;
    this.precoUnitario = precoUnitario;
  }

  subtotal(): number {
    return this.quantidade * this.precoUnitario;
  }
}

export class ItemServicoOrdem extends ItemOrdem {
  readonly servicoId: string;

  constructor(props: {
    id?: string;
    servicoId: string;
    quantidade: number;
    precoUnitario: number;
  }) {
    super(props.quantidade, props.precoUnitario, props.id);
    this.servicoId = props.servicoId;
  }
}

export class ItemPecaOrdem extends ItemOrdem {
  readonly pecaId: string;

  constructor(props: {
    id?: string;
    pecaId: string;
    quantidade: number;
    precoUnitario: number;
  }) {
    super(props.quantidade, props.precoUnitario, props.id);
    this.pecaId = props.pecaId;
  }
}
