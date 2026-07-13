import {
  DescricaoServicoInvalidaError,
  NomeServicoInvalidoError,
  PrecoServicoInvalidoError,
  TempoEstimadoServicoInvalidoError,
} from '../errors/servico.errors';

export interface ServicoProps {
  id?: string;
  nome: string;
  descricao?: string | null;
  precoBase: number;
  tempoEstimadoMin: number;
  ativo?: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

/** Limite da coluna Decimal(10,2) do banco. */
const PRECO_MAXIMO = 99_999_999.99;
const DESCRICAO_MAX = 500;

export class Servico {
  readonly id?: string;
  private _nome: string;
  private _descricao: string | null;
  private _precoBase: number;
  private _tempoEstimadoMin: number;
  private _ativo: boolean;
  readonly criadoEm: Date;
  private _atualizadoEm: Date;

  constructor(props: ServicoProps) {
    this.id = props.id;
    this._nome = Servico.normalizarNome(props.nome);
    this._descricao = Servico.normalizarDescricao(props.descricao);
    this._precoBase = Servico.validarPreco(props.precoBase);
    this._tempoEstimadoMin = Servico.validarTempoEstimado(
      props.tempoEstimadoMin,
    );
    this._ativo = props.ativo ?? true;
    this.criadoEm = props.criadoEm ?? new Date();
    this._atualizadoEm = props.atualizadoEm ?? new Date();
  }

  get nome() {
    return this._nome;
  }
  get descricao() {
    return this._descricao;
  }
  get precoBase() {
    return this._precoBase;
  }
  get tempoEstimadoMin() {
    return this._tempoEstimadoMin;
  }
  get ativo() {
    return this._ativo;
  }
  get atualizadoEm() {
    return this._atualizadoEm;
  }

  alterarNome(nome: string): void {
    this._nome = Servico.normalizarNome(nome);
    this.marcarComoAtualizado();
  }

  alterarDescricao(descricao?: string | null): void {
    this._descricao = Servico.normalizarDescricao(descricao);
    this.marcarComoAtualizado();
  }

  alterarPrecoBase(precoBase: number): void {
    this._precoBase = Servico.validarPreco(precoBase);
    this.marcarComoAtualizado();
  }

  alterarTempoEstimado(tempoEstimadoMin: number): void {
    this._tempoEstimadoMin = Servico.validarTempoEstimado(tempoEstimadoMin);
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

  static normalizarNome(nome: string): string {
    const normalizado = nome?.trim().replace(/\s+/g, ' ');
    if (!normalizado || normalizado.length < 3 || normalizado.length > 100) {
      throw new NomeServicoInvalidoError();
    }
    return normalizado;
  }

  /** Descrição em branco é guardada como ausente, e não como string vazia. */
  static normalizarDescricao(descricao?: string | null): string | null {
    const normalizada = descricao?.trim();
    if (!normalizada) return null;
    if (normalizada.length > DESCRICAO_MAX) {
      throw new DescricaoServicoInvalidaError();
    }
    return normalizada;
  }

  private static validarPreco(precoBase: number): number {
    if (
      !Number.isFinite(precoBase) ||
      precoBase <= 0 ||
      precoBase > PRECO_MAXIMO
    ) {
      throw new PrecoServicoInvalidoError();
    }
    return precoBase;
  }

  private static validarTempoEstimado(tempoEstimadoMin: number): number {
    if (!Number.isInteger(tempoEstimadoMin) || tempoEstimadoMin < 1) {
      throw new TempoEstimadoServicoInvalidoError();
    }
    return tempoEstimadoMin;
  }
}
