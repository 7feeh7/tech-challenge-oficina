import { TransicaoStatusInvalidaError } from '../errors/ordem-servico.errors';
import { StatusOS, transicaoPermitida } from '../status-os';
import { ItemPecaOrdem, ItemServicoOrdem } from './item-ordem';

export interface OrdemServicoProps {
  id?: string;
  numero?: number;
  status?: StatusOS;
  clienteId: string;
  veiculoId: string;
  descricaoProblema?: string | null;
  diagnostico?: string | null;
  servicos?: ItemServicoOrdem[];
  pecas?: ItemPecaOrdem[];
  iniciadaEm?: Date | null;
  finalizadaEm?: Date | null;
  entregueEm?: Date | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class OrdemServico {
  readonly id?: string;
  readonly numero?: number;
  readonly clienteId: string;
  readonly veiculoId: string;
  private _status: StatusOS;
  private _descricaoProblema: string | null;
  private _diagnostico: string | null;
  private _servicos: ItemServicoOrdem[];
  private _pecas: ItemPecaOrdem[];
  private _servicosAdicionados: ItemServicoOrdem[] = [];
  private _pecasAdicionadas: ItemPecaOrdem[] = [];
  private _iniciadaEm: Date | null;
  private _finalizadaEm: Date | null;
  private _entregueEm: Date | null;
  readonly criadoEm: Date;

  constructor(props: OrdemServicoProps) {
    this.id = props.id;
    this.numero = props.numero;
    this.clienteId = props.clienteId;
    this.veiculoId = props.veiculoId;
    this._status = props.status ?? StatusOS.RECEBIDA;
    this._descricaoProblema = OrdemServico.normalizarTexto(
      props.descricaoProblema,
    );
    this._diagnostico = OrdemServico.normalizarTexto(props.diagnostico);
    this._servicos = props.servicos ?? [];
    this._pecas = props.pecas ?? [];
    this._iniciadaEm = props.iniciadaEm ?? null;
    this._finalizadaEm = props.finalizadaEm ?? null;
    this._entregueEm = props.entregueEm ?? null;
    this.criadoEm = props.criadoEm ?? new Date();
  }

  get status() {
    return this._status;
  }
  get descricaoProblema() {
    return this._descricaoProblema;
  }
  get diagnostico() {
    return this._diagnostico;
  }
  get servicos(): readonly ItemServicoOrdem[] {
    return this._servicos;
  }
  get pecas(): readonly ItemPecaOrdem[] {
    return this._pecas;
  }
  get iniciadaEm() {
    return this._iniciadaEm;
  }
  get finalizadaEm() {
    return this._finalizadaEm;
  }
  get entregueEm() {
    return this._entregueEm;
  }

  /** Itens incluídos nesta operação — é o que a persistência precisa inserir. */
  get servicosAdicionados(): readonly ItemServicoOrdem[] {
    return this._servicosAdicionados;
  }
  get pecasAdicionadas(): readonly ItemPecaOrdem[] {
    return this._pecasAdicionadas;
  }

  /** Soma dos itens já lançados na OS, usando os preços congelados no snapshot. */
  valorTotal(): number {
    const somar = (total: number, item: { subtotal(): number }) =>
      total + item.subtotal();

    return [...this._servicos, ...this._pecas].reduce(somar, 0);
  }

  /**
   * Move a OS pela máquina de estados, recusando saltos inválidos e carimbando
   * os marcos de tempo usados pelas métricas.
   */
  alterarStatus(novo: StatusOS, agora: Date = new Date()): void {
    if (!transicaoPermitida(this._status, novo)) {
      throw new TransicaoStatusInvalidaError(this._status, novo);
    }
    if (novo === this._status) return;

    this._status = novo;
    this.carimbarMarco(novo, agora);
  }

  adicionarServico(item: ItemServicoOrdem): void {
    this._servicos.push(item);
    this._servicosAdicionados.push(item);
  }

  adicionarPeca(item: ItemPecaOrdem): void {
    this._pecas.push(item);
    this._pecasAdicionadas.push(item);
  }

  alterarDescricaoProblema(descricaoProblema?: string | null): void {
    this._descricaoProblema = OrdemServico.normalizarTexto(descricaoProblema);
  }

  alterarDiagnostico(diagnostico?: string | null): void {
    this._diagnostico = OrdemServico.normalizarTexto(diagnostico);
  }

  private carimbarMarco(status: StatusOS, agora: Date): void {
    if (status === StatusOS.EM_EXECUCAO && !this._iniciadaEm) {
      this._iniciadaEm = agora;
    }
    if (status === StatusOS.FINALIZADA && !this._finalizadaEm) {
      this._finalizadaEm = agora;
    }
    if (status === StatusOS.ENTREGUE && !this._entregueEm) {
      this._entregueEm = agora;
    }
  }

  private static normalizarTexto(texto?: string | null): string | null {
    const normalizado = texto?.trim();
    return normalizado ? normalizado : null;
  }
}
