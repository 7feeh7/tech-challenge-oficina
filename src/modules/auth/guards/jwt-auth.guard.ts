import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  JwtPayload,
  JwtPayloadCliente,
  RequisicaoAutenticada,
  isTokenCliente,
} from '../jwt-payload';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequisicaoAutenticada>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token de autenticação não fornecido.');
    }

    try {
      const payload = await this.verifyToken(token);
      this.validarClaims(payload);
      request.user = payload;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    return true;
  }

  private async verifyToken(token: string): Promise<JwtPayload> {
    const secret = this.configService.get<string>('JWT_SECRET');

    return this.jwtService.verifyAsync<JwtPayload>(token, { secret });
  }

  private validarClaims(payload: JwtPayload): void {
    if (isTokenCliente(payload)) {
      this.validarTokenCliente(payload);
      return;
    }

    if (!payload.email || !payload.perfil) {
      throw new UnauthorizedException('Token interno inválido.');
    }
  }

  private validarTokenCliente(payload: JwtPayloadCliente): void {
    const issuer = this.configService.get<string>('JWT_ISSUER');
    const audience = this.configService.get<string>('JWT_AUDIENCE');

    if (issuer && payload.iss !== issuer) {
      throw new UnauthorizedException('Issuer inválido.');
    }

    if (audience) {
      const aud = payload.aud;
      const audiences = Array.isArray(aud) ? aud : aud ? [aud] : [];
      if (!audiences.includes(audience)) {
        throw new UnauthorizedException('Audience inválida.');
      }
    }

    if (payload.tipo !== 'CLIENTE' || payload.perfil !== 'CLIENTE') {
      throw new UnauthorizedException('Token de cliente inválido.');
    }
  }

  private extractTokenFromHeader(request: {
    headers: { authorization?: string };
  }): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
