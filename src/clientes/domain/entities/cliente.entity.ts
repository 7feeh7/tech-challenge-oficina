import { apenasDigitos, ehCpfCnpjValido } from '@/common/validators/cpf-cnpj';
import {
  CpfCnpjClienteInvalidoError,
  EmailClienteInvalidoError,
  NomeClienteInvalidoError,
  TelefoneClienteInvalidoError,
} from '../errors/cliente.errors';

export interface ClienteProps {
  id?: string;
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Cliente {
  readonly id?: string;
  private _nome: string;
  private _cpfCnpj: string;
  private _email: string;
  private _telefone: string;
  readonly criadoEm: Date;
  private _atualizadoEm: Date;

  constructor(props: ClienteProps) {
    this.id = props.id;
    this._nome = Cliente.normalizarNome(props.nome);
    this._cpfCnpj = Cliente.normalizarCpfCnpj(props.cpfCnpj);
    this._email = Cliente.normalizarEmail(props.email);
    this._telefone = Cliente.normalizarTelefone(props.telefone);
    this.criadoEm = props.criadoEm ?? new Date();
    this._atualizadoEm = props.atualizadoEm ?? new Date();
  }

  get nome() {
    return this._nome;
  }
  get cpfCnpj() {
    return this._cpfCnpj;
  }
  get email() {
    return this._email;
  }
  get telefone() {
    return this._telefone;
  }
  get atualizadoEm() {
    return this._atualizadoEm;
  }

  alterarNome(nome: string): void {
    this._nome = Cliente.normalizarNome(nome);
    this.marcarComoAtualizado();
  }

  alterarCpfCnpj(cpfCnpj: string): void {
    this._cpfCnpj = Cliente.normalizarCpfCnpj(cpfCnpj);
    this.marcarComoAtualizado();
  }

  alterarEmail(email: string): void {
    this._email = Cliente.normalizarEmail(email);
    this.marcarComoAtualizado();
  }

  alterarTelefone(telefone: string): void {
    this._telefone = Cliente.normalizarTelefone(telefone);
    this.marcarComoAtualizado();
  }

  private marcarComoAtualizado(): void {
    this._atualizadoEm = new Date();
  }

  static normalizarNome(nome: string): string {
    const normalizado = nome?.trim().replace(/\s+/g, ' ');
    if (!normalizado || normalizado.length < 3 || normalizado.length > 100) {
      throw new NomeClienteInvalidoError();
    }
    return normalizado;
  }

  /** Documentos ficam só com dígitos, para que a unicidade não dependa da formatação. */
  static normalizarCpfCnpj(cpfCnpj: string): string {
    if (!ehCpfCnpjValido(cpfCnpj)) {
      throw new CpfCnpjClienteInvalidoError();
    }
    return apenasDigitos(cpfCnpj);
  }

  static normalizarEmail(email: string): string {
    const normalizado = email?.trim().toLowerCase();
    if (!normalizado || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) {
      throw new EmailClienteInvalidoError();
    }
    return normalizado;
  }

  static normalizarTelefone(telefone: string): string {
    const normalizado = telefone?.trim();
    if (!normalizado || !/^\+?[\d\s\-().]{8,20}$/.test(normalizado)) {
      throw new TelefoneClienteInvalidoError();
    }
    return normalizado;
  }
}
