import {
  CodigoPecaInvalidoError,
  DescricaoPecaInvalidaError,
  EstoqueMinimoInvalidoError,
  NomePecaInvalidoError,
  PrecoPecaInvalidoError,
  QuantidadeEstoqueInvalidaError,
} from '../errors/peca.errors';

export interface PecaProps {
  id?: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  precoUnitario: number;
  quantidadeEstoque?: number;
  estoqueMinimo?: number;
  ativo?: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

/** Limite da coluna Decimal(10,2) do banco. */
const PRECO_MAXIMO = 99_999_999.99;
const DESCRICAO_MAX = 500;

export class Peca {
  readonly id?: string;
  private _codigo: string;
  private _nome: string;
  private _descricao: string | null;
  private _precoUnitario: number;
  private _quantidadeEstoque: number;
  private _estoqueMinimo: number;
  private _ativo: boolean;
  readonly criadoEm: Date;
  private _atualizadoEm: Date;

  constructor(props: PecaProps) {
    this.id = props.id;
    this._codigo = Peca.normalizarCodigo(props.codigo);
    this._nome = Peca.normalizarNome(props.nome);
    this._descricao = Peca.normalizarDescricao(props.descricao);
    this._precoUnitario = Peca.validarPreco(props.precoUnitario);
    this._quantidadeEstoque = Peca.validarQuantidadeEstoque(
      props.quantidadeEstoque ?? 0,
    );
    this._estoqueMinimo = Peca.validarEstoqueMinimo(props.estoqueMinimo ?? 0);
    this._ativo = props.ativo ?? true;
    this.criadoEm = props.criadoEm ?? new Date();
    this._atualizadoEm = props.atualizadoEm ?? new Date();
  }

  get codigo() {
    return this._codigo;
  }
  get nome() {
    return this._nome;
  }
  get descricao() {
    return this._descricao;
  }
  get precoUnitario() {
    return this._precoUnitario;
  }
  get quantidadeEstoque() {
    return this._quantidadeEstoque;
  }
  get estoqueMinimo() {
    return this._estoqueMinimo;
  }
  get ativo() {
    return this._ativo;
  }
  get atualizadoEm() {
    return this._atualizadoEm;
  }

  /** Sinaliza a necessidade de reposição. */
  estoqueAbaixoDoMinimo(): boolean {
    return this._quantidadeEstoque < this._estoqueMinimo;
  }

  alterarCodigo(codigo: string): void {
    this._codigo = Peca.normalizarCodigo(codigo);
    this.marcarComoAtualizado();
  }

  alterarNome(nome: string): void {
    this._nome = Peca.normalizarNome(nome);
    this.marcarComoAtualizado();
  }

  alterarDescricao(descricao?: string | null): void {
    this._descricao = Peca.normalizarDescricao(descricao);
    this.marcarComoAtualizado();
  }

  alterarPrecoUnitario(precoUnitario: number): void {
    this._precoUnitario = Peca.validarPreco(precoUnitario);
    this.marcarComoAtualizado();
  }

  alterarQuantidadeEstoque(quantidadeEstoque: number): void {
    this._quantidadeEstoque = Peca.validarQuantidadeEstoque(quantidadeEstoque);
    this.marcarComoAtualizado();
  }

  alterarEstoqueMinimo(estoqueMinimo: number): void {
    this._estoqueMinimo = Peca.validarEstoqueMinimo(estoqueMinimo);
    this.marcarComoAtualizado();
  }

  ativar(): void {
    this._ativo = true;
    this.marcarComoAtualizado();
  }

  desativar(): void {
    this._ativo = false;
    this.marcarComoAtualizado();
  }

  private marcarComoAtualizado(): void {
    this._atualizadoEm = new Date();
  }

  /** O código é guardado em caixa alta, para que a unicidade não dependa da digitação. */
  static normalizarCodigo(codigo: string): string {
    const normalizado = codigo?.trim().toUpperCase();
    if (!normalizado || normalizado.length < 2 || normalizado.length > 30) {
      throw new CodigoPecaInvalidoError();
    }
    return normalizado;
  }

  static normalizarNome(nome: string): string {
    const normalizado = nome?.trim().replace(/\s+/g, ' ');
    if (!normalizado || normalizado.length < 3 || normalizado.length > 100) {
      throw new NomePecaInvalidoError();
    }
    return normalizado;
  }

  /** Descrição em branco é guardada como ausente, e não como string vazia. */
  static normalizarDescricao(descricao?: string | null): string | null {
    const normalizada = descricao?.trim();
    if (!normalizada) return null;
    if (normalizada.length > DESCRICAO_MAX) {
      throw new DescricaoPecaInvalidaError();
    }
    return normalizada;
  }

  private static validarPreco(precoUnitario: number): number {
    if (
      !Number.isFinite(precoUnitario) ||
      precoUnitario <= 0 ||
      precoUnitario > PRECO_MAXIMO
    ) {
      throw new PrecoPecaInvalidoError();
    }
    return precoUnitario;
  }

  private static validarQuantidadeEstoque(quantidadeEstoque: number): number {
    if (!Number.isInteger(quantidadeEstoque) || quantidadeEstoque < 0) {
      throw new QuantidadeEstoqueInvalidaError();
    }
    return quantidadeEstoque;
  }

  private static validarEstoqueMinimo(estoqueMinimo: number): number {
    if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
      throw new EstoqueMinimoInvalidoError();
    }
    return estoqueMinimo;
  }
}
