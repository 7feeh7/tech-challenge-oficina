import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { ClienteConsultaGateway } from '../../application/ports/cliente-consulta.gateway';

@Injectable()
export class PrismaClienteConsultaGateway implements ClienteConsultaGateway {
  constructor(private readonly prisma: PrismaService) {}

  async existe(clienteId: string): Promise<boolean> {
    const raw = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true },
    });
    return raw !== null;
  }
}
