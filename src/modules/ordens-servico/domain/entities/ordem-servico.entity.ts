import { randomUUID } from 'crypto';
import {
  DesistenciaNaoPermitidaError,
  DevolucaoTarefaFilaNaoPermitidaError,
  ItensOficiaisNaoEditaveisError,
  MotivoDesistenciaObrigatorioError,
  PatchOrdemServicoNaoPermitidoError,
  QuantidadeItemInvalidaError,
  RetiradaNaoPermitidaError,
  TransicaoStatusInvalidaError,
} from '../errors/ordem-servico.errors';
import {
  desistenciaPermitida,
  itensOficiaisEditaveis,
  patchDescricaoProblemaPermitido,
  prioridadeFilaDoStatus,
  StatusOS,
  transicaoPermitida,
} from '../status-os';
import { ItemPecaOrdem, ItemServicoOrdem } from './item-ordem';

export interface SugestaoItemOrdem {
  tipo: 'PECA' | 'SERVICO';
  itemId: string;
  quantidade: number;
}

export interface OrdemServicoProps {
  id?: string;
  numero?: number;
  status?: StatusOS;
  rodadaVigente?: number;
  prioridadeFila?: number;
  correlationId?: string;
  clienteId: string;
  veiculoId: string;
  descricaoProblema?: string | null;
  diagnostico?: string | null;
  diagnosticoConcluidoEm?: Date | null;
  etapaOrigemCancelamento?: StatusOS | null;
  motivoEncerramento?: string | null;
  veiculoLiberadoRetirada?: boolean;
  devolvidaEm?: Date | null;
  prazoReferenciaReserva?: Date | null;
  servicos?: ItemServicoOrdem[];
  pecas?: ItemPecaOrdem[];
  sugestoes?: SugestaoItemOrdem[];
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
  private _correlationId: string;
  private _status: StatusOS;
  private _rodadaVigente: number;
  private _prioridadeFila: number;
  private _descricaoProblema: string | null;
  private _diagnostico: string | null;
  private _diagnosticoConcluidoEm: Date | null;
  private _etapaOrigemCancelamento: StatusOS | null;
  private _motivoEncerramento: string | null;
  private _veiculoLiberadoRetirada: boolean;
  private _devolvidaEm: Date | null;
  private _prazoReferenciaReserva: Date | null;
  private _servicos: ItemServicoOrdem[];
  private _pecas: ItemPecaOrdem[];
  private _sugestoes: SugestaoItemOrdem[];
  private _servicosAdicionados: ItemServicoOrdem[] = [];
  private _pecasAdicionadas: ItemPecaOrdem[] = [];
  private _itensOficiaisSubstituidos = false;
  private _iniciadaEm: Date | null;
  private _finalizadaEm: Date | null;
  private _entregueEm: Date | null;
  readonly criadoEm: Date;

  constructor(props: OrdemServicoProps) {
    this.id = props.id;
    this.numero = props.numero;
    this.clienteId = props.clienteId;
    this.veiculoId = props.veiculoId;
    this._correlationId = props.correlationId ?? randomUUID();
    this._status = props.status ?? StatusOS.RECEBIDA;
    this._rodadaVigente = props.rodadaVigente ?? 1;
    this._prioridadeFila =
      props.prioridadeFila ?? prioridadeFilaDoStatus(this._status);
    this._descricaoProblema = OrdemServico.normalizarTexto(
      props.descricaoProblema,
    );
    this._diagnostico = OrdemServico.normalizarTexto(props.diagnostico);
    this._diagnosticoConcluidoEm = props.diagnosticoConcluidoEm ?? null;
    this._etapaOrigemCancelamento = props.etapaOrigemCancelamento ?? null;
    this._motivoEncerramento = OrdemServico.normalizarTexto(
      props.motivoEncerramento,
    );
    this._veiculoLiberadoRetirada = props.veiculoLiberadoRetirada ?? false;
    this._devolvidaEm = props.devolvidaEm ?? null;
    this._prazoReferenciaReserva = props.prazoReferenciaReserva ?? null;
    this._servicos = props.servicos ?? [];
    this._pecas = props.pecas ?? [];
    this._sugestoes = props.sugestoes ?? [];
    this._iniciadaEm = props.iniciadaEm ?? null;
    this._finalizadaEm = props.finalizadaEm ?? null;
    this._entregueEm = props.entregueEm ?? null;
    this.criadoEm = props.criadoEm ?? new Date();
  }

