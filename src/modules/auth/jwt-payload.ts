import { PerfilUsuario } from '@/shared/generated/prisma/enums';

/** Conteúdo do JWT assinado em `AuthService.login`. */
export interface JwtPayload {
  sub: string;
  email: string;
  perfil: PerfilUsuario;
}

/**
 * Requisição HTTP depois de passar pelo `JwtAuthGuard`.
 *
 * `getRequest()` do Nest devolve `any` por padrão, o que contamina tudo que
 * encosta nele. Tipar aqui é o que permite ler `request.user.perfil` com
 * segurança nos guards e controllers.
 */
export interface RequisicaoAutenticada {
  headers: { authorization?: string };
  user?: JwtPayload;
}
