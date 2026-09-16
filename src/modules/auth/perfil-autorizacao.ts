import { PerfilUsuario } from '@/shared/generated/prisma/enums';

/** Perfil exclusivo de tokens emitidos pela Function de autenticação por CPF. */
export const PerfilCliente = 'CLIENTE' as const;

export type PerfilAutorizacao = PerfilUsuario | typeof PerfilCliente;

export function isPerfilCliente(
  perfil: PerfilAutorizacao,
): perfil is typeof PerfilCliente {
  return perfil === PerfilCliente;
}
