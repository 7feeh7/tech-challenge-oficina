import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CHAMADOR_INTERNO_KEY } from '../decorators/chamador-interno.decorator';
import { ROTA_INTERNA_KEY } from '../decorators/rota-interna.decorator';
import { RelacaoChamadorInterno } from '../relacao-chamador-interno';
import { compararTokenSeguro } from '../comparar-token-seguro';

const ENV_POR_RELACAO: Record<RelacaoChamadorInterno, string> = {
  [RelacaoChamadorInterno.BILLING]: 'TOKEN_BILLING_OS',
  [RelacaoChamadorInterno.EXECUTION]: 'TOKEN_EXECUTION_OS',
  [RelacaoChamadorInterno.AUTH_CPF]: 'TOKEN_AUTH_CPF_OS',
};

@Injectable()
export class TokenChamadorInternoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rotaInterna = this.reflector.getAllAndOverride<boolean>(
      ROTA_INTERNA_KEY,
      [context.getHandler(), context.getClass()],
    );
    const relacao = this.reflector.getAllAndOverride<RelacaoChamadorInterno>(
      CHAMADOR_INTERNO_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!relacao) {
      if (rotaInterna || this.caminhoEhInterno(context)) {
        throw new UnauthorizedException(
          'Rota interna sem metadado de chamador.',
        );
      }
      return true;
    }

    const tokenRecebido = this.extrairBearer(context);
    if (!tokenRecebido) {
      throw new UnauthorizedException(
        'Token de chamador interno não fornecido.',
      );
    }

    const chaveEnv = ENV_POR_RELACAO[relacao];
    const tokenEsperado = this.configService.get<string>(chaveEnv)?.trim();
    if (!tokenEsperado) {
      throw new UnauthorizedException(
        'Configuração de token de chamador ausente.',
      );
    }

    if (!compararTokenSeguro(tokenRecebido, tokenEsperado)) {
      throw new UnauthorizedException('Token de chamador interno inválido.');
    }

    return true;
  }

  private extrairBearer(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      url?: string;
      raw?: { url?: string };
    }>();
    const [tipo, valor] = request.headers.authorization?.split(' ') ?? [];
    return tipo === 'Bearer' && valor ? valor : undefined;
  }

  private caminhoEhInterno(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      url?: string;
      raw?: { url?: string };
    }>();
    const bruto = request.raw?.url ?? request.url ?? '';
    const caminho = bruto.split('?')[0] ?? '';
    return caminho === '/internal' || caminho.startsWith('/internal/');
  }
}
