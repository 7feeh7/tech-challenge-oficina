import {
  MotivoRejeicaoObrigatorioError,
  ValorOrcamentoInvalidoError,
} from '../errors/orcamento.errors';
import { StatusOrcamento } from '../status-orcamento';

export interface OrcamentoProps {
  id?: string;
  ordemServicoId: string;
  valorTotal: number;
  status?: StatusOrcamento;
  observacoes?: string | null;
  aprovadoEm?: Date | null;
  rejeitadoEm?: Date | null;
  motivoRejeicao?: string | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

/** Limite da coluna Decimal(10,2) do banco. */
const VALOR_MAXIMO = 99_999_999.99;

export class Orcamento {
  readonly id?: string;
  readonly ordemServicoId: string;
  private _valorTotal: number;
  private _status: StatusOrcamento;
  private _observacoes: string | null;
  private _aprovadoEm: Date | null;
  private _rejeitadoEm: Date | null;
  private _motivoRejeicao: string | null;
  readonly criadoEm: Date;

  constructor(props: OrcamentoProps) {
    this.id = props.id;
    this.ordemServicoId = props.ordemServicoId;
    this._valorTotal = Orcamento.validarValor(props.valorTotal);
    this._status = props.status ?? StatusOrcamento.AGUARDANDO_APROVACAO;
    this._observacoes = Orcamento.normalizarTexto(props.observacoes);
    this._aprovadoEm = props.aprovadoEm ?? null;
    this._rejeitadoEm = props.rejeitadoEm ?? null;
    this._motivoRejeicao = Orcamento.normalizarTexto(props.motivoRejeicao);
    this.criadoEm = props.criadoEm ?? new Date();
  }

  get valorTotal() {
    return this._valorTotal;
  }
  get status() {
    return this._status;
  }
  get observacoes() {
    return this._observacoes;
  }
  get aprovadoEm() {
    return this._aprovadoEm;
  }
  get rejeitadoEm() {
    return this._rejeitadoEm;
  }
  get motivoRejeicao() {
    return this._motivoRejeicao;
  }

  estaAprovado(): boolean {
    return this._status === StatusOrcamento.APROVADO;
  }

  alterarValorTotal(valorTotal: number): void {
    this._valorTotal = Orcamento.validarValor(valorTotal);
  }

  alterarObservacoes(observacoes?: string | null): void {
    this._observacoes = Orcamento.normalizarTexto(observacoes);
  }

  aprovar(agora: Date = new Date()): void {
    this._status = StatusOrcamento.APROVADO;
    this._aprovadoEm = this._aprovadoEm ?? agora;
  }

  rejeitar(motivo?: string | null, agora: Date = new Date()): void {
    const motivoNormalizado = Orcamento.normalizarTexto(motivo);
    if (!motivoNormalizado) {
      throw new MotivoRejeicaoObrigatorioError();
    }

    this._status = StatusOrcamento.REJEITADO;
    this._motivoRejeicao = motivoNormalizado;
    this._rejeitadoEm = this._rejeitadoEm ?? agora;
  }

  private static validarValor(valorTotal: number): number {
    if (
      !Number.isFinite(valorTotal) ||
      valorTotal <= 0 ||
      valorTotal > VALOR_MAXIMO
    ) {
      throw new ValorOrcamentoInvalidoError();
    }
    return valorTotal;
  }

  private static normalizarTexto(texto?: string | null): string | null {
    const normalizado = texto?.trim();
    return normalizado ? normalizado : null;
  }
}
