import { PerfilUsuario } from '@/shared/generated/prisma/enums';
import { PerfilCliente } from './perfil-autorizacao';

export type TipoToken = 'INTERNO' | typeof PerfilCliente;

export interface JwtPayloadBase {
  sub: string;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
  jti?: string;
}

/** Token emitido por `POST /auth/login` (funcionários internos). */
export interface JwtPayloadInterno extends JwtPayloadBase {
  tipo?: 'INTERNO';
  email: string;
  perfil: PerfilUsuario;
}

/** Token emitido por `POST /auth/cpf` (Function serverless). */
export interface JwtPayloadCliente extends JwtPayloadBase {
  tipo: typeof PerfilCliente;
  perfil: typeof PerfilCliente;
}

export type JwtPayload = JwtPayloadInterno | JwtPayloadCliente;

export function isTokenCliente(
  payload: JwtPayload,
): payload is JwtPayloadCliente {
  return payload.tipo === PerfilCliente || payload.perfil === PerfilCliente;
}

/**
 * Requisição HTTP depois de passar pelo `JwtAuthGuard`.
 */
export interface RequisicaoAutenticada {
  headers: { authorization?: string };
  user?: JwtPayload;
  params?: Record<string, string>;
}
