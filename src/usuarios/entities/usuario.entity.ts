import { PerfilUsuario } from '../domain/perfil-usuario';
import {
  EmailUsuarioInvalidoError,
  NomeUsuarioInvalidoError,
  SenhaHashInvalidaError,
} from '../domain/usuario.errors';

export interface UsuarioProps {
  id?: string;
  nome: string;
  email: string;
  senhaHash: string;
  perfil: PerfilUsuario;
  ativo?: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Usuario {
  readonly id?: string;
  private _nome: string;
  private _email: string;
  private _senhaHash: string;
  private _perfil: PerfilUsuario;
  private _ativo: boolean;
  readonly criadoEm: Date;
  private _atualizadoEm: Date;

  constructor(props: UsuarioProps) {
    const nome = Usuario.normalizarNome(props.nome);
    const email = Usuario.normalizarEmail(props.email);
    Usuario.validarSenhaHash(props.senhaHash);

    this.id = props.id;
    this._nome = nome;
    this._email = email;
    this._senhaHash = props.senhaHash;
    this._perfil = props.perfil;
    this._ativo = props.ativo ?? true;
    this.criadoEm = props.criadoEm ?? new Date();
    this._atualizadoEm = props.atualizadoEm ?? new Date();
  }

  get nome() {
    return this._nome;
  }
  get email() {
    return this._email;
  }
  get senhaHash() {
    return this._senhaHash;
  }
  get perfil() {
    return this._perfil;
  }
  get ativo() {
    return this._ativo;
  }
  get atualizadoEm() {
    return this._atualizadoEm;
  }

  alterarNome(nome: string): void {
    this._nome = Usuario.normalizarNome(nome);
    this.marcarComoAtualizado();
  }

  alterarEmail(email: string): void {
    this._email = Usuario.normalizarEmail(email);
    this.marcarComoAtualizado();
  }

  alterarSenhaHash(senhaHash: string): void {
    Usuario.validarSenhaHash(senhaHash);
    this._senhaHash = senhaHash;
    this.marcarComoAtualizado();
  }

  alterarPerfil(perfil: PerfilUsuario): void {
    this._perfil = perfil;
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

  private static normalizarNome(nome: string): string {
    const normalizado = nome?.trim().replace(/\s+/g, ' ');
    if (!normalizado || normalizado.length < 3 || normalizado.length > 100) {
      throw new NomeUsuarioInvalidoError();
    }
    return normalizado;
  }

  private static normalizarEmail(email: string): string {
    const normalizado = email?.trim().toLowerCase();
    if (!normalizado || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) {
      throw new EmailUsuarioInvalidoError();
    }
    return normalizado;
  }

  private static validarSenhaHash(senhaHash: string): void {
    if (!senhaHash?.trim()) throw new SenhaHashInvalidaError();
  }
}