  get correlationId() {
    return this._correlationId;
  }
  get status() {
    return this._status;
  }
  get rodadaVigente() {
    return this._rodadaVigente;
  }
  get prioridadeFila() {
    return this._prioridadeFila;
  }
  get descricaoProblema() {
    return this._descricaoProblema;
  }
  get diagnostico() {
    return this._diagnostico;
  }
  get diagnosticoConcluidoEm() {
    return this._diagnosticoConcluidoEm;
  }
  get etapaOrigemCancelamento() {
    return this._etapaOrigemCancelamento;
  }
  get motivoEncerramento() {
    return this._motivoEncerramento;
  }
  get veiculoLiberadoRetirada() {
    return this._veiculoLiberadoRetirada;
  }
  get devolvidaEm() {
    return this._devolvidaEm;
  }
  get prazoReferenciaReserva() {
    return this._prazoReferenciaReserva;
  }
  get servicos(): readonly ItemServicoOrdem[] {
    return this._servicos;
  }
  get pecas(): readonly ItemPecaOrdem[] {
    return this._pecas;
  }
  get sugestoes(): readonly SugestaoItemOrdem[] {
    return this._sugestoes;
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

  get servicosAdicionados(): readonly ItemServicoOrdem[] {
    return this._servicosAdicionados;
  }
  get pecasAdicionadas(): readonly ItemPecaOrdem[] {
    return this._pecasAdicionadas;
  }
  get itensOficiaisSubstituidos(): boolean {
    return this._itensOficiaisSubstituidos;
  }

  valorTotal(): number {
    const somar = (total: number, item: { subtotal(): number }) =>
      total + item.subtotal();
    return [...this._servicos, ...this._pecas].reduce(somar, 0);
  }

  registrarDiagnosticoIniciado(agora: Date = new Date()): void {
    this.transicionarPara(StatusOS.EM_DIAGNOSTICO, agora);
  }

  registrarDevolucaoTarefaParaFila(agora: Date = new Date()): void {
    if (
      this._rodadaVigente !== 1 ||
      this._status !== StatusOS.EM_DIAGNOSTICO ||
      this._diagnosticoConcluidoEm
    ) {
      throw new DevolucaoTarefaFilaNaoPermitidaError();
    }
    this.transicionarPara(StatusOS.RECEBIDA, agora);
  }

  registrarOrcamentoGerado(agora: Date = new Date()): void {
    this.transicionarPara(StatusOS.AGUARDANDO_APROVACAO, agora);
  }

  registrarOrcamentoRejeitado(agora: Date = new Date()): void {
    if (this._status !== StatusOS.AGUARDANDO_APROVACAO) {
      throw new TransicaoStatusInvalidaError(
        this._status,
        StatusOS.EM_DIAGNOSTICO,
      );
    }
    this.transicionarPara(StatusOS.EM_DIAGNOSTICO, agora);
    this.abrirNovaRodada();
  }

  registrarReservaConfirmada(
    prazoReferencia: Date | null,
    agora: Date = new Date(),
  ): void {
    this._prazoReferenciaReserva = prazoReferencia;
    this.transicionarPara(StatusOS.AGUARDANDO_PAGAMENTO, agora);
  }

  registrarPagamentoConfirmado(agora: Date = new Date()): void {
    this.transicionarPara(StatusOS.AGUARDANDO_EXECUCAO, agora);
  }

  registrarReparoIniciado(agora: Date = new Date()): void {
    this.transicionarPara(StatusOS.EM_EXECUCAO, agora);
  }

  registrarReparoConcluido(agora: Date = new Date()): void {
    this.transicionarPara(StatusOS.FINALIZADA, agora);
  }

  registrarDesistencia(motivo: string, agora: Date = new Date()): void {
    const motivoNormalizado = OrdemServico.normalizarTexto(motivo);
    if (!motivoNormalizado) {
      throw new MotivoDesistenciaObrigatorioError();
    }
    // Repetir a desistência é idempotente e preserva o primeiro motivo (D2.12).
    if (this._status === StatusOS.EM_CANCELAMENTO) {
      return;
    }
    if (!desistenciaPermitida(this._status)) {
      throw new DesistenciaNaoPermitidaError(this._status);
    }
    this._etapaOrigemCancelamento = this._status;
    this._motivoEncerramento = motivoNormalizado;
    this.transicionarPara(StatusOS.EM_CANCELAMENTO, agora);
  }

  registrarCancelamentoConcluido(agora: Date = new Date()): void {
    this.transicionarPara(StatusOS.CANCELADA, agora);
  }

  registrarExcecaoReparoConcluidoAntesCancelamento(
    agora: Date = new Date(),
  ): void {
    this.transicionarPara(StatusOS.FINALIZADA, agora);
  }

  /**
   * Retirada única (D2.6): em FINALIZADA entrega o veículo; em cancelamento só
   * registra a devolução física, sem mudar o status. Idempotente.
   */
  registrarRetirada(agora: Date = new Date()): void {
    if (this._status === StatusOS.ENTREGUE) {
      return;
    }
    if (this._status === StatusOS.FINALIZADA) {
      this.transicionarPara(StatusOS.ENTREGUE, agora);
      return;
    }
    if (
      this._status !== StatusOS.EM_CANCELAMENTO &&
      this._status !== StatusOS.CANCELADA
    ) {
      throw new RetiradaNaoPermitidaError(
        `A retirada não é permitida no status ${this._status}.`,
      );
    }
    if (!this._veiculoLiberadoRetirada) {
      throw new RetiradaNaoPermitidaError(
        'O veículo ainda não está liberado para retirada.',
      );
    }
    if (!this._devolvidaEm) {
      this._devolvidaEm = agora;
    }
  }

  marcarVeiculoLiberadoParaRetirada(): void {
    this._veiculoLiberadoRetirada = true;
  }

  alterarDescricaoProblema(descricaoProblema?: string | null): void {
    if (
      !patchDescricaoProblemaPermitido(
        this._status,
        Boolean(this._diagnosticoConcluidoEm),
      )
    ) {
      throw new PatchOrdemServicoNaoPermitidoError(
        'Só é permitido alterar a descrição do problema em RECEBIDA, antes da conclusão do diagnóstico.',
      );
    }
    this._descricaoProblema = OrdemServico.normalizarTexto(descricaoProblema);
  }

  adicionarSugestao(sugestao: SugestaoItemOrdem): void {
    if (this._status !== StatusOS.RECEBIDA) {
      throw new PatchOrdemServicoNaoPermitidoError(
        'Sugestões só podem ser informadas na abertura.',
      );
    }
    if (!Number.isInteger(sugestao.quantidade) || sugestao.quantidade < 1) {
      throw new QuantidadeItemInvalidaError();
    }

    const existente = this._sugestoes.find(
      (item) => item.tipo === sugestao.tipo && item.itemId === sugestao.itemId,
    );
    if (existente) {
      existente.quantidade += sugestao.quantidade;
      return;
    }
    this._sugestoes.push({ ...sugestao });
  }

  adicionarServicoOficial(item: ItemServicoOrdem): void {
    this.garantirItensEditaveis();
    this._servicos.push(item);
    this._servicosAdicionados.push(item);
  }

  adicionarPecaOficial(item: ItemPecaOrdem): void {
    this.garantirItensEditaveis();
    this._pecas.push(item);
    this._pecasAdicionadas.push(item);
  }

  substituirItensOficiais(
    servicos: ItemServicoOrdem[],
    pecas: ItemPecaOrdem[],
  ): void {
    this.garantirItensEditaveis();
    this._servicos = [...servicos];
    this._pecas = [...pecas];
    this._servicosAdicionados = [...servicos];
    this._pecasAdicionadas = [...pecas];
    this._itensOficiaisSubstituidos = true;
  }

  concluirDiagnostico(laudo: string, agora: Date): void {
    if (
      this._status !== StatusOS.EM_DIAGNOSTICO ||
      this._diagnosticoConcluidoEm
    ) {
      throw new ItensOficiaisNaoEditaveisError();
    }
    const texto = OrdemServico.normalizarTexto(laudo);
    if (!texto) {
      throw new PatchOrdemServicoNaoPermitidoError(
        'O laudo do diagnóstico é obrigatório na conclusão.',
      );
    }
    this._diagnostico = texto;
    this._diagnosticoConcluidoEm = agora;
  }

  // Os itens da rodada anterior ficam até a conclusão do novo diagnóstico, que os
  // substitui: item mantido conserva o preço congelado e só assim dá para saber (D1.7).
  private abrirNovaRodada(): void {
    this._rodadaVigente += 1;
    this._diagnosticoConcluidoEm = null;
  }

  private garantirItensEditaveis(): void {
    if (
      !itensOficiaisEditaveis(
        this._status,
        Boolean(this._diagnosticoConcluidoEm),
      )
    ) {
      throw new ItensOficiaisNaoEditaveisError();
    }
  }

  private transicionarPara(novo: StatusOS, agora: Date): void {
    if (!transicaoPermitida(this._status, novo)) {
      throw new TransicaoStatusInvalidaError(this._status, novo);
    }
    if (novo === this._status) return;

    this._status = novo;
    this._prioridadeFila = prioridadeFilaDoStatus(novo);
    this.carimbarMarco(novo, agora);
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
