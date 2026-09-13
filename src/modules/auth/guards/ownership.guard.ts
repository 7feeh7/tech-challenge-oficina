import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  OWNERSHIP_KEY,
  OwnershipResource,
} from '../decorators/ownership.decorator';
import { isTokenCliente, RequisicaoAutenticada } from '../jwt-payload';

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<OwnershipResource>(
      OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!resource) return true;

    const request = context.switchToHttp().getRequest<RequisicaoAutenticada>();
    const user = request.user;

    if (!user || !isTokenCliente(user)) return true;

    const resourceId = request.params?.id;
    if (!resourceId) {
      throw new ForbiddenException('Recurso não identificado.');
    }

    const clienteId = await this.resolverClienteId(resource, resourceId);
    if (!clienteId || clienteId !== user.sub) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso.',
      );
    }

    return true;
  }

  private async resolverClienteId(
    resource: OwnershipResource,
    resourceId: string,
  ): Promise<string | null> {
    if (resource === OwnershipResource.ORDEM_SERVICO) {
      const ordem = await this.prisma.ordemServico.findUnique({
        where: { id: resourceId },
        select: { clienteId: true },
      });
      return ordem?.clienteId ?? null;
    }

    const orcamento = await this.prisma.orcamento.findUnique({
      where: { id: resourceId },
      select: { ordemServico: { select: { clienteId: true } } },
    });

    return orcamento?.ordemServico.clienteId ?? null;
  }
}
