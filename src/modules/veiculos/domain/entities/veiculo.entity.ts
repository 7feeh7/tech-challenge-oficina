import {
  AnoVeiculoInvalidoError,
  ClienteDoVeiculoObrigatorioError,
  MarcaVeiculoInvalidaError,
  ModeloVeiculoInvalidoError,
  PlacaVeiculoInvalidaError,
} from '../errors/veiculo.errors';

export interface VeiculoProps {
  id?: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  clienteId: string;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

/** Aceita tanto o padrão antigo (ABC1234) quanto o Mercosul (ABC1D23). */
const FORMATO_PLACA = /^[A-Z]{3}\d[A-Z\d]\d{2}$/;
const ANO_MINIMO = 1886;

export class Veiculo {
  readonly id?: string;
  private _placa: string;
  private _marca: string;
  private _modelo: string;
  private _ano: number;
  private _clienteId: string;
  readonly criadoEm: Date;
  private _atualizadoEm: Date;

  constructor(props: VeiculoProps) {
    this.id = props.id;
    this._placa = Veiculo.normalizarPlaca(props.placa);
    this._marca = Veiculo.normalizarMarca(props.marca);
    this._modelo = Veiculo.normalizarModelo(props.modelo);
    this._ano = Veiculo.validarAno(props.ano);
    this._clienteId = Veiculo.validarClienteId(props.clienteId);
    this.criadoEm = props.criadoEm ?? new Date();
    this._atualizadoEm = props.atualizadoEm ?? new Date();
  }

  get placa() {
    return this._placa;
  }
  get marca() {
    return this._marca;
  }
  get modelo() {
    return this._modelo;
  }
  get ano() {
    return this._ano;
  }
  get clienteId() {
    return this._clienteId;
  }
  get atualizadoEm() {
    return this._atualizadoEm;
  }

  alterarPlaca(placa: string): void {
    this._placa = Veiculo.normalizarPlaca(placa);
    this.marcarComoAtualizado();
  }

  alterarMarca(marca: string): void {
    this._marca = Veiculo.normalizarMarca(marca);
    this.marcarComoAtualizado();
  }

  alterarModelo(modelo: string): void {
    this._modelo = Veiculo.normalizarModelo(modelo);
    this.marcarComoAtualizado();
  }

  alterarAno(ano: number): void {
    this._ano = Veiculo.validarAno(ano);
    this.marcarComoAtualizado();
  }

  transferirParaCliente(clienteId: string): void {
    this._clienteId = Veiculo.validarClienteId(clienteId);
    this.marcarComoAtualizado();
  }

  private marcarComoAtualizado(): void {
    this._atualizadoEm = new Date();
  }

  /** A placa é guardada em caixa alta e sem separadores, para que a unicidade não dependa da digitação. */
  static normalizarPlaca(placa: string): string {
    const normalizada = placa
      ?.trim()
      .toUpperCase()
      .replace(/[^A-Z\d]/g, '');
    if (!normalizada || !FORMATO_PLACA.test(normalizada)) {
      throw new PlacaVeiculoInvalidaError();
    }
    return normalizada;
  }

  static normalizarMarca(marca: string): string {
    const normalizada = marca?.trim().replace(/\s+/g, ' ');
    if (!normalizada || normalizada.length < 2 || normalizada.length > 50) {
      throw new MarcaVeiculoInvalidaError();
    }
    return normalizada;
  }

  static normalizarModelo(modelo: string): string {
    const normalizado = modelo?.trim().replace(/\s+/g, ' ');
    if (!normalizado || normalizado.length > 50) {
      throw new ModeloVeiculoInvalidoError();
    }
    return normalizado;
  }

  static anoMaximoPermitido(): number {
    return new Date().getFullYear() + 1;
  }

  private static validarAno(ano: number): number {
    const anoMaximo = Veiculo.anoMaximoPermitido();
    if (!Number.isInteger(ano) || ano < ANO_MINIMO || ano > anoMaximo) {
      throw new AnoVeiculoInvalidoError(anoMaximo);
    }
    return ano;
  }

  private static validarClienteId(clienteId: string): string {
    const normalizado = clienteId?.trim();
    if (!normalizado) {
      throw new ClienteDoVeiculoObrigatorioError();
    }
    return normalizado;
  }
}
